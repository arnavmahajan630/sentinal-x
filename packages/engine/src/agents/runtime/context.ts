import type { LlmMessage } from '../../llm/types';

export const MAX_TOOL_RESULT_CHARS = 8_000;
export const MAX_CONTEXT_CHARS = 60_000;
export const KEEP_TOOL_MESSAGES = 6;
const MAX_ASSISTANT_CHARS = 2_000;

/** cap what the LLM sees of a tool result; the full output stays in `tool_calls` */
export function truncateForLlm(text: string, callSeq: number, max = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars; full output stored as call #${callSeq}; narrow the query]`;
}

const chars = (m: LlmMessage) =>
  m.content.length + (m.toolCalls ? JSON.stringify(m.toolCalls).length : 0);

/**
 * Deterministic context control: when the conversation is too long, older tool results are replaced by a short
 * marker (last `keep` tool messages stay intact); over-long assistant text is trimmed. First two messages (system, goal) never change.
 */
export function pruneMessages(
  messages: LlmMessage[],
  opts: { maxChars?: number; keep?: number } = {},
): LlmMessage[] {
  const maxChars = opts.maxChars ?? MAX_CONTEXT_CHARS;
  const keep = opts.keep ?? KEEP_TOOL_MESSAGES;
  const total = messages.reduce((n, m) => n + chars(m), 0);
  if (total <= maxChars) return messages;

  const toolIdx = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const drop = new Set(toolIdx.slice(0, Math.max(0, toolIdx.length - keep)));
  const nameOf = new Map<string, string>();
  for (const m of messages) for (const c of m.toolCalls ?? []) nameOf.set(c.id, c.name);

  return messages.map((m, i) => {
    if (i < 2) return m;
    if (drop.has(i))
      return {
        ...m,
        content: `[omitted: ${nameOf.get(m.toolCallId ?? '') ?? 'tool'} result — ask again if you still need it]`,
      };
    if (m.role === 'assistant' && m.content.length > MAX_ASSISTANT_CHARS)
      return { ...m, content: `${m.content.slice(0, MAX_ASSISTANT_CHARS)}…` };
    return m;
  });
}

/** rough token estimate for providers that report no usage */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
