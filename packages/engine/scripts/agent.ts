import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Usage: npm run agent -- <projectPath> [--agent demo|auth] [--goal "…"] [--provider ollama|gemini|deepseek] [--model <name>] [--max-steps N]
// Indexes + builds the graph, then runs the chosen agent live, streaming its steps.
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
    'usage: npm run agent -- <projectPath> [--agent demo|auth] [--goal "…"] [--provider ollama] [--model qwen2.5:7b-instruct] [--max-steps 12]',
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

const { agentChannel, bus, connectDb, disconnectDb, initCollections, loadConfig } =
  await import('../src');
const { indexProject } = await import('../src/indexer');
const { buildGraph } = await import('../src/graph');
const { demoAgent, authAgent, runAgent } = await import('../src/agents');
const AGENTS = { demo: demoAgent, auth: authAgent } as const;
const agentName = (flag('agent') ?? 'demo') as keyof typeof AGENTS;
const agent = AGENTS[agentName];
if (!agent) {
  console.error(`unknown --agent "${agentName}". Known: ${Object.keys(AGENTS).join(', ')}`);
  process.exit(1);
}

const cfg = loadConfig();
await connectDb(cfg.mongoUrl);
await initCollections();
const idx = await indexProject(path.resolve(process.env.INIT_CWD ?? process.cwd(), target));
await buildGraph(idx.projectId);

const runId = randomUUID();
bus.subscribe(agentChannel(runId), (m) => {
  const s = m.data as { seq: number; kind: string; title: string };
  console.log(`[${String(s.seq).padStart(2)}] ${s.kind.padEnd(22)} ${s.title}`);
});
console.log(
  `provider=${cfg.llm.provider} model=${cfg.llm[cfg.llm.provider].model} runId=${runId}\n`,
);

const defaultGoals: Record<keyof typeof AGENTS, string> = {
  demo: 'List the unprotected routes and explain the security risk of each.',
  auth: 'For each route, determine whether access control (authentication, ownership, role) is enforced correctly; where it isn\'t, propose a hypothesis with evidence and the right verification template.',
};

const result = await runAgent({
  runId,
  projectId: idx.projectId,
  agent,
  goal: flag('goal') ?? defaultGoals[agentName],
  budget: flag('max-steps') ? { maxSteps: Number(flag('max-steps')) } : undefined,
});

console.log(
  `\nstatus=${result.status}${result.reason ? ` (${result.reason})` : ''} steps=${result.steps} tokens=${result.usage.inTok}+${result.usage.outTok} llmCalls=${result.usage.llmCalls} toolCalls=${result.usage.toolCalls} ${result.durationMs}ms`,
);
console.log(`summary: ${result.summary}`);
console.log(
  `observations=${result.observations.length} hypotheses=${result.hypotheses.length} playbooks=${result.playbooks.join(', ')}`,
);
for (const h of result.hypotheses)
  console.log(
    `  hypothesis ${h.type} → ${h.title}  [${h.confidence}] nodes=${h.affectedNodes.length}`,
  );
await disconnectDb();
process.exit(result.status === 'failed' ? 2 : 0);
