import { beforeAll, describe, expect, it } from 'vitest';
import { buildGraphModel } from '../../src/graph/model';
import { Q, fixtureInput, fixtureQ } from './helpers';

let q: Q;
beforeAll(async () => {
  q = await fixtureQ();
});

const R = (id: string) => q.node(`Route:${id}`);
const fnId = (file: string, name: string) => `Function:server/${file}#${name}`;

describe('graph model: structure', () => {
  it('has consistent, unique, deterministic ids', async () => {
    const ids = q.m.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const eids = q.m.edges.map((e) => e.id);
    expect(new Set(eids).size).toBe(eids.length);
    for (const e of q.m.edges) {
      expect(q.has(e.from)).toBe(true);
      expect(q.has(e.to)).toBe(true);
    }
    const again = buildGraphModel(await fixtureInput());
    expect(JSON.stringify(again)).toBe(JSON.stringify(q.m));
  });

  it('every node is reachable from the Project via CONTAINS/EXPOSES/(other structural) edges', () => {
    const adj = new Map<string, string[]>();
    for (const e of q.m.edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    const seen = new Set<string>();
    const stack = [q.ofType('Project')[0]!.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(adj.get(id) ?? []));
    }
    // Inputs are sources (edges point away from them) and Middleware are reached via PROTECTED_BY: all others must be reachable
    const unreachable = q.m.nodes
      .filter((n) => !seen.has(n.id) && n.type !== 'Input')
      .map((n) => n.id);
    expect(unreachable).toEqual([]);
  });

  it('files: tests excluded, client + unparsed + config included', () => {
    const files = q.ofType('File').map((n) => n.key);
    expect(files).not.toContain('server/tests/orders.test.js');
    expect(files).toEqual(
      expect.arrayContaining([
        'client/src/App.jsx',
        'server/broken.js',
        'server/.env',
        'server/package.json',
        'server/tsconfig.json',
      ]),
    );
    expect(q.node('File:server/broken.js').props.unparsed).toBe(true);
    expect(q.node('File:server/.env').props.kind).toBe('config');
  });
});

