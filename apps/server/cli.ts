import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Command } from 'commander';

// Local dev: read the repo-root .env. In Docker, env comes from compose (file absent → no-op).
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const {
  bus,
  connectDb,
  disconnectDb,
  initCollections,
  loadConfig,
  models,
  indexProject,
  buildGraph,
  runAssessment,
  runAgentOnDemand,
  ChangeEngine,
  ProjectWatcher,
} = await import('@sentinelx/engine');

async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  const cfg = loadConfig();
  await connectDb(cfg.mongoUrl);
  await initCollections();
  try {
    return await fn();
  } finally {
    await disconnectDb();
  }
}

/** Accepts either a filesystem path (to index) or an already-indexed projectId. */
async function resolveProjectId(target: string, force = false): Promise<string> {
  const resolved = path.resolve(process.cwd(), target);
  const existing = await models.projects.findOne({ projectId: target }).lean();
  if (existing) return target;
  const idx = await indexProject(resolved, { force });
  await buildGraph(idx.projectId);
  return idx.projectId;
}

const program = new Command();
program.name('sentinel').description('Sentinel-X headless CLI').version('0.0.0');

program
  .command('load <path>')
  .description('index a repo and build its security graph')
  .option('--force', 're-extract every file even if unchanged')
  .action(async (targetPath: string, opts: { force?: boolean }) => {
    await withDb(async () => {
      const resolved = path.resolve(process.cwd(), targetPath);
      console.log(`Indexing ${resolved}...`);
      const idx = await indexProject(resolved, { force: Boolean(opts.force) });
      console.log(`Building security graph for ${idx.projectId}...`);
      const graphRes = await buildGraph(idx.projectId);
      console.log(`Project: ${idx.projectId}`);
      console.log(`Files indexed: ${idx.stats.indexed}`);
      console.log(`Graph: ${graphRes.nodes} nodes, ${graphRes.edges} edges`);
    });
  });

program
  .command('scan <target>')
  .description('run a full assessment (or a single agent) against a path or projectId')
  .option('--mode <mode>', 'full|agent', 'full')
  .option('--agent <agent>', 'auth|dataflow|attack-path (requires --mode agent)')
  .option('--provider <provider>', 'gemini|deepseek|ollama')
  .option('--model <model>', 'LLM model name')
  .option('--max-steps <n>', 'agent step budget', (v) => Number(v))
  .action(async (target: string, opts: Record<string, any>) => {
    if (opts.provider) process.env.LLM_PROVIDER = opts.provider;
    if (opts.model) {
      const p = process.env.LLM_PROVIDER ?? 'gemini';
      process.env[p === 'ollama' ? 'OLLAMA_MODEL' : p === 'deepseek' ? 'DEEPSEEK_MODEL' : 'GEMINI_MODEL'] =
        opts.model;
    }

    await withDb(async () => {
      bus.subscribe('events', (m) => {
        const d = m.data as { kind?: string; summary?: string; status?: string };
        if (d.kind) console.log(`[EVENT] ${d.kind} ${d.status ? `(${d.status})` : ''} ${d.summary ?? ''}`);
      });

      const projectId = await resolveProjectId(target);
      const budget = opts.maxSteps ? { maxTotalSteps: opts.maxSteps } : undefined;

      const result =
        opts.mode === 'agent' && opts.agent
          ? await runAgentOnDemand(projectId, opts.agent, { budget })
          : await runAssessment(projectId, { budget });

      console.log(`\nASSESSMENT RESULT: ${result.status.toUpperCase()} (${result.durationMs}ms)`);
      console.log(`Assessment ID: ${result.assessmentId}`);
      console.log(`Findings:      ${result.findings.length}`);
      console.log(`Verifications: ${result.verificationRuns.length}`);
      console.log(`Hypotheses:    ${result.hypotheses.length}`);

      for (const f of result.findings) {
        console.log(`  [${f.severity.toUpperCase()}] ${f.type} (${f.id})`);
      }

      if (result.status === 'failed') process.exitCode = 1;
    });
  });

program
  .command('watch <target>')
  .description('index + build graph, then watch for changes and re-verify affected findings')
  .option('--poll-ms <n>', 'git-polling fallback interval', (v) => Number(v), 4000)
  .option('--debounce-ms <n>', 'file-event debounce interval', (v) => Number(v), 400)
  .action(async (target: string, opts: { pollMs: number; debounceMs: number }) => {
    const cfg = loadConfig();
    await connectDb(cfg.mongoUrl);
    await initCollections();

    const projectId = await resolveProjectId(target);
    const project = await models.projects.findOne({ projectId }).lean<{ path: string }>();
    if (!project?.path) {
      console.error(`No indexed path found for project ${projectId}`);
      process.exit(1);
    }

    bus.subscribe('events', (m) => {
      const d = m.data as { kind?: string; summary?: string; fromStatus?: string; toStatus?: string };
      if (d.kind === 'finding.status_changed') {
        console.log(`\n[FINDING TRANSITION] ${d.fromStatus} -> ${d.toStatus}: ${d.summary}`);
      } else if (d.kind) {
        console.log(`[EVENT] ${d.kind} ${d.summary ?? ''}`);
      }
    });

    const changeEngine = new ChangeEngine(cfg);
    const watcher = new ProjectWatcher(project.path, {
      debounceMs: opts.debounceMs,
      pollIntervalMs: opts.pollMs,
    });

    let isProcessing = false;
    watcher.onChange(async ({ changedFiles }) => {
      if (isProcessing) {
        console.log(`[WATCH] change queued, previous run still in progress: ${changedFiles.join(', ')}`);
        return;
      }
      isProcessing = true;
      console.log(`\nChange detected in ${changedFiles.length} file(s)`);
      try {
        const res = await changeEngine.processChange(projectId, { changedFiles });
        console.log(`Transitions: ${res.transitions.length}`);
      } catch (err) {
        console.error('Error processing change:', err);
      } finally {
        isProcessing = false;
      }
    });

    await watcher.start();
    console.log(`Watching ${project.path} for changes... (Ctrl+C to stop)`);

    process.on('SIGINT', async () => {
      await watcher.stop();
      await disconnectDb();
      process.exit(0);
    });
  });

program
  .command('findings <projectId>')
  .description('print current findings for a project')
  .option('--status <status>', 'open|resolved|regressed|rejected|all')
  .option('--severity <severity>', 'critical|high|medium|low|info')
  .option('--json', 'print raw JSON')
  .action(async (projectId: string, opts: { status?: string; severity?: string; json?: boolean }) => {
    await withDb(async () => {
      const q: Record<string, unknown> = { projectId };
      if (opts.status && opts.status !== 'all') q.status = opts.status;
      if (opts.severity) q.severity = opts.severity;

      const docs = await models.findings.find(q).sort({ createdAt: -1 }).lean<any[]>();
      if (opts.json) {
        console.log(JSON.stringify(docs, null, 2));
        return;
      }
      if (docs.length === 0) {
        console.log('No findings match.');
        return;
      }
      for (const f of docs) {
        console.log(`[${f.severity.toUpperCase()}] ${f.type} — ${f.status} — ${f.id}`);
      }
    });
  });

await program.parseAsync(process.argv);
