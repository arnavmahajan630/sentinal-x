import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LlmTool } from '../llm/types';
import { ToolError } from './errors';
import { suggest } from './suggest';

/**
 * Framework-agnostic tool contract shared by the Fact and Knowledge layers.
 * C5 adapts any list of these to LangGraph tools; `Ctx` is the engine/registry the tool runs against.
 */
export interface ToolDef<Ctx> {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (ctx: Ctx, args: any) => Promise<unknown>;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; suggestions?: string[] } };

export const MAX_TOOL_CHARS = 60_000;

export function toolJsonSchema(tool: Pick<ToolDef<unknown>, 'schema'>): object {
  const schema = zodToJsonSchema(tool.schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** tools as C0 `LlmTool[]` (what LLM providers accept) */
export function toLlmToolList<Ctx>(tools: ToolDef<Ctx>[], names?: string[]): LlmTool[] {
  return tools
    .filter((t) => !names || names.includes(t.name))
    .map((t) => ({ name: t.name, description: t.description, schema: toolJsonSchema(t) }));
}

/** validate → run → shape errors so an LLM can self-correct. Never throws for user/LLM mistakes. */
export async function runTool<Ctx>(
  tools: ToolDef<Ctx>[],
  ctx: Ctx,
  name: string,
  rawArgs: unknown,
  maxChars = MAX_TOOL_CHARS,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      ok: false,
      error: {
        code: 'unknown_tool',
        message: `Unknown tool "${name}"`,
        suggestions: suggest(
          name,
          tools.map((t) => t.name),
        ),
      },
    };
  }
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'args'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: { code: 'invalid_argument', message } };
  }
  try {
    const data = await tool.run(ctx, parsed.data);
    if (JSON.stringify(data).length > maxChars) {
      return {
        ok: false,
        error: { code: 'too_large', message: 'Result too large; narrow it with filters.' },
      };
    }
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ToolError) {
      return {
        ok: false,
        error: {
          code: e.code,
          message: e.message,
          ...(e.suggestions.length ? { suggestions: e.suggestions } : {}),
        },
      };
    }
    throw e; // real bug: don't hide it
  }
}

/** merge several tool lists (fact + knowledge) — names must be unique */
export function combineTools<Ctx>(...lists: ToolDef<Ctx>[][]): ToolDef<Ctx>[] {
  const all = lists.flat();
  const seen = new Set<string>();
  for (const t of all) {
    if (seen.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
    seen.add(t.name);
  }
  return all;
}
