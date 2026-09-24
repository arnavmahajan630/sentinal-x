import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { getProvider } from '../src/llm';
import { normalizeAiMessage, toLangChainMessages, toToolDefs } from '../src/llm/langchain';

describe('llm normalisation', () => {
  it('maps text + usage', () => {
    const msg = new AIMessage({
      content: 'pong',
      usage_metadata: { input_tokens: 3, output_tokens: 1, total_tokens: 4 },
    });
    expect(normalizeAiMessage(msg)).toEqual({
      text: 'pong',
      toolCalls: [],
      usage: { inTok: 3, outTok: 1 },
    });
  });

  it('flattens content-part arrays (Gemini style)', () => {
    const msg = new AIMessage({
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ],
    });
    expect(normalizeAiMessage(msg).text).toBe('ab');
  });

  it('normalises tool calls and fills missing ids', () => {
    const msg = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'x1', name: 'getRoute', args: { id: 'r1' } },
        { name: 'getRoutes', args: {} }, // Gemini often omits the id
      ],
    });
    const res = normalizeAiMessage(msg);
    expect(res.toolCalls).toEqual([
      { id: 'x1', name: 'getRoute', args: { id: 'r1' } },
      { id: 'call_1', name: 'getRoutes', args: {} },
    ]);
    expect(res.usage).toEqual({ inTok: 0, outTok: 0 });
  });

  it('converts messages incl. tool replay', () => {
    const out = toLangChainMessages([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'f', args: { a: 1 } }] },
      { role: 'tool', content: '{"ok":true}', toolCallId: 't1' },
    ]);
    expect(out.map((m) => m._getType())).toEqual(['system', 'human', 'ai', 'tool']);
    expect((out[2] as AIMessage).tool_calls?.[0]?.name).toBe('f');
  });

  it('builds OpenAI-style tool defs from JSON schema', () => {
    expect(toToolDefs([{ name: 'f', description: 'd', schema: { type: 'object' } }])).toEqual([
      {
        type: 'function',
        function: { name: 'f', description: 'd', parameters: { type: 'object' } },
      },
    ]);
  });
});

describe('getProvider', () => {
  it('selects by config with no other code change', () => {
    expect(getProvider(loadConfig({ LLM_PROVIDER: 'ollama' })).name).toBe('ollama');
    expect(getProvider(loadConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).name).toBe(
      'gemini',
    );
    expect(getProvider(loadConfig({ LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'k' })).name).toBe(
      'deepseek',
    );
  });

  it('fails clearly when a key is missing', () => {
    expect(() => getProvider(loadConfig({ LLM_PROVIDER: 'gemini' }))).toThrow(/GEMINI_API_KEY/);
  });
});
