import type { Config } from '../../config';
import type {
  LlmChatOptions,
  LlmMessage,
  LlmProvider,
  LlmResponse,
  LlmTool,
  LlmToolCall,
} from '../types';

/**
 * Gemini adapter over the REST API (not LangChain).
 * Why: Gemini 3.x requires `thoughtSignature` on replayed function-call parts; the LangChain adapter compatible with
 * our pinned core (0.3) drops it, which makes every 2nd agent turn fail with HTTP 400. Signatures are kept in
 * `LlmToolCall.meta` and replayed here. Gemini quirks (schema subset, roles, grouped function responses) stay in this file.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** JSON-Schema keywords Gemini's function-declaration schema does not know (it rejects the whole request). */
const DROP = new Set([
  '$schema',
  '$ref',
  '$defs',
  'definitions',
  'additionalProperties',
  'default',
  'examples',
  'propertyNames',
  'patternProperties',
  'not',
  'if',
  'then',
  'else',
]);

/**
 * Gemini accepts an OpenAPI-style subset of JSON Schema. Rewrite ours (from zod) to fit:
 * `const` → single-value `enum`; `exclusiveMinimum/Maximum` → `minimum/maximum`; unsupported keywords dropped.
 */
export function sanitizeGeminiSchema<T>(schema: T): T {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (DROP.has(k)) continue;
      if (k === 'const') out.enum = [val];
      else if (k === 'exclusiveMinimum') out.minimum = val;
      else if (k === 'exclusiveMaximum') out.maximum = val;
      // `properties` maps property NAMES to schemas — never strip a property just because it is named like a keyword
      else
        out[k] =
          k === 'properties' && val && typeof val === 'object'
            ? Object.fromEntries(Object.entries(val).map(([n, s]) => [n, walk(s)]))
            : walk(val);
    }
    return out;
  };
  return walk(schema);
}

type Part = Record<string, unknown>;
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

const asObject = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { result: v };
  } catch {
    return { result: text };
  }
};

/** LlmMessage[] → Gemini `systemInstruction` + `contents` (function responses of one model turn grouped into ONE user content) */
export function toGeminiRequest(messages: LlmMessage[]): {
  systemInstruction?: { parts: Part[] };
  contents: Content[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const nameOf = new Map<string, string>();
  const contents: Content[] = [];
  const push = (role: Content['role'], parts: Part[]) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role && role === 'user') last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') push('user', [{ text: m.content }]);
    else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        nameOf.set(c.id, c.name);
        const part: Part = { functionCall: { name: c.name, args: c.args ?? {} } };
        if (typeof c.meta?.thoughtSignature === 'string')
          part.thoughtSignature = c.meta.thoughtSignature;
        parts.push(part);
      }
      if (!parts.length) parts.push({ text: ' ' });
      contents.push({ role: 'model', parts });
    } else {
      push('user', [
        {
          functionResponse: {
            name: nameOf.get(m.toolCallId ?? '') ?? 'tool',
            response: asObject(m.content),
          },
        },
      ]);
    }
  }
  return { ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents };
}

/** Gemini response → LlmResponse (thought signatures preserved in `toolCalls[].meta`) */
export function fromGeminiResponse(json: any): LlmResponse {
  const cand = json?.candidates?.[0];
  if (!cand?.content) {
    const why = json?.promptFeedback?.blockReason ?? cand?.finishReason ?? 'no candidates';
    throw new Error(`Gemini returned no content (${why})`);
  }
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  for (const part of cand.content.parts ?? []) {
    if (part.thought === true) continue;
    if (typeof part.text === 'string') text += part.text;
    if (part.functionCall) {
      const fc = part.functionCall;
      toolCalls.push({
        name: fc.name,
        args: fc.args ?? {},
        id: fc.id ?? `call_${toolCalls.length}`,
        ...(part.thoughtSignature ? { meta: { thoughtSignature: part.thoughtSignature } } : {}),
      });
    }
  }
  const u = json.usageMetadata ?? {};
  return {
    text,
    toolCalls,
    usage: {
      inTok: u.promptTokenCount ?? 0,
      outTok: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    },
  };
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  constructor(
    private readonly cfg: { apiKey: string; model: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async chat(
    messages: LlmMessage[],
    tools?: LlmTool[],
    opts?: LlmChatOptions,
  ): Promise<LlmResponse> {
    const body: Record<string, unknown> = { ...toGeminiRequest(messages) };
    if (tools?.length) {
      body.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeGeminiSchema(t.schema),
          })),
        },
      ];
      body.toolConfig = {
        functionCallingConfig: { mode: opts?.toolChoice === 'required' ? 'ANY' : 'AUTO' },
      };
    }
    const gen: Record<string, unknown> = {};
    if (opts?.temperature !== undefined) gen.temperature = opts.temperature;
    if (opts?.maxTokens !== undefined) gen.maxOutputTokens = opts.maxTokens;
    if (Object.keys(gen).length) body.generationConfig = gen;

    const res = await this.fetchImpl(`${API}/${this.cfg.model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cfg.apiKey },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(`Gemini API ${res.status}: ${json?.error?.message ?? res.statusText}`);
    return fromGeminiResponse(json);
  }
}

export function createGeminiProvider(cfg: Config['llm']['gemini']): LlmProvider {
  if (!cfg.apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GeminiProvider({ apiKey: cfg.apiKey, model: cfg.model });
}