describe('graph model: routes, protection, middleware', () => {
  it('16 routes; unprotected mounted set is exactly the seeded public routes', () => {
    const routes = q.ofType('Route');
    expect(routes).toHaveLength(16);
    const open = routes
      .filter((n) => n.props.mounted && !n.props.protected)
      .map((n) => n.key)
      .sort();
    expect(open).toEqual([
      'GET /api/health',
      'GET /api/users/:id',
      'GET /api/users/:id/orders',
      'GET /api/v1/ping',
      'GET /api/v2/ping',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ]);
    expect(R('GET /').props).toMatchObject({ mounted: false, dynamic: true });
    expect(q.in('Route:GET /api/health', 'EXPOSES').map((e) => e.from)).toEqual([
      'Project:fixture',
    ]);
    expect(q.in('Route:GET /', 'EXPOSES')).toHaveLength(0);
  });

  it('PUT /api/orders/:id: ordered PROTECTED_BY, handler CALLS, ACCESSES, FLOWS_TO chain', () => {
    const rid = 'Route:PUT /api/orders/:id';
    const chain = q
      .out(rid, 'PROTECTED_BY')
      .sort((a, b) => a.props!.order - b.props!.order)
      .map((e) => q.node(e.to).props.name);
    expect(chain).toEqual(['cors', 'express.json', 'authenticate']);
    const handler = fnId('controllers/order.controller.js', 'updateOrder');
    expect(q.out(rid, 'CALLS').map((e) => e.to)).toEqual([handler]);
    expect(q.edge('CALLS', rid, handler)!.props).toMatchObject({ wrapper: 'asyncHandler' });
    const acc = q.edge('ACCESSES', handler, 'Model:Order')!;
    expect(acc.props!.ops[0]).toMatchObject({
      op: 'findByIdAndUpdate',
      argSources: ['req.params.id', 'req.body'],
      resultVar: 'order',
    });
    expect(q.edge('ACCESSES', 'Model:Order', 'Database:mongodb')).toBeDefined();
    const input = 'Input:server/controllers/order.controller.js#updateOrder:req.params.id';
    expect(q.edge('FLOWS_TO', input, handler)!.props).toMatchObject({ boundTo: ['id'] });
    expect(q.edge('FLOWS_TO', handler, 'Model:Order')!.props!.ops[0].argSources).toEqual([
      'req.params.id',
      'req.body',
    ]);
    expect(R('PUT /api/orders/:id').props).toMatchObject({
      protected: true,
      authEnforcement: 'enforcing',
      authMiddleware: ['authenticate'],
      exposesUserId: true,
    });
    expect(R('PUT /api/orders/:id').props.inputs).toEqual(['req.body', 'req.params.id']);
  });

  it('middleware policy: authenticate=auth/enforcing, requireRole(admin)=role, externals=other', () => {
    const auth = q.node('Middleware:server/middleware/auth.js#authenticate').props;
    expect(auth).toMatchObject({ kind: 'auth', authLike: true, enforcing: true, external: false });
    const role = q.node("Middleware:server/middleware/auth.js#requireRole('admin')").props;
    expect(role).toMatchObject({
      kind: 'role',
      roleGuard: true,
      authLike: false,
      args: ["'admin'"],
    });
    expect(q.node('Middleware:ext:cors').props).toMatchObject({
      external: true,
      kind: 'other',
      authLike: false,
    });
    expect(q.node('Middleware:ext:express.json').props.external).toBe(true);
    expect(
      q.edge(
        'CALLS',
        "Middleware:server/middleware/auth.js#requireRole('admin')",
        fnId('middleware/auth.js', 'requireRole'),
      ),
    ).toBeDefined();
    const admin = R('GET /api/admin/stats').props;
    expect(admin).toMatchObject({
      protected: true,
      roleGuards: [{ name: 'requireRole', args: ["'admin'"] }],
    });
    expect(q.node(fnId('middleware/auth.js', 'authenticate')).props.isMiddleware).toBe(true);
    expect(q.node(fnId('controllers/order.controller.js', 'getOrder')).props.isHandler).toBe(true);
  });

  it('carries authz facts on functions (C3 derives authorization from them)', () => {
    const del = q
      .node(fnId('controllers/order.controller.js', 'deleteOrder'))
      .props.authz.map((a: any) => a.kind);
    expect(del).toContain('ownership-compare');
    expect(q.node(fnId('controllers/order.controller.js', 'getOrder')).props.authz ?? []).toEqual(
      [],
    );
    expect(
      q
        .node(fnId('controllers/order.controller.js', 'getMyOrder'))
        .props.authz.map((a: any) => a.kind),
    ).toContain('user-scoped-query');
  });
});

describe('graph model: assets, exposure, dataflow', () => {
  it('sensitive assets by tier; non-sensitive fields are not assets', () => {
    const a = (id: string) => q.node(`Asset:${id}`).props;
    expect(a('User.password')).toMatchObject({ tier: 'credential', weight: 1 });
    expect(a('User.apiKey')).toMatchObject({ tier: 'credential', selectFalse: true });
    expect(a('User.email')).toMatchObject({ tier: 'pii' });
    expect(a('Order.paymentDetails')).toMatchObject({ tier: 'financial' });
    expect(a('Order.customerId')).toMatchObject({ tier: 'pii' });
    expect(q.has('Asset:Order.total')).toBe(false);
    expect(q.has('Asset:User.username')).toBe(false);
    expect(q.has('Asset:Order.paymentDetails.cvv')).toBe(false); // parent already an asset
    expect(q.edge('CONTAINS', 'Model:User', 'Asset:User.password')).toBeDefined();
  });

  it('exposure edges respect select()/select:false', () => {
    const exposes = (route: string) =>
      q
        .out(fnId(...(handlerOf(route) as [string, string])), 'EXPOSES')
        .map((e) => e.to)
        .sort();
    const handlerOf = (route: string): [string, string] => {
      const h = R(route).props.handler as string; // server/file#name
      const [file, name] = h.replace('server/', '').split('#');
      return [file!, name!];
    };
    expect(exposes('GET /api/admin/stats')).toEqual([]); // returns a count, not documents
    expect(exposes('GET /api/orders/:id')).toEqual([
      'Asset:Order.customerId',
      'Asset:Order.paymentDetails',
    ]);
    expect(exposes('GET /api/users/:id')).toEqual(['Asset:User.email', 'Asset:User.password']); // apiKey is select:false
    expect(exposes('GET /api/users/:id/orders')).toEqual(['Asset:Order.customerId']); // .select('-paymentDetails')
    expect(exposes('POST /api/auth/login')).toEqual(['Asset:User.email', 'Asset:User.password']); // res.json({ token, user })
    expect(R('GET /api/orders/:id').props.exposesSensitive).toEqual([
      'Asset:Order.customerId',
      'Asset:Order.paymentDetails',
    ]);
  });

  it('path-shaped facts: unprotected login handler flows req.body into User', () => {
    const login = q.node(
      R('POST /api/auth/login').props.handler
        ? `Function:${R('POST /api/auth/login').props.handler}`
        : '',
    );
    const flows = q.out(login.id, 'FLOWS_TO').find((e) => e.to === 'Model:User')!;
    expect(flows.props!.ops[0]).toMatchObject({
      op: 'findOne',
      argSources: expect.arrayContaining(['req.body.username', 'req.body.password']),
    });
    expect(R('POST /api/auth/login').props).toMatchObject({
      protected: false,
      authEnforcement: 'none',
      exposesUserId: false,
    });
  });
});

