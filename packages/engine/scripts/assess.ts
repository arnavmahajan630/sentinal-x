import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Usage: npm run assess -- <projectPath> [--mode full|agent] [--agent auth|dataflow|attack-path] [--provider ollama|gemini|deepseek] [--model <name>] [--max-steps N]
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find(
  (a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]!.startsWith('--')),
);

if (!target) {
  console.error(
    'usage: npm run assess -- <projectPath> [--mode full|agent] [--agent auth|dataflow|attack-path] [--provider gemini] [--model gemini-3.8-flash] [--max-steps 80]',
  );
  process.exit(1);
}

if (flag('provider')) process.env.LLM_PROVIDER = flag('provider')!;
if (flag('model')) {
  const p = process.env.LLM_PROVIDER ?? 'gemini';
  process.env[
    p === 'ollama' ? 'OLLAMA_MODEL' : p === 'deepseek' ? 'DEEPSEEK_MODEL' : 'GEMINI_MODEL'
  ] = flag('model')!;
}

const {
  bus,
  connectDb,
  disconnectDb,
  initCollections,
  loadConfig,
  runAssessment,
  runAgentOnDemand,
} = await import('../src');
const { indexProject } = await import('../src/indexer');
const { buildGraph } = await import('../src/graph');

const cfg = loadConfig();
await connectDb(cfg.mongoUrl);
await initCollections();

const resolvedPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), target);
console.log(`Indexing project at ${resolvedPath}...`);
const idx = await indexProject(resolvedPath);
console.log(`Building security graph for project ${idx.projectId}...`);
await buildGraph(idx.projectId);

// Subscribe to global timeline events
bus.subscribe('events', (m) => {
  const d = m.data as { kind?: string; summary?: string; status?: string; phase?: string };
  if (d.kind) {
    console.log(`[EVENT] ${d.kind} ${d.status ? `(${d.status})` : ''} ${d.summary ?? ''}`);
  }
});

console.log(
  `\nStarting assessment (provider=${cfg.llm.provider}, model=${cfg.llm[cfg.llm.provider].model})...\n`,
);

const mode = flag('mode') ?? 'full';
const agentName = flag('agent') as 'auth' | 'dataflow' | 'attack-path' | undefined;
const maxSteps = flag('max-steps') ? Number(flag('max-steps')) : undefined;

let result;
if (mode === 'agent' && agentName) {
  result = await runAgentOnDemand(idx.projectId, agentName, {
    budget: maxSteps ? { maxTotalSteps: maxSteps } : undefined,
  });
} else {
  result = await runAssessment(idx.projectId, {
    budget: maxSteps ? { maxTotalSteps: maxSteps } : undefined,
  });
}

console.log('\n─────────────────────────────────────────────────────────────────');
console.log(`ASSESSMENT RESULT: ${result.status.toUpperCase()} (${result.durationMs}ms)`);
console.log('─────────────────────────────────────────────────────────────────');
console.log(`Assessment ID: ${result.assessmentId}`);
console.log(`Mode:          ${result.mode}`);
console.log(`Findings:      ${result.findings.length}`);
console.log(`Verifications: ${result.verificationRuns.length}`);
console.log(`Hypotheses:    ${result.hypotheses.length}`);

console.log('\nAgent Summaries:');
for (const [id, a] of Object.entries(result.agents)) {
  console.log(
    `  • [${a.agent}] ${a.status} — ${a.steps} steps, ${a.tokens} tokens, ${a.hypothesesCount} hypotheses, ${a.durationMs}ms (runId: ${id})`,
  );
}

if (result.findings.length > 0) {
  console.log('\nConfirmed Findings:');
  for (const f of result.findings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.type} (Finding: ${f.id})`);
    console.log(`    Nodes: ${f.affectedNodes.join(', ')}`);
    if (f.attackPath) {
      console.log(`    Attack Path: ${f.attackPath.narrative}`);
    }
  }
}

await disconnectDb();
process.exit(result.status === 'failed' ? 1 : 0);
