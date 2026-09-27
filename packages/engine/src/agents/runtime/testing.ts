import type { LlmMessage, LlmProvider, LlmResponse, LlmTool } from '../../llm/types';
import type { LlmChatOptions } from '../../llm/types';

export interface ScriptCall {
  index: number;
  messages: LlmMessage[];
  tools?: LlmTool[];
  opts?: LlmChatOptions;
}
export type ScriptStep = LlmResponse | ((c: ScriptCall) => LlmResponse | Promise<LlmResponse>);

/** `LlmProvider` that replays a script (for deterministic runtime/agent tests; also used by C6/C8 tests). */
export class ScriptedProvider implements LlmProvider {
  name = 'scripted';
  calls: ScriptCall[] = [];
  constructor(
    private script: ScriptStep[] | ((c: ScriptCall) => LlmResponse | Promise<LlmResponse>),
  ) {}

  async chat(
    messages: LlmMessage[],
    tools?: LlmTool[],
    opts?: LlmChatOptions,
  ): Promise<LlmResponse> {
    const call: ScriptCall = { index: this.calls.length, messages, tools, opts };
    this.calls.push(call);
    if (opts?.signal?.aborted) throw new Error('aborted');
    const step = typeof this.script === 'function' ? this.script : this.script[call.index];
    if (!step) throw new Error(`ScriptedProvider: script exhausted at call ${call.index}`);
    return typeof step === 'function' ? step(call) : step;
  }
}

let counter = 0;
/** an assistant turn that calls tools */
export const calls = (...cs: { name: string; args?: unknown; id?: string }[]): LlmResponse => ({
  text: '',
  toolCalls: cs.map((c) => ({ name: c.name, args: c.args ?? {}, id: c.id ?? `t${++counter}` })),
  usage: { inTok: 100, outTok: 20 },
});
export const call = (name: string, args: unknown = {}): LlmResponse => calls({ name, args });
/** an assistant turn with only text (no tool call) */
export const say = (text: string): LlmResponse => ({
  text,
  toolCalls: [],
  usage: { inTok: 100, outTok: 20 },
});
export const finishCall = (
  summary = 'done',
  outcome: 'findings' | 'none' | 'inconclusive' = 'none',
): LlmResponse => call('finish', { outcome, summary });
