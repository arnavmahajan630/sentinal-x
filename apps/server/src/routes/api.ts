import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
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
  isSchedulerOwned,
} from '@sentinelx/engine';
import { sseManager } from '../sse/events';

// Map of active project watchers
const activeWatchers = new Map<string, ProjectWatcher>();

export function createApiRouter(cfg: Config): Router {
  const router = Router();
  const changeEngine = new ChangeEngine(cfg);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Projects
  // ──────────────────────────────────────────────────────────────────────────

  // List all indexed projects
  router.get('/projects', async (_req, res) => {
    try {
      const docs = await models.projects.find().sort({ indexedAt: -1 }).lean();
      res.json(docs);
    } catch {
      res.json([]);
    }
  });

  // Get active or specified project
  router.get('/project', async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const query = projectId ? { projectId } : {};
      const doc = await models.projects.findOne(query).sort({ indexedAt: -1 }).lean();
      if (!doc) {
        return res.status(404).json({ error: 'No project found' });
      }
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Load / index a new or existing local project repository
  router.post('/project/load', async (req, res) => {
    try {
      const { path: rawPath, force } = req.body;
      if (!rawPath) {
        return res.status(400).json({ error: 'Missing path parameter' });
      }

      const resolved = path.resolve(rawPath);
      const idxResult = await indexProject(resolved, { force: Boolean(force) });
      const graphResult = await buildGraph(idxResult.projectId);

      const project = await models.projects.findOne({ projectId: idxResult.projectId }).lean();
      res.json({
        success: true,
        project,
        stats: idxResult.stats,
        graph: { nodes: graphResult.nodes, edges: graphResult.edges },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Overview & System Posture
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/overview', async (req, res) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        return res.status(400).json({ error: 'Missing projectId' });
      }

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
      const projectId = req.query.projectId as string;
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

      const engine = createFactEngine(projectId);
      const routes = await engine.getRoutes();
      const gaps = await engine.getAuthorizationGaps();
      const assets = await engine.getSensitiveAssets();

      res.json({
        routes,
        gaps,
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
      const projectId = req.query.projectId as string;
      const filter = (req.query.filter as string)?.toLowerCase();
      const routeFilter = req.query.route as string;
      const findingId = req.query.finding as string;

      if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

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
      } else if (filter) {
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
      const projectId = req.query.projectId as string;
      const status = req.query.status as string;
      const severity = req.query.severity as string;

      const q: any = {};
      if (projectId) q.projectId = projectId;
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
      const projectId = req.query.projectId as string;
      const q = projectId ? { projectId } : {};
      const docs = await models.verification_runs.find(q).sort({ startedAt: -1 }).lean();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/verify', async (req, res) => {
    try {
      const { projectId, findingId, template, subject } = req.body;
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

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
      const { projectId, mode, agent } = req.body;
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

      // Run assessment asynchronously so client can stream SSE live
      if (mode === 'agent' && agent) {
        runAgentOnDemand(projectId, agent).catch((e) =>
          console.error('[assess] agent error:', e),
        );
      } else {
        runAssessment(projectId).catch((e) =>
          console.error('[assess] full assessment error:', e),
        );
      }

      res.json({ success: true, message: 'Assessment started' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs', async (req, res) => {
    try {
      const projectId = req.query.projectId as string;
      const q = projectId ? { projectId } : {};
      const docs = await models.agent_runs.find(q).sort({ startedAt: -1 }).limit(20).lean();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Changes (Dev Security) & File Watcher
  // ──────────────────────────────────────────────────────────────────────────
  router.get('/changes', async (req, res) => {
    try {
      const projectId = req.query.projectId as string;
      const q = projectId ? { projectId } : {};
      const docs = await models.change_sets.find(q).sort({ createdAt: -1 }).lean();
      const isWatching = activeWatchers.has(projectId);
      res.json({ changeSets: docs, isWatching });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/watch', async (req, res) => {
    try {
      const { projectId, action } = req.body;
      if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

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
  router.get('/stream/events', (req, res) => {
    const clientId = randomUUID();
    const projectId = req.query.projectId as string | undefined;
    sseManager.registerEventsClient(clientId, res, projectId);
  });

  router.get('/stream/agent/:runId', (req, res) => {
    const clientId = randomUUID();
    const runId = req.params.runId;
    sseManager.registerAgentClient(clientId, res, runId);
  });

  return router;
}
