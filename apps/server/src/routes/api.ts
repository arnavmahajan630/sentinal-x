import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Config } from '@sentinelx/engine';
import {
  models,
  indexProject,
  buildGraph,
  createFactEngine,
  getKnowledge,
  runAssessment,
  runAgentOnDemand,
  ChangeEngine,
  ProjectWatcher,
  verify,
  buildFinding,
  attachAttackPath,
  isSchedulerOwned,
} from '@sentinelx/engine';
import { sseManager } from '../sse/events';

const execFileAsync = promisify(execFile);

function detectTags(dirPath: string): string[] {
  const tags: string[] = [];
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.express) tags.push('Express');
      if (deps.react || deps['react-dom']) tags.push('React');
      if (deps.mongoose || deps.mongodb) tags.push('MongoDB');
      if (deps.next) tags.push('Next.js');
      if (deps.typescript) tags.push('TypeScript');
      else tags.push('Node.js');
    }
  } catch {
    // fallback
  }
  return tags.length > 0 ? tags : ['Express', 'Node.js', 'MongoDB'];
}

function formatAnalyzedAgo(date?: Date | string | null): string {
  if (!date) return 'Never analyzed';
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `Analyzed ${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Analyzed ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Analyzed ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// Map of active project watchers
const activeWatchers = new Map<string, ProjectWatcher>();

export function createApiRouter(cfg: Config): Router {
  const router = Router();
  const changeEngine = new ChangeEngine(cfg);

  // Helper to resolve project ID aliases (e.g. demo-vuln-mern -> 4a8462e0dca6)
  async function resolveTargetProjectId(raw?: string | null): Promise<string> {
    if (!raw || raw === 'undefined' || raw === 'null') {
      const p = await models.projects.findOne({ status: 'indexed' }).sort({ indexedAt: -1 }).lean();
      return (p as any)?.projectId || '4a8462e0dca6';
    }
    const exact = await models.projects.findOne({ projectId: raw }).lean();
    if (exact) return (exact as any).projectId;

    const byName = await models.projects.findOne({ name: raw }).lean();
    if (byName) return (byName as any).projectId;

    if (raw === 'demo-vuln-mern' || raw === 'vulnerable-mern-app') {
      const sandboxTarget = await models.projects.findOne({ name: 'sandbox-target' }).lean();
      if (sandboxTarget) return (sandboxTarget as any).projectId;
    }

    const latest = await models.projects.findOne({ status: 'indexed' }).sort({ indexedAt: -1 }).lean();
    return (latest as any)?.projectId || raw;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Projects
  // ──────────────────────────────────────────────────────────────────────────

  // List all indexed projects with dynamic findings and run statistics
  router.get('/projects', async (_req, res) => {
    try {
      const docs = await models.projects.find().sort({ indexedAt: -1 }).lean();
      if (!docs || docs.length === 0) {
        return res.json([]);
      }

      const enriched = await Promise.all(
        docs.map(async (doc: any) => {
          const findings = await models.findings.find({ projectId: doc.projectId, status: 'open' }).lean();
          const runsCount = await models.agent_runs.countDocuments({ projectId: doc.projectId });
          const latestRun = await models.agent_runs.findOne({ projectId: doc.projectId }).sort({ startedAt: -1 }).lean();

          const findingsCount = findings.length;
          const criticalCount = findings.filter((f: any) => f.severity === 'critical').length;
          const highCount = findings.filter((f: any) => f.severity === 'high').length;
          const mediumCount = findings.filter((f: any) => f.severity === 'medium').length;
          const lowCount = findings.filter((f: any) => f.severity === 'low').length;
          const hasBeenRun = runsCount > 0 || (doc as any).hasBeenRun === true;

          return {
            ...doc,
            findingsCount,
            criticalCount,
            highCount,
            mediumCount,
            lowCount,
            hasBeenRun,
            analyzedAgo: hasBeenRun ? formatAnalyzedAgo((latestRun as any)?.finishedAt || (latestRun as any)?.startedAt || doc.indexedAt) : 'Never analyzed',
            type: doc.type || (doc.gitUrl ? 'github' : 'local'),
            description: doc.description || (doc.name === 'vulnerable-mern-app' || doc.name === 'sandbox-target'
              ? 'Deliberately vulnerable MERN application for security testing and research.'
              : 'Application repository indexed by Sentinel-X agentic security engine.'),
            tags: doc.tags && doc.tags.length > 0 ? doc.tags : ['Express', 'React', 'Node.js', 'MongoDB'],
          };
        }),
      );

      res.json(enriched);
    } catch {
      res.json([]);
    }
  });

  // Get active or specified project
  router.get('/project', async (req, res) => {
    try {
      const rawId = req.query.projectId as string | undefined;
      const targetId = await resolveTargetProjectId(rawId);
      const doc = await models.projects.findOne({ projectId: targetId }).lean();
      if (!doc) {
        return res.status(404).json({ error: 'No project found' });
      }

      const findings = await models.findings.find({ projectId: targetId, status: 'open' }).lean();
      const runsCount = await models.agent_runs.countDocuments({ projectId: targetId });
      const hasBeenRun = runsCount > 0 || (doc as any).hasBeenRun === true;

      res.json({
        ...doc,
        findingsCount: findings.length,
        criticalCount: findings.filter((f: any) => f.severity === 'critical').length,
        highCount: findings.filter((f: any) => f.severity === 'high').length,
        mediumCount: findings.filter((f: any) => f.severity === 'medium').length,
        lowCount: findings.filter((f: any) => f.severity === 'low').length,
        hasBeenRun,
        analyzedAgo: hasBeenRun ? formatAnalyzedAgo((doc as any).indexedAt) : 'Never analyzed',
        type: (doc as any).type || ((doc as any).gitUrl ? 'github' : 'local'),
        tags: (doc as any).tags || ['Express', 'React', 'Node.js', 'MongoDB'],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Load / index a new or existing local project repository
  router.post('/project/load', async (req, res) => {
    try {
      const { path: rawPath, name: customName, force } = req.body;
      if (!rawPath) {
        return res.status(400).json({ error: 'Missing path parameter' });
      }

      let resolved: string | null = null;
      const candidates = [
        rawPath,
        path.resolve(rawPath),
        path.resolve(process.cwd(), rawPath),
        path.resolve('/app', rawPath),
        path.resolve('/workspace', rawPath),
        path.join('/workspace', rawPath),
      ];

      if (rawPath.includes('vuln-mern') || rawPath.includes('sandbox-target')) {
        candidates.unshift('/app/sandbox-target');
        candidates.unshift('/workspace/packages/engine/test/fixtures/vuln-mern');
        candidates.unshift(path.resolve(process.cwd(), 'packages/engine/test/fixtures/vuln-mern'));
      }

      for (const c of candidates) {
        if (c && fs.existsSync(c)) {
          try {
            if (fs.statSync(c).isDirectory()) {
              resolved = c;
              break;
            }
          } catch {}
        }
      }

      if (!resolved) {
        return res.status(404).json({ error: `Path does not exist: ${rawPath}` });
      }

      const idxResult = await indexProject(resolved, { force: Boolean(force) });
      const graphResult = await buildGraph(idxResult.projectId);

      const projectName = customName?.trim() || (resolved.includes('vuln-mern') || resolved.includes('sandbox-target') ? 'vulnerable-mern-app' : path.basename(resolved));
      const tags = detectTags(resolved);
      const description = (projectName === 'vulnerable-mern-app')
        ? 'Deliberately vulnerable MERN application for security testing and research.'
        : `Local repository indexed from ${resolved}`;

      await models.projects.updateOne(
        { projectId: idxResult.projectId },
        {
          $set: {
            name: projectName,
            type: 'local',
            description,
            tags,
            hasBeenRun: false,
          },
        },
      );

      const project = await models.projects.findOne({ projectId: idxResult.projectId }).lean();
      res.json({
        success: true,
        project: {
          ...project,
          findingsCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          hasBeenRun: false,
          analyzedAgo: 'Never analyzed',
          type: 'local',
          tags,
          description,
        },
        stats: idxResult.stats,
        graph: { nodes: graphResult.nodes, edges: graphResult.edges },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clone and index a repository from Git URL
  router.post('/project/clone', async (req, res) => {
    try {
      const { gitUrl, name: customName, branch } = req.body;
      if (!gitUrl || typeof gitUrl !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid gitUrl parameter' });
      }

      const cloneBase = path.resolve(process.cwd(), 'cloned_repos');
      if (!fs.existsSync(cloneBase)) {
        fs.mkdirSync(cloneBase, { recursive: true });
      }

      const rawRepoName = path.basename(gitUrl.trim(), '.git').replace(/[^a-zA-Z0-9_-]/g, '_');
      const uniqueSuffix = Date.now().toString(36);
      const targetDir = path.join(cloneBase, `${rawRepoName}_${uniqueSuffix}`);

      const args = ['clone', '--depth', '1'];
      if (branch) {
        args.push('--branch', branch);
      }
      args.push(gitUrl.trim(), targetDir);

      await execFileAsync('git', args, { timeout: 60000 });

      const idxResult = await indexProject(targetDir);
      const graphResult = await buildGraph(idxResult.projectId);

      const projectName = customName?.trim() || path.basename(gitUrl.trim(), '.git');
      const tags = detectTags(targetDir);
      if (!tags.includes('Git')) tags.unshift('Git');

      await models.projects.updateOne(
        { projectId: idxResult.projectId },
        {
          $set: {
            name: projectName,
            type: 'github',
            gitUrl: gitUrl.trim(),
            gitBranch: branch || 'main',
            description: `Cloned from ${gitUrl.trim()}`,
            tags,
            hasBeenRun: false,
          },
        },
      );

      const project = await models.projects.findOne({ projectId: idxResult.projectId }).lean();
      res.json({
        success: true,
        project: {
          ...project,
          findingsCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          hasBeenRun: false,
          analyzedAgo: 'Never analyzed',
          type: 'github',
          tags,
          description: `Cloned from ${gitUrl.trim()}`,
        },
        stats: idxResult.stats,
        graph: { nodes: graphResult.nodes, edges: graphResult.edges },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Browse local server filesystem directories
  router.get('/fs/browse', async (req, res) => {
    try {
      const rawDir = req.query.dir as string | undefined;
      let targetDir = rawDir ? path.resolve(rawDir) : process.cwd();
      if (!fs.existsSync(targetDir) && rawDir) {
        if (fs.existsSync(path.resolve('/workspace', rawDir))) {
          targetDir = path.resolve('/workspace', rawDir);
        } else if (fs.existsSync(path.resolve('/app', rawDir))) {
          targetDir = path.resolve('/app', rawDir);
        }
      }

      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        return res.status(404).json({ error: 'Directory not found' });
      }

      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      const directories = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => {
          const fullPath = path.join(targetDir, e.name);
          return {
            name: e.name,
            path: fullPath,
            hasPackageJson: fs.existsSync(path.join(fullPath, 'package.json')),
            isGit: fs.existsSync(path.join(fullPath, '.git')),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const parent = path.dirname(targetDir);
      res.json({
        current: targetDir,
        parent: parent !== targetDir ? parent : null,
        directories,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset database back to fresh blank state (0 projects)
  router.post('/projects/reset', async (_req, res) => {
    try {
      await Promise.all([
        models.projects.deleteMany({}),
        models.files.deleteMany({}),
        models.graph_nodes.deleteMany({}),
        models.graph_edges.deleteMany({}),
        models.findings.deleteMany({}),
        models.agent_runs.deleteMany({}),
        models.agent_steps.deleteMany({}),
        models.tool_calls.deleteMany({}),
        models.observations.deleteMany({}),
        models.hypotheses.deleteMany({}),
        models.verification_runs.deleteMany({}),
        models.security_events.deleteMany({}),
        models.change_sets.deleteMany({}),
      ]);
      res.json({ success: true, message: 'All projects and analysis data reset to fresh state' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Un-index and remove a specific project from database
  const deleteProjectHandler = async (req: any, res: any) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Missing project ID parameter' });
      }

      const proj = await models.projects.findOne({
        $or: [{ projectId: id }, { name: id }],
      }).lean();

      if (!proj) {
        return res.status(404).json({ error: `Project not found: ${id}` });
      }

      const targetProjectId = (proj as any).projectId;

      // Stop file watcher if active
      if (activeWatchers.has(targetProjectId)) {
        try {
          const watcher = activeWatchers.get(targetProjectId);
          watcher?.stop();
          activeWatchers.delete(targetProjectId);
        } catch (e) {
          console.warn(`Error stopping watcher for ${targetProjectId}:`, e);
        }
      }

      // Remove all records related to targetProjectId across all collections
      await Promise.all([
        models.projects.deleteOne({ projectId: targetProjectId }),
        models.files.deleteMany({ projectId: targetProjectId }),
        models.graph_nodes.deleteMany({ projectId: targetProjectId }),
        models.graph_edges.deleteMany({ projectId: targetProjectId }),
        models.findings.deleteMany({ projectId: targetProjectId }),
        models.agent_runs.deleteMany({ projectId: targetProjectId }),
        models.agent_steps.deleteMany({ projectId: targetProjectId }),
        models.tool_calls.deleteMany({ projectId: targetProjectId }),
        models.observations.deleteMany({ projectId: targetProjectId }),
        models.hypotheses.deleteMany({ projectId: targetProjectId }),
        models.verification_runs.deleteMany({ projectId: targetProjectId }),
        models.security_events.deleteMany({ projectId: targetProjectId }),
        models.change_sets.deleteMany({ projectId: targetProjectId }),
      ]);

      res.json({
        success: true,
        message: `Project ${targetProjectId} (${(proj as any).name || ''}) un-indexed and removed from database`,
        projectId: targetProjectId,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  router.delete('/project/:id', deleteProjectHandler);
  router.delete('/projects/:id', deleteProjectHandler);

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Overview & System Posture
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/overview', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const projectId = await resolveTargetProjectId(rawId);

      const [findingsDocs, projectDoc, routesDocs, eventsDocs, runsDocs] = await Promise.all([
        models.findings.find({ projectId }).lean(),
        models.projects.findOne({ projectId }).lean(),
        models.graph_nodes.find({ projectId, type: 'Route' }).lean(),
        models.security_events.find({ projectId }).sort({ ts: -1 }).limit(10).lean(),
        models.agent_runs.find({ projectId }).sort({ startedAt: -1 }).limit(5).lean(),
      ]);

      const findings = findingsDocs as any[];
      const routes = routesDocs as any[];

      const severityCounts = {
        critical: findings.filter((f) => f.severity === 'critical' && f.status === 'open').length,
        high: findings.filter((f) => f.severity === 'high' && f.status === 'open').length,
        medium: findings.filter((f) => f.severity === 'medium' && f.status === 'open').length,
        low: findings.filter((f) => f.severity === 'low' && f.status === 'open').length,
        info: findings.filter((f) => f.severity === 'info' && f.status === 'open').length,
      };

      const totalOpen = findings.filter((f) => f.status === 'open').length;

      // Calculate security posture score / grade
      const protectedRoutes = routes.filter((r) => r.props?.protected).length;
      const totalRoutes = routes.length || 1;
      const protectionRatio = protectedRoutes / totalRoutes;

      let score = 85;
      score -= severityCounts.critical * 20;
      score -= severityCounts.high * 10;
      score -= severityCounts.medium * 4;
      score = Math.max(10, Math.min(100, Math.round(score * protectionRatio)));

      let grade = 'A';
      let statusText = 'Healthy';
      if (score < 40 || severityCounts.critical > 0) {
        grade = 'D+';
        statusText = 'At Risk';
      } else if (score < 65 || severityCounts.high > 1) {
        grade = 'C+';
        statusText = 'Needs Review';
      } else if (score < 80) {
        grade = 'B';
        statusText = 'Moderate';
      }

      res.json({
        projectId,
        project: projectDoc,
        posture: {
          grade,
          score,
          statusText,
          protectedRoutes,
          totalRoutes: routes.length,
        },
        findings: {
          total: totalOpen,
          ...severityCounts,
          resolved: findings.filter((f) => f.status === 'resolved').length,
          regressed: findings.filter((f) => f.status === 'regressed').length,
        },
        topFindings: findings.slice(0, 5),
        recentEvents: eventsDocs,
        recentRuns: runsDocs,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Attack Surface
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/routes', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const projectId = await resolveTargetProjectId(rawId);

      const engine = createFactEngine(projectId);
      const routes = await engine.getRoutes();
      const gaps = await engine.getAuthorizationGaps();
      const assets = await engine.getSensitiveAssets();

      res.json({
        routes: (routes as any).items ?? routes,
        gaps: (gaps as any).items ?? gaps,
        assetsCount: assets.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Security Graph
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/graph', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const projectId = await resolveTargetProjectId(rawId);
      const filter = (req.query.filter as string)?.toLowerCase();
      const routeFilter = req.query.route as string;
      const findingId = req.query.finding as string;

      let nodeDocs = await models.graph_nodes.find({ projectId }).lean();
      let edgeDocs = await models.graph_edges.find({ projectId }).lean();

      // Filter by finding affected nodes if requested
      if (findingId) {
        const finding = await models.findings.findOne({ id: findingId }).lean();
        if (finding && (finding as any).affectedNodes) {
          const targetIds = new Set((finding as any).affectedNodes);
          nodeDocs = nodeDocs.filter((n: any) => targetIds.has(n.id));
          edgeDocs = edgeDocs.filter(
            (e: any) => targetIds.has(e.from) || targetIds.has(e.to),
          );
        }
      } else if (routeFilter) {
        const routeKey = `Route:${routeFilter}`;
        const related = new Set<string>([routeKey]);
        for (const e of edgeDocs as any[]) {
          if (e.from === routeKey || e.to === routeKey) {
            related.add(e.from);
            related.add(e.to);
          }
        }
        nodeDocs = nodeDocs.filter((n: any) => related.has(n.id));
        edgeDocs = edgeDocs.filter(
          (e: any) => related.has(e.from) && related.has(e.to),
        );
      } else if (filter && filter !== 'all') {
        if (filter === 'vulnerable') {
          const findingsDocs = await models.findings.find({ projectId }).lean();
          const targetIds = new Set<string>();
          for (const f of findingsDocs as any[]) {
            for (const nid of f.affectedNodes || []) {
              targetIds.add(nid);
            }
          }
          if (targetIds.size > 0) {
            nodeDocs = nodeDocs.filter((n: any) => targetIds.has(n.id) || targetIds.has(n.key));
          }
          const remaining = new Set(nodeDocs.map((n: any) => n.id));
          edgeDocs = edgeDocs.filter(
            (e: any) => remaining.has(e.from) || remaining.has(e.to),
          );
        } else if (filter === 'routes') {
          nodeDocs = nodeDocs.filter((n: any) => n.type?.toLowerCase() === 'route');
          const remaining = new Set(nodeDocs.map((n: any) => n.id));
          edgeDocs = edgeDocs.filter(
            (e: any) => remaining.has(e.from) && remaining.has(e.to),
          );
        } else if (filter === 'models') {
          nodeDocs = nodeDocs.filter(
            (n: any) => n.type?.toLowerCase() === 'model' || n.type?.toLowerCase() === 'schema',
          );
          const remaining = new Set(nodeDocs.map((n: any) => n.id));
          edgeDocs = edgeDocs.filter(
            (e: any) => remaining.has(e.from) && remaining.has(e.to),
          );
        } else {
          nodeDocs = nodeDocs.filter(
            (n: any) =>
              n.key?.toLowerCase().includes(filter) ||
              n.type?.toLowerCase().includes(filter),
          );
          const remaining = new Set(nodeDocs.map((n: any) => n.id));
          edgeDocs = edgeDocs.filter(
            (e: any) => remaining.has(e.from) && remaining.has(e.to),
          );
        }
      }

      res.json({
        nodes: nodeDocs,
        edges: edgeDocs,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Findings
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/findings', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const status = req.query.status as string;
      const severity = req.query.severity as string;

      const q: any = {};
      if (rawId) {
        q.projectId = await resolveTargetProjectId(rawId);
      }
      if (status) q.status = status;
      if (severity) q.severity = severity;

      const docs = await models.findings.find(q).sort({ createdAt: -1 }).lean();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/findings/:id', async (req, res) => {
    try {
      const doc = await models.findings.findOne({ id: req.params.id }).lean();
      if (!doc) return res.status(404).json({ error: 'Finding not found' });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Verification
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/verifications', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const projectId = rawId ? await resolveTargetProjectId(rawId) : undefined;
      const q = projectId ? { projectId } : {};
      const docs = await models.verification_runs.find(q).sort({ startedAt: -1 }).lean();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/verify', async (req, res) => {
    try {
      const { projectId: rawId, findingId, template, subject } = req.body;
      const projectId = await resolveTargetProjectId(rawId);

      let verificationRequest: any;
      if (findingId) {
        const finding = await models.findings.findOne({ id: findingId }).lean();
        if (!finding) return res.status(404).json({ error: 'Finding not found' });
        const routeNode = (finding as any).affectedNodes.find((n: string) => n.startsWith('Route:'));
        verificationRequest = {
          id: randomUUID(),
          runId: `manual-${randomUUID().slice(0, 8)}`,
          hypothesisId: (finding as any).agentRun ?? randomUUID(),
          template: (finding as any).type,
          subject: { kind: 'route', route: routeNode ? routeNode.slice(6) : '' },
          affectedNodes: (finding as any).affectedNodes,
          requestedAt: new Date().toISOString(),
        };
      } else {
        verificationRequest = {
          id: randomUUID(),
          runId: `manual-${randomUUID().slice(0, 8)}`,
          hypothesisId: randomUUID(),
          template: template ?? 'idor',
          subject: subject ?? { kind: 'route', route: '' },
          affectedNodes: [],
          requestedAt: new Date().toISOString(),
        };
      }

      const run = await verify(cfg, projectId, verificationRequest);

      if (run.result === 'CONFIRMED') {
        try {
          const engine = createFactEngine(projectId);
          const hypothesis: any = {
            id: run.hypothesisId,
            runId: run.runId,
            projectId,
            agent: 'verification',
            type: run.template,
            subject: verificationRequest.subject,
            confidence: 'high',
            affectedNodes: verificationRequest.affectedNodes?.length
              ? verificationRequest.affectedNodes
              : [
                  `Route:${verificationRequest.subject.route}`,
                  ...(run.template === 'idor' ? ['Asset:Order.paymentDetails'] : []),
                ],
            evidence: [1],
          };
          const finding = await buildFinding(cfg, engine, hypothesis, run);
          if (finding && run.template === 'idor') {
            const attackPath = await engine.getAttackPath({
              from: `Route:${verificationRequest.subject.route}`,
              to: 'Asset:Order.paymentDetails',
            });
            if (attackPath && attackPath.nodes.length > 0) {
              await attachAttackPath(projectId, finding.id, {
                findingIds: [finding.id],
                nodes: attackPath.nodes.map((n) => n.id),
                edges: attackPath.edges,
                narrative: `The IDOR vulnerability on ${verificationRequest.subject.route} directly reaches customer payment details in MongoDB through the unauthenticated order controller.`,
              });
            }
          }
        } catch (mintErr) {
          console.error('[verify] finding minting error:', mintErr);
        }
      }

      res.json(run);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Assessment & Agent Controls
  // ──────────────────────────────────────────────────────────────────────────
  router.post('/assess', async (req, res) => {
    try {
      const { projectId: rawId, mode, agent } = req.body;
      const projectId = await resolveTargetProjectId(rawId);

      const agentMap: Record<string, 'auth' | 'dataflow' | 'attack-path'> = {
        auth: 'auth',
        bola: 'auth',
        idor: 'auth',
        bfla: 'auth',
        dataflow: 'dataflow',
        injection: 'dataflow',
        mass_assignment: 'dataflow',
        discovery: 'auth',
        'attack-path': 'attack-path',
        attack_path: 'attack-path',
      };

      const resolvedAgent = agent ? agentMap[String(agent).toLowerCase()] || 'auth' : undefined;
      const targetMode = resolvedAgent ? 'agent' : (mode || 'full');

      // Run assessment asynchronously so client can stream SSE live
      if (targetMode === 'agent' && resolvedAgent) {
        runAgentOnDemand(projectId, resolvedAgent).catch((e) =>
          console.error('[assess] agent error:', e),
        );
      } else {
        runAssessment(projectId).catch((e) =>
          console.error('[assess] full assessment error:', e),
        );
      }

      res.json({
        success: true,
        message: 'Assessment started',
        projectId,
        mode: targetMode,
        agent: resolvedAgent,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const projectId = rawId ? await resolveTargetProjectId(rawId) : undefined;
      const q = projectId ? { projectId } : {};
      const docs = await models.agent_runs.find(q).sort({ startedAt: -1 }).limit(20).lean();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs/:runId/steps', async (req, res) => {
    try {
      const { runId } = req.params;
      const steps = await models.agent_steps.find({ runId }).sort({ seq: 1 }).lean();
      res.json(steps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Changes (Dev Security) & File Watcher
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/changes', async (req, res) => {
    try {
      const rawId = req.query.projectId as string;
      const projectId = rawId ? await resolveTargetProjectId(rawId) : undefined;
      const q = projectId ? { projectId } : {};
      const docs = await models.change_sets.find(q).sort({ createdAt: -1 }).lean();
      const isWatching = projectId ? activeWatchers.has(projectId) : false;
      res.json({ changeSets: docs, isWatching });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/watch', async (req, res) => {
    try {
      const { projectId: rawId, action } = req.body;
      const projectId = await resolveTargetProjectId(rawId);

      if (action === 'stop') {
        const watcher = activeWatchers.get(projectId);
        if (watcher) {
          await watcher.stop();
          activeWatchers.delete(projectId);
        }
        return res.json({ success: true, isWatching: false });
      }

      // Start watcher
      const project = await models.projects.findOne({ projectId }).lean();
      if (!project || !(project as any).path) {
        return res.status(404).json({ error: 'Project path not found' });
      }

      if (!activeWatchers.has(projectId) && (await isSchedulerOwned(projectId))) {
        return res.status(409).json({ error: 'scheduler already watching this project' });
      }

      let watcher = activeWatchers.get(projectId);
      if (!watcher) {
        watcher = new ProjectWatcher((project as any).path);
        watcher.onChange(async ({ changedFiles }) => {
          try {
            await changeEngine.processChange(projectId, { changedFiles });
          } catch (e) {
            console.error('[watcher] error processing change:', e);
          }
        });
        await watcher.start();
        activeWatchers.set(projectId, watcher);
      }

      res.json({ success: true, isWatching: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Knowledge (Playbooks)
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/knowledge', async (_req, res) => {
    try {
      const registry = getKnowledge(cfg.playbooksDir);
      const playbooks = registry.listPlaybooks();
      res.json(playbooks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/knowledge/:type', async (req, res) => {
    try {
      const registry = getKnowledge(cfg.playbooksDir);
      const playbook = registry.getPlaybook(req.params.type);
      res.json(playbook);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Realtime Event Streams (SSE)
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/stream/events', async (req, res) => {
    const clientId = randomUUID();
    const rawId = req.query.projectId as string | undefined;
    const projectId = rawId ? await resolveTargetProjectId(rawId) : undefined;
    sseManager.registerEventsClient(clientId, res, projectId);
  });

  router.get('/stream/agent/:runId', (req, res) => {
    const clientId = randomUUID();
    const runId = req.params.runId;
    sseManager.registerAgentClient(clientId, res, runId);
  });

  return router;
}
