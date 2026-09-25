import { beforeAll, describe, expect, it } from 'vitest';
import type { FactEngine } from '../../src/facts/engine';
import { FactError } from '../../src/facts/errors';
import { fixtureEngine } from './helpers';

let e: FactEngine;
beforeAll(async () => {
  ({ engine: e } = await fixtureEngine());
});

const ORDERS = 'server/controllers/order.controller.js';

describe('routes', () => {
  it('getRoute(PUT /api/orders/:id) — the DoD example', async () => {
    const r = await e.getRoute('PUT /api/orders/:id');
    expect(r).toMatchObject({
      id: 'PUT /api/orders/:id',
      protected: true,
      authEnforcement: 'enforcing',
      authMiddleware: ['authenticate'],
      authorization: 'unknown',
      exposesUserId: true,
      mutates: true,
      massAssignment: true,
      handler: `${ORDERS}#updateOrder`,
      models: ['Order'],
      selfAuthenticated: false,
    });
    expect(r.authzEvidence).toEqual([]);
    expect(r.inputs.map((i) => i.canonical)).toEqual(['req.body', 'req.params.id']);
    expect(r.inputs.find((i) => i.canonical === 'req.params.id')!.boundTo).toEqual(['id']);
    expect(r.dbOps).toMatchObject([
      {
        model: 'Order',
        op: 'findByIdAndUpdate',
        via: 'handler',
        argSources: ['req.params.id', 'req.body'],
        loc: { file: ORDERS, line: 16 },
      },
    ]);
    expect(r.sensitiveFields).toEqual(
      expect.arrayContaining(['Order.paymentDetails', 'Order.customerId']),
    );
    expect(r.exposesSensitive).toEqual(['Order.customerId', 'Order.paymentDetails']);
  });

  it('authorization: present / unknown / none with evidence', async () => {
    const del = await e.getRoute('DELETE /api/orders/:id');
    expect(del.authorization).toBe('present');
    expect(del.authzEvidence).toMatchObject([
      {
        kind: 'ownership-compare',
        blocking: true,
        where: 'handler',
        guards: { status: 403, action: 'respond' },
      },
    ]);
    expect((await e.getRoute('GET /api/orders/mine/:id')).authzEvidence.map((x) => x.kind)).toEqual(
      ['user-scoped-query'],
    );
    expect((await e.getRoute('GET /api/orders/mine/:id')).authorization).toBe('present');
    const admin = await e.getRoute('GET /api/admin/stats');
    expect(admin.authorization).toBe('present');
    expect(
      admin.authzEvidence.some(
        (x) => x.where === 'middleware' && x.kind === 'role-check' && x.blocking,
      ),
    ).toBe(true);
    expect((await e.getRoute('POST /api/auth/login')).authorization).toBe('none');
    expect((await e.getRoute('GET /api/orders/:id')).authorization).toBe('unknown'); // the seeded IDOR
    expect((await e.getRoute('GET /api/profile')).authorization).toBe('unknown');
  });

  it('getMiddlewareChain is ordered with kinds', async () => {
    const c = await e.getMiddlewareChain('PUT /api/orders/:id');
    expect(c.map((m) => `${m.order}:${m.name}:${m.kind}`)).toEqual([
      '0:cors:other',
      '1:express.json:other',
      '2:authenticate:auth',
    ]);
    expect(c[2]).toMatchObject({
      authLike: true,
      enforcing: true,
      external: false,
      fn: 'server/middleware/auth.js#authenticate',
    });
    const admin = await e.getMiddlewareChain('GET /api/admin/stats');
    expect(admin.map((m) => m.kind)).toEqual(['other', 'other', 'auth', 'role', 'other']);
    expect(admin[3]).toMatchObject({ name: 'requireRole', args: ["'admin'"], roleGuard: true });
  });

  it('getUnprotectedRoutes = the 7 open mounted routes; filters + paging', async () => {
    const p = await e.getUnprotectedRoutes();
    expect(p.total).toBe(7);
    expect(p.items.map((r) => r.id).sort()).toEqual([
      'GET /api/health',
      'GET /api/users/:id',
      'GET /api/users/:id/orders',
      'GET /api/v1/ping',
      'GET /api/v2/ping',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ]);
    expect((await e.getRoutes()).total).toBe(15); // unmounted GET / excluded by default
    expect((await e.getRoutes({ includeUnmounted: true })).total).toBe(16);
    expect((await e.getRoutes({ method: 'delete' })).items.map((r) => r.id).sort()).toEqual([
      'DELETE /api/admin/users/:id',
      'DELETE /api/orders/:id',
    ]);
    expect((await e.getRoutes({ pathPrefix: '/api/orders', limit: 2 })).truncated).toBe(true);
    expect((await e.getRoutes({ authorization: 'none' })).total).toBe(7);
    expect(
      (await e.getRoutes({ exposesSensitive: true, protected: false })).items
        .map((r) => r.id)
        .sort(),
    ).toEqual([
      'GET /api/users/:id',
      'GET /api/users/:id/orders',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ]);
    expect((await e.getRoutesTouchingModel('order')).items.map((r) => r.id)).toContain(
      'GET /api/users/:id/orders',
    );
  });

  it('getAuthorizationGaps: relevant only by default; plain rule on request', async () => {
    const g = await e.getAuthorizationGaps();
    expect(g.items.map((x) => [x.route.id, x.reasons])).toEqual([
      ['GET /api/orders/:id', ['idParamReachesDb', 'exposesSensitive']],
      ['POST /api/orders', ['mutatesData', 'exposesSensitive', 'massAssignment']],
      [
        'PUT /api/orders/:id',
        ['idParamReachesDb', 'mutatesData', 'exposesSensitive', 'massAssignment'],
      ],
    ]);
    const plain = await e.getAuthorizationGaps({ relevantOnly: false });
    expect(plain.items.map((x) => x.route.id)).toEqual([
      'GET /api/orders/:id',
      'GET /api/profile',
      'POST /api/orders',
      'PUT /api/orders/:id',
    ]);
  });
});

