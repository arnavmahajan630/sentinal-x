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

describe('LangChainProvider toolChoice / signal (C5 additive options)', () => {
  const tools = [{ name: 'f', description: 'd', schema: { type: 'object' } }];
  const fakeModel = (log: string[], failForced = false) => {
    const mk = (forced?: string): any => ({
      invoke: async (_m: unknown, o?: { signal?: AbortSignal }) => {
        log.push(`invoke${forced ? `:${forced}` : ''}${o?.signal ? ':signal' : ''}`);
        if (forced && failForced) throw new Error('tool_choice unsupported');
        return new AIMessage({ content: 'ok' });
      },
    });
    return { bindTools: (_d: unknown, o?: { tool_choice?: string }) => mk(o?.tool_choice) } as any;
  };

  it('passes the provider-specific forced choice for toolChoice=required, plain otherwise', async () => {
    const { LangChainProvider } = await import('../src/llm/langchain');
    const log: string[] = [];
    const p = new LangChainProvider('x', () => fakeModel(log), 'any');
    await p.chat([{ role: 'user', content: 'hi' }], tools, { toolChoice: 'required' });
    await p.chat([{ role: 'user', content: 'hi' }], tools, { toolChoice: 'auto' });
    expect(log).toEqual(['invoke:any', 'invoke']);
  });

  it('falls back to a normal call when forcing is rejected, and ignores it when unsupported', async () => {
    const { LangChainProvider } = await import('../src/llm/langchain');
    const log: string[] = [];
    await new LangChainProvider('x', () => fakeModel(log, true), 'any').chat(
      [{ role: 'user', content: 'hi' }],
      tools,
      { toolChoice: 'required' },
    );
    expect(log).toEqual(['invoke:any', 'invoke']);
    const log2: string[] = [];
    await new LangChainProvider('ollama', () => fakeModel(log2)).chat(
      [{ role: 'user', content: 'hi' }],
      tools,
      { toolChoice: 'required' },
    );
    expect(log2).toEqual(['invoke']);
  });

  it('forwards an AbortSignal to the model call', async () => {
    const { LangChainProvider } = await import('../src/llm/langchain');
    const log: string[] = [];
    await new LangChainProvider('x', () => fakeModel(log)).chat(
      [{ role: 'user', content: 'hi' }],
      tools,
      { signal: new AbortController().signal },
    );
    expect(log).toEqual(['invoke:signal']);
  });
});

describe('Gemini schema sanitizer (found by the first live Gemini run)', () => {
  it('rewrites/drops JSON-Schema keywords Gemini rejects, keeps the rest, and never strips a property named like a keyword', async () => {
    const { sanitizeGeminiSchema } = await import('../src/llm/providers/gemini');
    const out: any = sanitizeGeminiSchema({
      $schema: 'x',
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'route' },
        n: { type: 'integer', exclusiveMinimum: 0, default: 3 },
        default: { type: 'string', description: 'a property literally called default' },
        list: { type: 'array', items: { type: 'number', exclusiveMinimum: 0 }, minItems: 1 },
        u: { anyOf: [{ type: 'object', properties: { k: { const: 'a' } } }, { type: 'string' }] },
      },
      required: ['kind'],
    });
    expect(out.$schema).toBeUndefined();
    expect(out.additionalProperties).toBeUndefined();
    expect(out.properties.kind).toEqual({ type: 'string', enum: ['route'] });
    expect(out.properties.n).toEqual({ type: 'integer', minimum: 0 });
    expect(out.properties.default).toEqual({
      type: 'string',
      description: 'a property literally called default',
    });
    expect(out.properties.list.items).toEqual({ type: 'number', minimum: 0 });
    expect(out.properties.list.minItems).toBe(1);
    expect(out.properties.u.anyOf[0].properties.k).toEqual({ enum: ['a'] });
    expect(out.required).toEqual(['kind']);
  });

  it('all agent tool schemas are Gemini-clean after sanitizing', async () => {
    const { sanitizeGeminiSchema } = await import('../src/llm/providers/gemini');
    const { buildAgentTools } = await import('../src/agents');
    const { toLlmToolList } = await import('../src/tools/registry');
    for (const t of toLlmToolList(buildAgentTools())) {
      const s = JSON.stringify(sanitizeGeminiSchema(t.schema));
      for (const bad of [
        '"const"',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'additionalProperties',
        '"$schema"',
        '"default"',
      ])
        expect(s, `${t.name} ${bad}`).not.toContain(bad);
    }
  });
});