describe('graph model: dependencies, external calls, secrets', () => {
  it('dependencies: declared + installed, imports, builtins, external calls', () => {
    expect(q.node('Dependency:express').props).toMatchObject({
      declared: true,
      installed: '4.17.1',
      builtin: false,
      dev: false,
    });
    expect(q.node('Dependency:jest').props).toMatchObject({ declared: true, dev: true });
    expect(
      q.edge('DEPENDS_ON', 'File:server/middleware/auth.js', 'Dependency:jsonwebtoken'),
    ).toBeDefined();
    expect(
      q.edge('DEPENDS_ON', 'File:server/package.json', 'Dependency:express')!.props,
    ).toMatchObject({ declared: true, range: '^4.17.1' });
    expect(q.node('Dependency:fs').props).toMatchObject({ builtin: true, declared: false });
    expect(
      q.edge('CALLS', fnId('middleware/auth.js', 'authenticate'), 'Dependency:jsonwebtoken')!.props!
        .calls[0],
    ).toMatchObject({ name: 'verify' });
    // only the React client imports an HTTP client (axios); the server uses none
    expect(q.ofType('ExternalService').map((n) => n.id)).toEqual(['ExternalService:HTTP Client']);
    expect(q.edge('USES', 'File:client/src/App.jsx', 'ExternalService:HTTP Client')).toBeDefined();
  });

  it('secrets: env + .env definition, hardcoded jwt secret, no raw values', () => {
    expect(q.node('Secret:env:JWT_SECRET').props).toMatchObject({
      definedIn: 'server/.env',
      source: 'env',
      hasDefault: true,
    });
    expect(q.edge('CONTAINS', 'File:server/.env', 'Secret:env:JWT_SECRET')).toBeDefined();
    expect(
      q.edge('USES', fnId('middleware/auth.js', 'authenticate'), 'Secret:env:JWT_SECRET')!.props!
        .via,
    ).toEqual(expect.arrayContaining(['env', 'jwt.verify']));
    expect(q.has('Secret:env:MONGO_URI')).toBe(true);
    const hard = q.ofType('Secret').filter((n) => n.props.usage === 'jwt');
    expect(hard).toHaveLength(1);
    const loginFn = `Function:${R('POST /api/auth/login').props.handler}`;
    expect(q.edge('USES', loginFn, hard[0]!.id)).toBeDefined();
    const dumped = JSON.stringify(q.m);
    for (const raw of ['secret123', 'hunter2pass', 'supersecretvalue123', 'fallback-secret'])
      expect(dumped).not.toContain(raw);
  });

  it('database node summarises connection facts', () => {
    expect(q.node('Database:mongodb').props).toMatchObject({
      engine: 'mongodb',
      drivers: ['mongoose'],
      credentialsInUrl: true,
    });
  });
});