describe('call graph, dataflow, model access', () => {
  it('getCallGraph out: handler → model leaf; in: callers', async () => {
    const out = await e.getCallGraph(`${ORDERS}#updateOrder`);
    expect(out).toMatchObject({
      kind: 'function',
      name: 'updateOrder',
      calls: [{ kind: 'model', name: 'Order', detail: ['findByIdAndUpdate'] }],
    });
    const inbound = await e.getCallGraph('updateOrder', { direction: 'in' });
    expect(inbound.calls!.map((c) => `${c.kind}:${c.name}`)).toEqual(['route:PUT /api/orders/:id']);
    const auth = await e.getCallGraph('authenticate', { direction: 'out' });
    expect(auth.calls!.map((c) => `${c.kind}:${c.name}`)).toEqual(['dependency:jsonwebtoken']);
    const mwCallers = await e.getCallGraph('authenticate', { direction: 'in' });
    expect(mwCallers.calls!.map((c) => c.kind)).toContain('middleware');
  });

  it('getDataflow(route): input → handler → model, with query keys', async () => {
    const df = await e.getDataflow({ route: 'PUT /api/orders/:id', input: 'req.params.id' });
    expect(df).toHaveLength(1);
    expect(df[0]!.steps.map((s) => `${s.from} → ${s.to} [${s.via}]`)).toEqual([
      'req.params.id → updateOrder() [read (bound to id)]',
      'updateOrder() → Order [findByIdAndUpdate(arg0)]',
    ]);
    expect(df[0]!.sinks[0]).toMatchObject({
      model: 'Order',
      op: 'findByIdAndUpdate',
      argSources: ['req.params.id', 'req.body'],
      loc: { file: ORDERS, line: 16 },
    });
    const login = await e.getDataflow({ route: 'POST /api/auth/login' });
    expect(login.map((d) => d.input.canonical)).toEqual(['req.body.password', 'req.body.username']);
    expect(login[0]!.steps[1]!.via).toBe('findOne(password)');
    const byId = await e.getDataflow({ inputId: df[0]!.input.id });
    expect(byId[0]!.input.canonical).toBe('req.params.id');
  });

  it('getModelAccess(Order): ops with reachability', async () => {
    const acc = await e.getModelAccess('Order');
    const upd = acc.find((a) => a.op === 'findByIdAndUpdate')!;
    expect(upd).toMatchObject({
      fn: `${ORDERS}#updateOrder`,
      inputCarrying: true,
      reachableFromRoutes: ['PUT /api/orders/:id'],
    });
    expect(acc.find((a) => a.op === 'deleteOne')).toMatchObject({
      instance: true,
      inputCarrying: false,
    });
    expect(acc.map((a) => a.fn)).toContain('server/src/users.routes.ts#anon@12:27');
  });
});

