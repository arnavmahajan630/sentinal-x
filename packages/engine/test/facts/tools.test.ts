import { beforeAll, describe, expect, it } from 'vitest';
import { FactEngine } from '../../src/facts/engine';
import { FACT_TOOLS, factToolJsonSchema, runFactTool, toLlmTools } from '../../src/facts/tools';
import { fixtureEngine } from './helpers';

let e: FactEngine;
beforeAll(async () => {
  ({ engine: e } = await fixtureEngine());
});

describe('FACT_TOOLS registry', () => {
  it('covers every public FactEngine fact method (and nothing else)', () => {
    const methods = Object.getOwnPropertyNames(FactEngine.prototype).filter((m) =>
      m.startsWith('get'),
    );
    expect(FACT_TOOLS.map((t) => t.name).sort()).toEqual(methods.sort());
  });

  it('includes the fact queries named by the C4 playbook contract', () => {
    const names = FACT_TOOLS.map((t) => t.name);
    for (const q of [
      'getRoute',
      'getMiddlewareChain',
      'getDataflow',
      'getModelAccess',
      'getJwtUsage',
      'getSecrets',
      'getExposure',
    ])
      expect(names).toContain(q);
  });

  it('produces valid JSON schemas + LlmTool[] (C0 shape)', () => {
    const tools = toLlmTools();
    expect(tools).toHaveLength(FACT_TOOLS.length);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.schema).toMatchObject({ type: 'object' });
      expect(JSON.stringify(t.schema)).not.toContain('$schema');
    }
    const getRoute = factToolJsonSchema(FACT_TOOLS.find((t) => t.name === 'getRoute')!) as any;
    expect(getRoute.required).toEqual(['route']);
    expect(getRoute.properties.route.type).toBe('string');
    expect(toLlmTools(['getRoute']).map((t) => t.name)).toEqual(['getRoute']);
  });
});

describe('runFactTool', () => {
  it('runs a tool and returns JSON data', async () => {
    const r = await runFactTool(e, 'getRoute', { route: 'PUT /api/orders/:id' });
    expect(r).toMatchObject({ ok: true, data: { authorization: 'unknown' } });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('every tool runs on the fixture with default/minimal args', async () => {
    const minimal: Record<string, unknown> = {
      getRoute: { route: 'GET /api/health' },
      getMiddlewareChain: { route: 'GET /api/health' },
      getCallGraph: { fn: 'updateOrder' },
      getDataflow: { route: 'PUT /api/orders/:id' },
      getModelAccess: { model: 'Order' },
      getDependency: { name: 'express' },
      getRoutesTouchingModel: { model: 'User' },
    };
    for (const t of FACT_TOOLS) {
      const r = await runFactTool(e, t.name, minimal[t.name] ?? {});
      expect(r.ok, `${t.name}: ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it('validates arguments with a readable message', async () => {
    const r = await runFactTool(e, 'getRoute', {});
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_argument' } });
    expect((r as any).error.message).toContain('route');
    expect(await runFactTool(e, 'getCallGraph', { fn: 'x', depth: 99 })).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' },
    });
    expect(await runFactTool(e, 'getRoutes', { method: 'FETCH' })).toMatchObject({ ok: false });
  });

  it('structured not_found / ambiguous with suggestions the LLM can use', async () => {
    const nf = await runFactTool(e, 'getRoute', { route: 'GET /api/order/:id' });
    expect(nf).toMatchObject({
      ok: false,
      error: { code: 'not_found', suggestions: expect.arrayContaining(['GET /api/orders/:id']) },
    });
    const amb = await runFactTool(e, 'getRoute', { route: '/api/orders/:id' });
    expect(amb).toMatchObject({ ok: false, error: { code: 'ambiguous' } });
    expect(await runFactTool(e, 'getRotue', {})).toMatchObject({
      ok: false,
      error: { code: 'unknown_tool', suggestions: ['getRoute', 'getRoutes'] },
    });
    expect(await runFactTool(e, 'getDataflow', {})).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' },
    });
  });

  it('no tool can create or confirm findings (facts are read-only)', () => {
    expect(FACT_TOOLS.every((t) => t.name.startsWith('get'))).toBe(true);
  });
});
