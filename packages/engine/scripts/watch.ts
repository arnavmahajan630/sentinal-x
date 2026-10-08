import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Usage: npm run watch -- <projectPath>
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('usage: npm run watch -- <projectPath>');
  process.exit(1);
}

const { bus, connectDb, initCollections, loadConfig, ChangeEngine, ProjectWatcher } =
  await import('../src');
const { indexProject } = await import('../src/indexer');
const { buildGraph } = await import('../src/graph');

const cfg = loadConfig();
await connectDb(cfg.mongoUrl);
await initCollections();

const resolvedPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), target);
console.log(`[WATCHER] Initializing project at ${resolvedPath}...`);
const idx = await indexProject(resolvedPath);
console.log(`[WATCHER] Building initial security graph (${idx.projectId})...`);
await buildGraph(idx.projectId);

// Subscribe to global timeline events
bus.subscribe('events', (m) => {
  const d = m.data as {
    kind?: string;
    summary?: string;
    status?: string;
    findingId?: string;
    fromStatus?: string;
    toStatus?: string;
  };
  if (d.kind) {
    if (d.kind === 'finding.status_changed') {
      console.log(
        `\n🔔 [FINDING TRANSITION] ${d.fromStatus} ➔ ${d.toStatus}: ${d.summary ?? d.findingId}`,
      );
    } else {
      console.log(`[EVENT] ${d.kind} ${d.status ? `(${d.status})` : ''} ${d.summary ?? ''}`);
    }
  }
});

const changeEngine = new ChangeEngine(cfg);
const watcher = new ProjectWatcher(resolvedPath, {
  debounceMs: 400,
  pollIntervalMs: 4000,
});

let isProcessing = false;

watcher.onChange(async ({ changedFiles }) => {
  if (isProcessing) {
    console.log(
      `[WATCHER] Change queued while previous processing in progress: ${changedFiles.join(', ')}`,
    );
    return;
  }
  isProcessing = true;
  console.log(`\n⚡ [WATCHER] Change detected in ${changedFiles.length} file(s):`);
  for (const f of changedFiles) {
    console.log(`   • ${f}`);
  }

  try {
    const res = await changeEngine.processChange(idx.projectId, { changedFiles });
    console.log(`[WATCHER] Change processing finished:`);
    console.log(`   • Impacted routes: ${res.impact.impactedRoutes.length}`);
    console.log(`   • Affected nodes:  ${res.impact.allAffectedNodeIds.length}`);
    console.log(`   • Transitions:     ${res.transitions.length}`);
    for (const t of res.transitions) {
      console.log(
        `     - Finding ${t.findingId} (${t.type}): ${t.fromStatus} ➔ ${t.toStatus} (${t.reason})`,
      );
    }
  } catch (err) {
    console.error(`[WATCHER] Error processing change:`, err);
  } finally {
    isProcessing = false;
  }
});

await watcher.start();
console.log(`\n👁️ Watching ${resolvedPath} for changes... (Press Ctrl+C to exit)\n`);

process.on('SIGINT', async () => {
  console.log('\nStopping watcher...');
  await watcher.stop();
  process.exit(0);
});
