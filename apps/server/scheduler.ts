import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Local dev: read the repo-root .env. In Docker, env comes from compose (file absent → no-op).
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const {
  bus,
  EVENTS_CHANNEL,
  connectDb,
  disconnectDb,
  initCollections,
  loadConfig,
  models,
  ChangeEngine,
  ProjectWatcher,
  acquireProjectLock,
  releaseProjectLock,
  setSchedulerOwned,
  summarizeOpenFindings,
} = await import('@sentinelx/engine');

const IDLE_HEARTBEAT_MS = 60_000;

const cfg = loadConfig();
await connectDb(cfg.mongoUrl);
await initCollections();

const changeEngine = new ChangeEngine(cfg);
const watchers = new Map<string, InstanceType<typeof ProjectWatcher>>();
/** Did a change land for this project since the last idle tick? Reset each tick. */
const changedSinceTick = new Set<string>();

function logIdle(summary: Awaited<ReturnType<typeof summarizeOpenFindings>>) {
  const line = `No changes. Current state: ${summary.open} open, ${summary.bySeverity.critical} critical, ${summary.bySeverity.high} high.`;
  console.log(`[SCHEDULER] ${line}`);
  bus.publish(EVENTS_CHANNEL, {
    kind: 'scheduler.idle',
    projectId: summary.projectId,
    summary: line,
    openCounts: summary,
    ts: new Date().toISOString(),
  });
}

async function attachWatcher(projectId: string, projectPath: string) {
  if (watchers.has(projectId)) return;

  const watcher = new ProjectWatcher(projectPath, { debounceMs: 400, pollIntervalMs: 4000 });
  watcher.onChange(async ({ changedFiles }) => {
    changedSinceTick.add(projectId);
    const runId = randomUUID();
    const locked = await acquireProjectLock(projectId, runId);
    if (!locked) {
      console.log(
        `[SCHEDULER] ${projectId}: change detected but another run is active, skipping this batch`,
      );
      return;
    }
    console.log(`[SCHEDULER] ${projectId}: change detected in ${changedFiles.length} file(s)`);
    try {
      const res = await changeEngine.processChange(projectId, { changedFiles });
      console.log(
        `[SCHEDULER] ${projectId}: re-analysis ${res.changeSet.status} — ${res.transitions.length} transition(s)`,
      );
      for (const t of res.transitions) {
        console.log(
          `[SCHEDULER] ${projectId}: finding ${t.findingId} (${t.type}) ${t.fromStatus} -> ${t.toStatus} (${t.reason})`,
        );
      }
    } catch (err) {
      console.error(`[SCHEDULER] ${projectId}: error processing change:`, err);
    } finally {
      await releaseProjectLock(projectId, runId);
    }
  });

  await watcher.start();
  watchers.set(projectId, watcher);
  await setSchedulerOwned(projectId, true);
  console.log(`[SCHEDULER] watching ${projectPath} (${projectId})`);
}

async function syncProjects() {
  const docs = await models.projects.find().lean<{ projectId: string; path: string }[]>();
  for (const doc of docs) {
    if (doc.path) await attachWatcher(doc.projectId, doc.path);
  }
}

async function idleTick() {
  for (const projectId of watchers.keys()) {
    if (changedSinceTick.has(projectId)) {
      changedSinceTick.delete(projectId);
      continue;
    }
    const summary = await summarizeOpenFindings(projectId);
    logIdle(summary);
  }
  // Pick up any project loaded after the scheduler started.
  await syncProjects();
}

await syncProjects();
const idleTimer = setInterval(() => void idleTick(), IDLE_HEARTBEAT_MS);

console.log('[SCHEDULER] continuous operation loop started');

async function shutdown(signal: string) {
  console.log(`[SCHEDULER] ${signal} received, shutting down`);
  clearInterval(idleTimer);
  for (const [projectId, watcher] of watchers) {
    await watcher.stop();
    await setSchedulerOwned(projectId, false);
  }
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
