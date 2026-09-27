import { randomUUID } from 'node:crypto';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { EventBus } from '../../bus';
import { loadConfig } from '../../config';
import type { FactEngine } from '../../facts/engine';
import { createFactEngine } from '../../facts/engine';
import { getKnowledge } from '../../knowledge/registry';
import type { KnowledgeRegistry } from '../../knowledge/registry';
import type { Playbook } from '../../knowledge/types';
import type { LlmProvider } from '../../llm/types';
import { getProvider } from '../../llm';
import { buildAgentGraph } from './baseAgent';
import type { Terminal } from './baseAgent';
import { RunEmitter } from './events';
import { createMemoryCheckpointer, createMongoCheckpointer } from './memory';
import { MongoRunStore } from './mongoStore';
import { buildSystemPrompt, initialUserMessage } from './prompt';
import type { RunStore } from './store';
import { buildAgentTools } from './tools';
import type { RunCtx } from './tools';
import { DEFAULT_BUDGET } from './types';
import type { AgentRunResult, AgentSpec, AgentStep, Budget } from './types';

export interface RunAgentOptions {
  /** pre-chosen run id (lets callers subscribe to `agent:<runId>` before the run starts); default: random uuid */
  runId?: string;
  projectId: string;
  agent: AgentSpec;
  goal: string;
  /** extra context appended to the goal message */
  context?: string;
  budget?: Partial<Budget>;
  /** playbooks to inject (defaults to `agent.playbooks` by type) */
  playbooks?: Playbook[];
  provider?: LlmProvider;
  engine?: FactEngine;
  registry?: KnowledgeRegistry;
  store?: RunStore;
  checkpointer?: BaseCheckpointSaver;
  bus?: EventBus;
  signal?: AbortSignal;
  retryDelaysMs?: number[];
}

/** injected playbooks + the reference playbooks that apply to them */
function withReferences(registry: KnowledgeRegistry, pbs: Playbook[]): Playbook[] {
  const types = new Set(pbs.map((p) => p.type));
  const refs = registry
    .listPlaybooks({ kind: 'reference' })
    .filter((r) => !types.has(r.type) && r.appliesTo.some((t) => types.has(t)));
  return [...pbs, ...refs];
}

/**
 * Run one agent investigation. Never throws for model/tool/provider problems: those end the run with
 * status `failed|inconclusive|cancelled` and a persisted trace. Agents can only propose; nothing here creates a finding.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentRunResult> {
  const startedAt = Date.now();
  const runId = opts.runId ?? randomUUID();
  const spec = opts.agent;
  const budget: Budget = { ...DEFAULT_BUDGET, ...spec.budget, ...opts.budget };
  const registry = opts.registry ?? getKnowledge(loadConfig().playbooksDir);
  const store = opts.store ?? new MongoRunStore();
  const engine = opts.engine ?? createFactEngine(opts.projectId);
  const provider = opts.provider ?? getProvider(loadConfig());
  const checkpointer =
    opts.checkpointer ?? (opts.store ? createMemoryCheckpointer() : createMongoCheckpointer());

  const injected = withReferences(
    registry,
    opts.playbooks ?? (spec.playbooks ?? []).map((t) => registry.getPlaybook(t)),
  );
  const allowedTypes =
    spec.hypothesisTypes ??
    registry
      .listPlaybooks({ kind: 'vulnerability' })
      .filter((p) => p.agent === spec.name)
      .map((p) => p.type);
  const emitter = new RunEmitter(runId, store, opts.bus);
  const tools = buildAgentTools();

  const ctx: RunCtx = {
    runId,
    projectId: opts.projectId,
    spec,
    goal: opts.goal,
    engine,
    registry,
    store,
    emitter,
    allowedTypes,
    calls: [],
    observations: [],
    hypotheses: [],
    verificationRequests: [],
    investigationRequests: [],
  };
  const playbookIds = injected.map((p) => `${p.type}@${p.version}`);

  await store.createRun({
    runId,
    projectId: opts.projectId,
    agent: spec.name,
    goal: opts.goal,
    status: 'running',
    budget,
    usage: { inTok: 0, outTok: 0, llmCalls: 0, toolCalls: 0 },
    stepCount: 0,
    playbooks: playbookIds,
    startedAt: new Date(startedAt).toISOString(),
  });
  await emitter.step('run.started', `${spec.name}: ${opts.goal}`, {
    agent: spec.name,
    goal: opts.goal,
    budget,
    playbooks: playbookIds,
    tools: tools.map((t) => t.name),
  });
  emitter.global('agent.run.started', {
    agent: spec.name,
    goal: opts.goal,
    projectId: opts.projectId,
  });

  const { graph, usage, recursionLimit } = buildAgentGraph(
    {
      ctx,
      provider,
      tools,
      budget,
      signal: opts.signal,
      retryDelaysMs: opts.retryDelaysMs,
      startedAt,
    },
    checkpointer,
  );
  const system = buildSystemPrompt({
    spec,
    goal: opts.goal,
    playbooks: injected,
    budget,
    toolNames: tools.map((t) => t.name),
  });

  let terminal: Terminal;
  try {
    const finalState = await graph.invoke(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: initialUserMessage(opts.goal, opts.context) },
        ],
      },
      { configurable: { thread_id: runId }, recursionLimit },
    );
    terminal =
      finalState.done ??
      (ctx.finished
        ? { status: 'completed' }
        : { status: 'failed', reason: 'error', error: 'graph ended without a terminal state' });
  } catch (e) {
    const msg = (e as Error).message;
    await emitter.step('error', `run crashed: ${msg}`, { fatal: true });
    terminal = { status: 'failed', reason: 'error', error: msg };
  }

  const summary =
    ctx.finished?.summary ??
    (terminal.status === 'completed'
      ? ''
      : `Run ended: ${terminal.reason ?? terminal.status}. ${ctx.hypotheses.length} hypothesis(es) proposed before it ended.`);
  const result: AgentRunResult = {
    runId,
    projectId: opts.projectId,
    agent: spec.name,
    status: terminal.status,
    ...(terminal.reason ? { reason: terminal.reason } : {}),
    summary,
    ...(ctx.finished ? { outcome: ctx.finished.outcome } : {}),
    observations: ctx.observations,
    hypotheses: ctx.hypotheses,
    verificationRequests: ctx.verificationRequests,
    investigationRequests: ctx.investigationRequests,
    usage,
    steps: emitter.count,
    playbooks: playbookIds,
    durationMs: Date.now() - startedAt,
    ...(terminal.error ? { error: terminal.error } : {}),
  };
  await emitter.step(
    'run.finished',
    `${terminal.status}${terminal.reason ? ` (${terminal.reason})` : ''}: ${summary}`.slice(0, 200),
    {
      status: terminal.status,
      reason: terminal.reason,
      summary,
      usage,
      hypotheses: ctx.hypotheses.length,
      observations: ctx.observations.length,
    },
  );
  result.steps = emitter.count;
  await store.updateRun(runId, {
    status: terminal.status,
    usage,
    stepCount: emitter.count,
    summary,
    reason: terminal.reason,
    error: terminal.error,
    finishedAt: new Date().toISOString(),
  });
  emitter.global('agent.run.finished', {
    status: terminal.status,
    reason: terminal.reason,
    hypotheses: ctx.hypotheses.length,
    projectId: opts.projectId,
  });
  return result;
}

/** SSE replay helper (C11): steps of a run with seq > afterSeq */
export function getRunSteps(
  runId: string,
  afterSeq = 0,
  store: RunStore = new MongoRunStore(),
): Promise<AgentStep[]> {
  return store.getSteps(runId, afterSeq);
}
