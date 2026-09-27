import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { LlmMessage, LlmProvider, LlmResponse } from '../../llm/types';
import { runTool, toLlmToolList } from '../../tools/registry';
import { estimateTokens, pruneMessages, truncateForLlm } from './context';
import { budgetWarning, nudgeMessage } from './prompt';
import type { AgentTool, RunCtx } from './tools';
import type { Budget, RunStatus, RunUsage, ToolCallRecord } from './types';

export interface Terminal {
  status: Exclude<RunStatus, 'running'>;
  reason?: string;
  error?: string;
}

export interface RunnerOptions {
  ctx: RunCtx;
  provider: LlmProvider;
  tools: AgentTool[];
  budget: Budget;
  signal?: AbortSignal;
  /** LLM retry backoff (ms) for transient errors */
  retryDelaysMs?: number[];
  startedAt?: number;
}

const State = Annotation.Root({
  messages: Annotation<LlmMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  steps: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  nudges: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  forceTool: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  done: Annotation<Terminal | null>({ reducer: (_a, b) => b, default: () => null }),
});
type S = typeof State.State;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (v: unknown, n = 300) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/**
 * The generic agent loop as a LangGraph StateGraph: `agent` (budget check → LLM call) ⇄ `tools` (run each call),
 * ending on `finish`, budget exhaustion, cancellation or provider failure. The LLM is called through `LlmProvider`.
 */