describe('GeminiProvider (native REST; thought signatures)', () => {
  const okJson = (json: unknown) =>
    ({ ok: true, status: 200, statusText: 'OK', json: async () => json }) as Response;

  it('converts messages: system → systemInstruction, tool calls keep their signature, grouped function responses in ONE user turn', async () => {
    const { toGeminiRequest } = await import('../src/llm/providers/gemini');
    const req = toGeminiRequest([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'goal' },
      {
        role: 'assistant',
        content: 'thinking',
        toolCalls: [
          { id: 'a', name: 'getRoute', args: { r: 1 }, meta: { thoughtSignature: 'SIG1' } },
          { id: 'b', name: 'getRoutes', args: {} },
        ],
      },
      { role: 'tool', toolCallId: 'a', content: '{"call":1,"ok":true}' },
      { role: 'tool', toolCallId: 'b', content: 'plain text result' },
      { role: 'user', content: 'nudge' },
    ]);
    expect(req.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(req.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(req.contents[1]!.parts).toEqual([
      { text: 'thinking' },
      { functionCall: { name: 'getRoute', args: { r: 1 } }, thoughtSignature: 'SIG1' },
      { functionCall: { name: 'getRoutes', args: {} } },
    ]);
    expect(req.contents[2]!.parts).toEqual([
      { functionResponse: { name: 'getRoute', response: { call: 1, ok: true } } },
      { functionResponse: { name: 'getRoutes', response: { result: 'plain text result' } } },
      { text: 'nudge' },
    ]);
  });

  it('parses text, function calls (with signature), usage; skips thought parts; errors when blocked', async () => {
    const { fromGeminiResponse } = await import('../src/llm/providers/gemini');
    const r = fromGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: 'hmm', thought: true },
              { text: 'ok' },
              { functionCall: { name: 'f', args: { a: 1 } }, thoughtSignature: 'S' },
              { functionCall: { name: 'g' } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 6 },
    });
    expect(r.text).toBe('ok');
    expect(r.toolCalls).toEqual([
      { name: 'f', args: { a: 1 }, id: 'call_0', meta: { thoughtSignature: 'S' } },
      { name: 'g', args: {}, id: 'call_1' },
    ]);
    expect(r.usage).toEqual({ inTok: 10, outTok: 10 });
    expect(() => fromGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toThrowError(
      /SAFETY/,
    );
  });

  it('sends model, key header, sanitized tool schema, tool mode; surfaces API errors', async () => {
    const { GeminiProvider } = await import('../src/llm/providers/gemini');
    let seen: any;
    const fetchImpl = (async (url: string, init: any) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body), signal: init.signal };
      return okJson({ candidates: [{ content: { parts: [{ text: 'pong' }] } }] });
    }) as unknown as typeof fetch;
    const p = new GeminiProvider({ apiKey: 'K', model: 'm-1' }, fetchImpl);
    const ac = new AbortController();
    await p.chat(
      [{ role: 'user', content: 'hi' }],
      [
        {
          name: 'f',
          description: 'd',
          schema: {
            type: 'object',
            properties: { k: { const: 'x' } },
            additionalProperties: false,
          },
        },
      ],
      { toolChoice: 'required', temperature: 0.1, signal: ac.signal },
    );
    expect(seen.url).toContain('/models/m-1:generateContent');
    expect(seen.headers['x-goog-api-key']).toBe('K');
    expect(seen.body.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    expect(seen.body.tools[0].functionDeclarations[0].parameters).toEqual({
      type: 'object',
      properties: { k: { enum: ['x'] } },
    });
    expect(seen.body.generationConfig).toEqual({ temperature: 0.1 });
    expect(seen.signal).toBe(ac.signal);

    const failing = new GeminiProvider(
      { apiKey: 'K', model: 'm' },
      (async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'NF',
          json: async () => ({ error: { message: 'model gone' } }),
        }) as Response) as unknown as typeof fetch,
    );
    await expect(failing.chat([{ role: 'user', content: 'x' }])).rejects.toThrowError(
      'Gemini API 404: model gone',
    );
  });
});
