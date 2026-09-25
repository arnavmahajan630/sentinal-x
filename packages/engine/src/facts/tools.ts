import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LlmTool } from '../llm/types';
import type { FactEngine } from './engine';
import { FactError } from './errors';
import { suggest } from './resolve';

/**
 * Agent-facing tool contracts for the Fact Engine. Framework-agnostic: C5 adapts this list to LangGraph.
 * Tool names == FactEngine method names == playbook `factQueries` entries.
 */
export interface FactTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (engine: FactEngine, args: any) => Promise<unknown>;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; suggestions?: string[] } };

const route = z
  .string()
  .describe("Route id, e.g. 'PUT /api/orders/:id' (method optional if the path is unique)");
const page = {
  limit: z.number().int().min(1).max(200).optional().describe('page size (default 100)'),
  offset: z.number().int().min(0).optional(),
};
const tier = z.enum(['credential', 'financial', 'pii', 'pii-broad']);

export const FACT_TOOLS: FactTool[] = [
  {
    name: 'getRoutes',
    description:
      'List routes (mounted only by default) as summaries: protection, authorization, exposure and mutation flags. Filter to narrow.',
    schema: z.object({
      protected: z.boolean().optional(),
      method: z
        .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ALL', 'OPTIONS', 'HEAD'])
        .optional(),
      pathPrefix: z.string().optional(),
      authorization: z.enum(['present', 'unknown', 'none']).optional(),
      touchesModel: z.string().optional(),
      exposesSensitive: z.boolean().optional(),
      mutates: z.boolean().optional(),
      includeUnmounted: z.boolean().optional(),
      ...page,
    }),
    run: (e, a) => e.getRoutes(a),
  },
  {
    name: 'getRoute',
    description:
      'Full facts for ONE route: auth middleware, authorization (present|unknown|none) with evidence, inputs, DB ops, sensitive fields touched/exposed, mass-assignment flag.',
    schema: z.object({ route }),
    run: (e, a) => e.getRoute(a.route),
  },
  {
    name: 'getMiddlewareChain',
    description:
      'Ordered middleware chain of a route (execution order) with kind auth|role|validation|other and whether auth is enforcing.',
    schema: z.object({ route }),
    run: (e, a) => e.getMiddlewareChain(a.route),
  },
  {
    name: 'getCallGraph',
    description:
      "Call tree of a function: 'out' = callees (functions, dependencies, models), 'in' = callers (functions, routes, middleware). Cycle-safe.",
    schema: z.object({
      fn: z.string().describe("Function id 'file#name' or a unique bare name"),
      depth: z.number().int().min(1).max(6).optional(),
      direction: z.enum(['out', 'in']).optional(),
    }),
    run: (e, a) => e.getCallGraph(a.fn, { depth: a.depth, direction: a.direction }),
  },
  {
    name: 'getDataflow',
    description:
      'Where user-controlled input goes: for a route (optionally one input like req.params.id) returns steps input → function → model op, plus the DB sinks with query shape. Direct, same-function flows only.',
    schema: z.object({
      route: route.optional(),
      input: z.string().optional().describe("e.g. 'req.params.id'"),
      inputId: z.string().optional(),
    }),
    run: (e, a) => e.getDataflow(a),
  },
  {
    name: 'getModelAccess',
    description:
      'Every DB operation on a model: function, op, query shape, arguments from user input, select, and which routes reach it.',
    schema: z.object({ model: z.string() }),
    run: (e, a) => e.getModelAccess(a.model),
  },
  {
    name: 'getDependency',
    description:
      'A package: installed version/range, dev/builtin, known external service, files importing it and functions calling it.',
    schema: z.object({ name: z.string() }),
    run: (e, a) => e.getDependency(a.name),
  },
  {
    name: 'getSensitiveAssets',
    description:
      'Sensitive model fields (credential/financial/pii tiers) with the routes that touch or expose them.',
    schema: z.object({ tier: tier.optional() }),
    run: (e, a) => e.getSensitiveAssets(a),
  },
  {
    name: 'getUnprotectedRoutes',
    description: 'Mounted routes with no authentication middleware in their chain (summaries).',
    schema: z.object({ ...page }),
    run: (e, a) => e.getUnprotectedRoutes(a),
  },
  {
    name: 'getRoutesTouchingModel',
    description: 'Routes whose handler (or callees) operate on a model.',
    schema: z.object({ model: z.string(), ...page }),
    run: (e, a) => e.getRoutesTouchingModel(a.model, a),
  },
  {
    name: 'getAuthorizationGaps',
    description:
      'Authenticated routes WITHOUT a blocking authorization check that matter (id from URL reaches DB, writes data, returns sensitive fields, mass assignment), with reasons. relevantOnly=false lists every gap.',
    schema: z.object({ relevantOnly: z.boolean().optional(), ...page }),
    run: (e, a) => e.getAuthorizationGaps(a),
  },
  {
    name: 'getJwtUsage',
    description:
      'Every jwt sign/verify/decode: secret source (env or hardcoded, masked), algorithms, expiry, flags (hardcoded-secret, literal-fallback, algorithm-none, ignoreExpiration, decode-only), routes using it.',
    schema: z.object({}),
    run: (e) => e.getJwtUsage(),
  },
  {
    name: 'getSecrets',
    description:
      'Hardcoded and environment secrets (values masked), where defined and which functions use them.',
    schema: z.object({}),
    run: (e) => e.getSecrets(),
  },
  {
    name: 'getExposure',
    description:
      "Which functions/routes return which sensitive assets (select-aware). Filter by route and/or asset like 'User.password'.",
    schema: z.object({ route: route.optional(), asset: z.string().optional() }),
    run: (e, a) => e.getExposure(a),
  },
];

const byName = new Map(FACT_TOOLS.map((t) => [t.name, t]));
const MAX_CHARS = 60_000;

export function factToolJsonSchema(tool: FactTool): object {
  const schema = zodToJsonSchema(tool.schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** the registry as C0 `LlmTool[]` (what LLM providers accept) */
export function toLlmTools(names?: string[]): LlmTool[] {
  return FACT_TOOLS.filter((t) => !names || names.includes(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    schema: factToolJsonSchema(t),
  }));
}

/** validate → run → shape errors so an LLM can self-correct. Never throws for user/LLM mistakes. */
export async function runFactTool(
  engine: FactEngine,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool)
    return {
      ok: false,
      error: {
        code: 'unknown_tool',
        message: `Unknown tool "${name}"`,
        suggestions: suggest(name, [...byName.keys()]),
      },
    };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'args'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: { code: 'invalid_argument', message } };
  }
  try {
    const data = await tool.run(engine, parsed.data);
    if (JSON.stringify(data).length > MAX_CHARS) {
      return {
        ok: false,
        error: {
          code: 'too_large',
          message: 'Result too large; narrow it with filters (route, model, pathPrefix, limit).',
        },
      };
    }
    return { ok: true, data };
  } catch (e) {
    if (e instanceof FactError)
      return {
        ok: false,
        error: {
          code: e.code,
          message: e.message,
          ...(e.suggestions.length ? { suggestions: e.suggestions } : {}),
        },
      };
    throw e; // real bug: don't hide it
  }
}