export function buildAgentGraph(o: RunnerOptions, checkpointer?: BaseCheckpointSaver) {
  const { ctx, provider, tools, budget } = o;
  const startedAt = o.startedAt ?? Date.now();
  const llmTools = toLlmToolList(tools);
  const usage: RunUsage = { inTok: 0, outTok: 0, llmCalls: 0, toolCalls: 0 };
  const delays = o.retryDelaysMs ?? [1000, 3000];

  const stopReason = (state: S): Terminal | null => {
    if (o.signal?.aborted) return { status: 'cancelled', reason: 'cancelled' };
    if (Date.now() - startedAt > budget.timeoutMs)
      return { status: 'inconclusive', reason: 'budget:timeout' };
    if (state.steps >= budget.maxSteps) return { status: 'inconclusive', reason: 'budget:steps' };
    if (usage.inTok + usage.outTok >= budget.maxTokens)
      return { status: 'inconclusive', reason: 'budget:tokens' };
    return null;
  };

  async function callLlm(messages: LlmMessage[], forceTool: boolean): Promise<LlmResponse> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      const signals = [AbortSignal.timeout(budget.llmTimeoutMs), ...(o.signal ? [o.signal] : [])];
      try {
        return await provider.chat(messages, llmTools, {
          toolChoice: forceTool ? 'required' : 'auto',
          signal: AbortSignal.any(signals),
        });
      } catch (e) {
        if (o.signal?.aborted) throw e;
        lastErr = e;
        if (attempt < delays.length) {
          await ctx.emitter.step(
            'error',
            `LLM call failed, retrying (${attempt + 1}/${delays.length}): ${(e as Error).message}`,
            { retry: attempt + 1 },
          );
          await sleep(delays[attempt]!);
        }
      }
    }
    throw lastErr;
  }

  const agentNode = async (state: S): Promise<Partial<S>> => {
    const stop = stopReason(state);
    if (stop) {
      if (stop.status !== 'cancelled')
        await ctx.emitter.step('budget.exhausted', `budget exhausted: ${stop.reason}`, {
          reason: stop.reason,
          steps: state.steps,
          usage,
        });
      return { done: stop };
    }
    const messages = pruneMessages(state.messages);
    let res: LlmResponse;
    try {
      res = await callLlm(messages, state.forceTool);
    } catch (e) {
      if (o.signal?.aborted) return { done: { status: 'cancelled', reason: 'cancelled' } };
      const msg = (e as Error).message;
      await ctx.emitter.step('error', `LLM failed: ${msg}`, { fatal: true });
      return { done: { status: 'failed', reason: 'error', error: msg } };
    }

    let inTok = res.usage.inTok;
    let outTok = res.usage.outTok;
    if (!inTok && !outTok) {
      inTok = estimateTokens(messages.map((m) => m.content).join('\n'));
      outTok = estimateTokens(res.text + JSON.stringify(res.toolCalls));
    }
    usage.inTok += inTok;
    usage.outTok += outTok;
    usage.llmCalls += 1;
    const steps = state.steps + 1;

    await ctx.emitter.step(
      'llm',
      res.text
        ? short(res.text, 140)
        : `calls ${res.toolCalls.map((c) => c.name).join(', ') || '(no tool)'}`,
      {
        text: res.text,
        toolCalls: res.toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
        usage: { inTok, outTok },
        step: steps,
      },
    );
    const assistant: LlmMessage = {
      role: 'assistant',
      content: res.text,
      toolCalls: res.toolCalls,
    };

    if (!res.toolCalls.length) {
      const nudges = state.nudges + 1;
      if (nudges > 2) {
        await ctx.emitter.step('nudge', 'no tool use after 2 reminders — ending run', { nudges });
        return {
          messages: [assistant],
          steps,
          nudges,
          done: { status: 'inconclusive', reason: 'no_tool_use' },
        };
      }
      await ctx.emitter.step(
        'nudge',
        'model answered without a tool call; reminding it to call a tool',
        { nudges },
      );
      return {
        messages: [assistant, { role: 'user', content: nudgeMessage(nudges) }],
        steps,
        nudges,
        forceTool: true,
      };
    }
    return { messages: [assistant], steps, nudges: 0, forceTool: false };
  };

  const toolsNode = async (state: S): Promise<Partial<S>> => {
    const last = state.messages[state.messages.length - 1]!;
    const out: LlmMessage[] = [];
    let done: Terminal | null = null;
    for (const tc of last.toolCalls ?? []) {
      if (ctx.finished) {
        out.push({
          role: 'tool',
          toolCallId: tc.id,
          content: JSON.stringify({
            ok: false,
            error: { code: 'rejected', message: 'run already finished' },
          }),
        });
        continue;
      }
      if (ctx.calls.length >= budget.maxToolCalls) {
        await ctx.emitter.step('budget.exhausted', 'budget exhausted: budget:toolCalls', {
          reason: 'budget:toolCalls',
          toolCalls: ctx.calls.length,
        });
        out.push({
          role: 'tool',
          toolCallId: tc.id,
          content: JSON.stringify({
            ok: false,
            error: { code: 'rejected', message: 'tool-call budget exhausted' },
          }),
        });
        done = { status: 'inconclusive', reason: 'budget:toolCalls' };
        continue;
      }
      const seq = ctx.calls.length + 1;
      await ctx.emitter.step('tool.call', `#${seq} ${tc.name}(${short(tc.args, 100)})`, {
        call: seq,
        tool: tc.name,
        args: tc.args,
      });
      const t0 = Date.now();
      let result: Awaited<ReturnType<typeof runTool>>;
      try {
        result = await runTool(tools, ctx, tc.name, tc.args);
      } catch (e) {
        result = {
          ok: false,
          error: { code: 'internal', message: `tool crashed: ${(e as Error).message}` },
        };
      }
      const rec: ToolCallRecord = {
        runId: ctx.runId,
        seq,
        callId: tc.id,
        tool: tc.name,
        args: tc.args,
        ok: result.ok,
        output: result.ok ? result.data : result.error,
        durationMs: Date.now() - t0,
        ts: new Date().toISOString(),
      };
      ctx.calls.push(rec);
      usage.toolCalls += 1;
      await ctx.store.appendToolCall(rec);
      await ctx.emitter.step(
        'tool.result',
        `#${seq} ${tc.name} → ${result.ok ? 'ok' : `error: ${result.error.message}`}`,
        {
          call: seq,
          tool: tc.name,
          ok: result.ok,
          durationMs: rec.durationMs,
          preview: short(rec.output, 400),
        },
      );
      out.push({
        role: 'tool',
        toolCallId: tc.id,
        content: truncateForLlm(JSON.stringify({ call: seq, ...result }), seq),
      });
    }
    if (ctx.finished) done = { status: 'completed' };
    else if (!done && state.steps >= budget.maxSteps - 2)
      out.push({ role: 'user', content: budgetWarning(budget.maxSteps - state.steps) });
    return done ? { messages: out, done } : { messages: out };
  };

  const graph = new StateGraph(State)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges(
      'agent',
      (s: S) =>
        s.done ? END : s.messages[s.messages.length - 1]?.toolCalls?.length ? 'tools' : 'agent',
      { tools: 'tools', agent: 'agent', [END]: END },
    )
    .addConditionalEdges('tools', (s: S) => (s.done ? END : 'agent'), {
      agent: 'agent',
      [END]: END,
    })
    .compile({ checkpointer });

  return { graph, usage, recursionLimit: budget.maxSteps * 2 + 10 };
}
