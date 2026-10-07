import { config as loadEnv } from 'dotenv';

// Usage: npm run verify -- <runId>
// Stopgap for C7's own DoD/e2e check: drains this run's hypotheses that are
// `verification-requested`, calls verify() then buildFinding() for each, logs the outcome.
// C9 replaces this with real cross-run orchestration.
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const runId = process.argv[2];
if (!runId) {
  console.error('usage: npm run verify -- <runId>');
  process.exit(1);
}

const { connectDb, disconnectDb, initCollections, loadConfig, models } = await import('../src');
const { createFactEngine } = await import('../src/facts');
const { verify } = await import('../src/verification/engine');
const { buildFinding } = await import('../src/findings/build');

const cfg = loadConfig();
await connectDb(cfg.mongoUrl);
await initCollections();

const docs = await models.hypotheses
  .find({ runId, status: 'verification-requested' })
  .lean();

if (!docs.length) {
  console.log(`no verification-requested hypotheses for run ${runId}`);
  await disconnectDb();
  process.exit(0);
}

for (const doc of docs as any[]) {
  const hypothesis = doc as import('../src/agents/runtime/types').Hypothesis;
  const request = hypothesis.verificationRequest;
  if (!request) continue;
  const engine = createFactEngine(hypothesis.projectId);
  const run = await verify(cfg, hypothesis.projectId, request);
  console.log(`[${run.template}] ${run.result}  hypothesis=${hypothesis.id}`);
  if (run.result === 'CONFIRMED') {
    const finding = await buildFinding(cfg, engine, hypothesis, run);
    if (finding) console.log(`  -> Finding ${finding.id} (${finding.severity})`);
  }
}

await disconnectDb();
