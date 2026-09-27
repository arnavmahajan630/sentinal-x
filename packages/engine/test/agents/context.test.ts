import { describe, expect, it } from 'vitest';
import { estimateTokens, pruneMessages, truncateForLlm } from '../../src/agents';
import type { LlmMessage } from '../../src/llm/types';

describe('truncateForLlm', () => {
  it('leaves small results and caps big ones with a pointer to the stored call', () => {
    expect(truncateForLlm('abc', 1)).toBe('abc');
    const t = truncateForLlm('x'.repeat(100), 7, 40);
    expect(t.startsWith('x'.repeat(40))).toBe(true);
    expect(t).toContain('truncated 60 chars');
    expect(t).toContain('call #7');
  });
});

const msgs = (n: number, size: number): LlmMessage[] => {
  const out: LlmMessage[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'goal' },
  ];
  for (let i = 1; i <= n; i++) {
    out.push({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: `c${i}`, name: `tool${i}`, args: {} }],
    });
    out.push({ role: 'tool', toolCallId: `c${i}`, content: 'r'.repeat(size) });
  }
  return out;
};

describe('pruneMessages', () => {
  it('does nothing under the budget', () => {
    const m = msgs(3, 10);
    expect(pruneMessages(m, { maxChars: 10_000 })).toBe(m);
  });

  it('omits older tool results (keeps the last N), never touches system/goal, is deterministic', () => {
    const m = msgs(10, 1000);
    const p = pruneMessages(m, { maxChars: 5000, keep: 3 });
    const tools = p.filter((x) => x.role === 'tool');
    expect(tools.slice(0, 7).every((x) => x.content.startsWith('[omitted: tool'))).toBe(true);
    expect(tools.slice(7).every((x) => x.content === 'r'.repeat(1000))).toBe(true);
    expect(tools[0]!.content).toContain('tool1');
    expect(p[0]).toEqual(m[0]);
    expect(p[1]).toEqual(m[1]);
    expect(p.length).toBe(m.length); // structure (assistant/tool pairing) preserved
    expect(JSON.stringify(pruneMessages(m, { maxChars: 5000, keep: 3 }))).toBe(JSON.stringify(p));
    expect(m[3]!.content.length).toBe(1000); // input not mutated
  });

  it('trims very long assistant text', () => {
    const m: LlmMessage[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'g' },
      { role: 'assistant', content: 'a'.repeat(5000) },
    ];
    expect(pruneMessages(m, { maxChars: 100 })[2]!.content.length).toBeLessThan(2100);
  });

  it('estimateTokens ~ chars/4', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