describe('dependencies, assets, jwt, secrets, exposure', () => {
  it('getDependency', async () => {
    const d = await e.getDependency('jsonwebtoken');
    expect(d).toMatchObject({
      declared: true,
      installed: '8.5.1',
      version: '8.5.1',
      builtin: false,
    });
    expect(d.usedBy).toEqual(
      expect.arrayContaining(['server/middleware/auth.js', 'server/routes/auth.routes.js']),
    );
    expect(d.calledFrom.find((c) => c.fn.endsWith('#authenticate'))!.calls[0]).toMatchObject({
      name: 'verify',
    });
    expect((await e.getDependency('axios')).service).toEqual({
      name: 'HTTP Client',
      category: 'http',
    });
    expect(await e.getDependency('fs')).toMatchObject({ builtin: true, declared: false });
  });

  it('getSensitiveAssets: tiers, who touches / exposes', async () => {
    const a = await e.getSensitiveAssets();
    expect(a[0]!.tier).toBe('credential');
    const pw = a.find((x) => x.id === 'Asset:User.password')!;
    expect(pw).toMatchObject({ sensitive: true, weight: 1 });
    expect(pw.exposedByRoutes).toEqual([
      'GET /api/users/:id',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ]);
    expect(a.find((x) => x.id === 'Asset:Order.paymentDetails')!.exposedByRoutes).toEqual([
      'GET /api/orders/:id',
      'GET /api/orders/mine/:id',
      'POST /api/orders',
      'PUT /api/orders/:id',
    ]);
    expect((await e.getSensitiveAssets({ tier: 'financial' })).map((x) => x.id)).toEqual([
      'Asset:Order.paymentDetails',
    ]);
  });

  it('getJwtUsage: hardcoded sign in login, env verify with fallback used by all authenticated routes', async () => {
    const j = await e.getJwtUsage();
    const sign = j.find((x) => x.op === 'sign')!;
    expect(sign).toMatchObject({
      secretSource: { kind: 'literal', len: 9 },
      expiresIn: '7d',
      usedByRoutes: ['POST /api/auth/login'],
    });
    expect(sign.flags).toContain('hardcoded-secret');
    const verify = j.find((x) => x.op === 'verify')!;
    expect(verify).toMatchObject({ secretSource: { kind: 'env', name: 'JWT_SECRET' } });
    expect(verify.flags).toContain('literal-fallback');
    expect(verify.usedByRoutes).toEqual(
      expect.arrayContaining(['PUT /api/orders/:id', 'GET /api/profile', 'GET /api/admin/stats']),
    );
    expect(verify.usedByRoutes).not.toContain('POST /api/auth/login');
  });

  it('getSecrets: masked, defined-in, users — never raw', async () => {
    const s = await e.getSecrets();
    const env = s.find((x) => x.id === 'Secret:env:JWT_SECRET')!;
    expect(env).toMatchObject({ source: 'env', definedIn: 'server/.env', hasDefault: true });
    expect(env.usedBy.some((u) => u.node.endsWith('#authenticate'))).toBe(true);
    expect(s.some((x) => x.usage === 'jwt' && x.source === 'code')).toBe(true);
    const dumped = JSON.stringify(s);
    for (const raw of ['secret123', 'hunter2pass', 'supersecretvalue123', 'fallback-secret'])
      expect(dumped).not.toContain(raw);
  });

  it('getExposure by asset and by route', async () => {
    const pw = await e.getExposure({ asset: 'User.password' });
    expect(pw.flatMap((x) => x.routes).sort()).toEqual([
      'GET /api/users/:id',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ]);
    expect(pw[0]).toMatchObject({ tier: 'credential', confidence: 'direct' });
    const orders = await e.getExposure({ route: 'GET /api/users/:id/orders' });
    expect(orders.map((x) => x.asset)).toEqual(['Order.customerId']);
    expect(orders[0]!.select).toEqual(['-paymentDetails']);
  });
});

describe('ids, errors, determinism, memoization', () => {
  it('lenient ids: node-id form, lower-case method, bare unique path', async () => {
    expect((await e.getRoute('Route:PUT /api/orders/:id')).id).toBe('PUT /api/orders/:id');
    expect((await e.getRoute('put /api/orders/:id')).id).toBe('PUT /api/orders/:id');
    expect((await e.getRoute('/api/health')).id).toBe('GET /api/health');
  });

  it('ambiguous / unknown ids → typed FactError with suggestions', async () => {
    await expect(e.getRoute('/api/orders/:id')).rejects.toMatchObject({
      code: 'ambiguous',
      suggestions: expect.arrayContaining(['GET /api/orders/:id', 'PUT /api/orders/:id']),
    });
    const err = await e.getRoute('GET /api/order/:id').catch((x) => x);
    expect(err).toBeInstanceOf(FactError);
    expect(err).toMatchObject({ code: 'not_found' });
    expect(err.suggestions).toContain('GET /api/orders/:id');
    await expect(e.getModelAccess('Ordr')).rejects.toMatchObject({ code: 'not_found' });
    await expect(e.getDataflow({})).rejects.toMatchObject({ code: 'invalid_argument' });
    await expect(e.getCallGraph('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('all facts are JSON round-trippable and deterministic', async () => {
    const a = JSON.stringify([
      await e.getRoute('PUT /api/orders/:id'),
      await e.getAuthorizationGaps(),
      await e.getJwtUsage(),
    ]);
    expect(JSON.parse(a)).toBeTruthy();
    const { engine: e2 } = await fixtureEngine();
    const b = JSON.stringify([
      await e2.getRoute('PUT /api/orders/:id'),
      await e2.getAuthorizationGaps(),
      await e2.getJwtUsage(),
    ]);
    expect(b).toBe(a);
  });

  it('snapshots the graph once (memoized) and can be refreshed', async () => {
    const { engine, store } = await fixtureEngine();
    let calls = 0;
    const origFind = store.find.bind(store);
    store.find = async (q) => (calls++, origFind(q));
    await engine.getRoutes();
    await engine.getRoute('GET /api/health');
    await engine.getSensitiveAssets();
    expect(calls).toBe(1);
    engine.clearCache();
    await engine.getRoutes();
    expect(calls).toBe(2);
    void store;
  });
});
