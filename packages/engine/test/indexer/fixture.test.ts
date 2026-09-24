import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../../src/indexer/analyze';
import type { Analysis } from '../../src/indexer/analyze';
import { chainNames, route } from './helpers';

const ROOT = path.resolve(__dirname, '../fixtures/vuln-mern');
let a: Analysis;
beforeAll(async () => {
  a = await analyzeProject(ROOT);
});
const ir = (p: string) => a.rows.find((r) => r.w.path === p)!.ir!;
const linked = (p: string) => a.linked.files[p]!;

/** Ground truth for the seeded vulnerable app (see fixtures/vuln-mern/README.md). */
describe('fixture: vuln-mern ground truth', () => {
  it('classifies and statuses every file', () => {
    const by = Object.fromEntries(a.rows.map((r) => [r.w.path, `${r.w.kind}:${r.status}`]));
    expect(by['server/app.js']).toBe('server:indexed');
    expect(by['server/src/users.routes.ts']).toBe('server:indexed');
    expect(by['server/routes/admin.routes.mjs']).toBe('server:indexed');
    expect(by['server/broken.js']).toBe('server:unparsed');
    expect(by['client/src/App.jsx']).toBe('client:recorded');
    expect(by['server/tests/orders.test.js']).toBe('test:recorded');
    expect(by['server/package.json']).toBe('config:indexed');
    expect(Object.keys(by).some((p) => p.includes('ignored/'))).toBe(false);
    expect(a.rows.find((r) => r.w.path === 'server/broken.js')).toMatchObject({ parseLine: 1 });
  });

  it('lists exactly the expected routes (mount prefixes composed)', () => {
    expect(a.linked.routes.map((r) => r.id).sort()).toEqual(
      [
        'GET /',
        'GET /api/admin/stats',
        'DELETE /api/admin/users/:id',
        'GET /api/health',
        'GET /api/orders/:id',
        'PUT /api/orders/:id',
        'DELETE /api/orders/:id',
        'GET /api/orders/mine/:id',
        'POST /api/orders',
        'GET /api/profile',
        'POST /api/auth/login',
        'POST /api/auth/register',
        'GET /api/users/:id',
        'GET /api/users/:id/orders',
        'GET /api/v1/ping',
        'GET /api/v2/ping',
      ].sort(),
    );
    expect(a.linked.routes.filter((r) => !r.mounted).map((r) => r.id)).toEqual(['GET /']); // dynamic.js
  });

  it('middleware chains respect order and mounts', () => {
    // public: registered BEFORE `app.use(authenticate)`
    for (const id of [
      'GET /api/health',
      'GET /api/v1/ping',
      'POST /api/auth/login',
      'GET /api/users/:id',
    ]) {
      expect(chainNames(route(a.linked, id))).toEqual(['app:cors', 'app:express.json']);
    }
    // protected: registered after it
    for (const id of ['GET /api/orders/:id', 'DELETE /api/orders/:id', 'GET /api/profile']) {
      expect(chainNames(route(a.linked, id))).toEqual([
        'app:cors',
        'app:express.json',
        'app:authenticate',
      ]);
    }
    const admin = route(a.linked, 'GET /api/admin/stats');
    expect(chainNames(admin)).toEqual([
      'app:cors',
      'app:express.json',
      'app:authenticate',
      'mount:requireRole',
      'router:auditLog',
    ]);
    expect(admin.chain.find((c) => c.origin === 'mount')).toMatchObject({
      fnId: 'server/middleware/auth.js#requireRole',
      ref: { args: ["'admin'"] },
    });
  });

  it('resolves handlers across CJS/ESM/TS files, incl. wrapper and member refs', () => {
    expect(route(a.linked, 'GET /api/orders/:id')).toMatchObject({
      handlerFnId: 'server/controllers/order.controller.js#getOrder',
      loc: { file: 'server/routes/orders.routes.js', line: 10, col: 4 },
    });
    expect(route(a.linked, 'PUT /api/orders/:id').handlerFnId).toBe(
      'server/controllers/order.controller.js#updateOrder',
    );
    expect(route(a.linked, 'PUT /api/orders/:id').handler.wrapper).toBe('asyncHandler');
    expect(route(a.linked, 'GET /api/users/:id/orders').file).toBe('server/src/users.routes.ts');
  });

  it('seeded IDOR: user-controlled id reaches Order.findById with NO authz signal; safe routes carry one', () => {
    const op = ir('server/controllers/order.controller.js').mongoOps.find((o) =>
      o.fnId.endsWith('#getOrder'),
    )!;
    expect(op).toMatchObject({
      receiver: 'Order',
      op: 'findById',
      argSources: ['req.params.id'],
      resultVar: 'order',
      loc: { line: 4, col: 23 },
    });
    expect(
      linked('server/controllers/order.controller.js').opModels[
        ir('server/controllers/order.controller.js').mongoOps.indexOf(op)
      ],
    ).toBe('Order');

    const authz = ir('server/controllers/order.controller.js').authz.filter(
      (x) => x.kind !== 'auth-context-read',
    );
    const byFn = (n: string) => authz.filter((x) => x.fnId.endsWith(`#${n}`)).map((x) => x.kind);
    expect(byFn('getOrder')).toEqual([]); // vulnerable
    expect(byFn('deleteOrder')).toEqual(['ownership-compare']); // safe
    expect(byFn('getMyOrder')).toEqual(['user-scoped-query']); // safe
    expect(
      ir('server/controllers/order.controller.js').authz.find(
        (x) => x.kind === 'ownership-compare',
      )!.guards,
    ).toEqual({ status: 403, action: 'respond' });
  });

  it('NoSQLi + mass assignment + data exposure shapes', () => {
    const login = ir('server/routes/auth.routes.js').mongoOps.find((o) => o.op === 'findOne')!;
    expect([...login.argSources].sort()).toEqual(['req.body.password', 'req.body.username']);
    expect(
      ir('server/routes/auth.routes.js').mongoOps.find((o) => o.op === 'create')!.argSources,
    ).toEqual(['req.body']);
    const upd = ir('server/controllers/order.controller.js').mongoOps.find(
      (o) => o.op === 'findByIdAndUpdate',
    )!;
    expect([...upd.argSources].sort()).toEqual(['req.body', 'req.params.id']);
    // GET /api/users/:id returns the user document straight back (password field is on the model)
    const resp = ir('server/src/users.routes.ts').responses[0]!;
    expect(resp.args[0]).toMatchObject({ kind: 'var', name: 'user' });
    const userModel = ir('server/models/User.js').models[0]!;
    expect(userModel.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['password', 'apiKey']),
    );
    expect(userModel.fields.find((f) => f.name === 'apiKey')!.select).toBe(false);
  });

  it('alias resolution: TS path alias import and select() are captured', () => {
    const op = ir('server/src/users.routes.ts').mongoOps.find((o) => o.op === 'find')!;
    expect(op).toMatchObject({ select: ['-paymentDetails'], chain: ['select', 'lean'] });
    expect(linked('server/src/users.routes.ts').opModels).toContain('Order');
  });

  it('secrets: found, masked, never raw', () => {
    const all = a.rows.flatMap((r) => r.ir?.secrets ?? []);
    expect(all.map((s) => `${s.kind}:${s.name}`).sort()).toEqual([
      'env-file-secret:JWT_SECRET',
      'env-file-secret:MONGO_URI',
      'hardcoded-secret:JWT_SECRET', // 'fallback' literal next to process.env.JWT_SECRET
      'hardcoded-secret:jwt-secret', // literal passed to jwt.sign
    ]);
    const dumped = JSON.stringify(a.rows.map((r) => r.ir));
    for (const raw of ['secret123', 'hunter2pass', 'supersecretvalue123', 'fallback-secret'])
      expect(dumped).not.toContain(raw);
    // jwt: hardcoded secret in login; env-with-fallback in authenticate
    const sign = ir('server/routes/auth.routes.js').jwtOps[0]!;
    expect(sign).toMatchObject({
      op: 'sign',
      secretSource: { kind: 'literal', len: 9 },
      expiresIn: '7d',
    });
    const verify = ir('server/middleware/auth.js').jwtOps[0]!;
    expect(verify).toMatchObject({
      op: 'verify',
      secretSource: { kind: 'env', name: 'JWT_SECRET' },
    });
    expect(verify.flags).toContain('literal-fallback');
  });

  it('deps, installed versions, dynamic registration', () => {
    const deps = Object.fromEntries(ir('server/package.json').deps.map((d) => [d.name, d]));
    expect(deps.express).toMatchObject({ range: '^4.17.1', installed: '4.17.1', dev: false });
    expect(deps.jest).toMatchObject({ dev: true });
    expect(deps.jest!.installed).toBeUndefined();
    expect(ir('server/dynamic.js').flags).toContain('dynamic-registration');
    expect(ir('client/src/App.jsx').imports.map((i) => i.module)).toEqual(['axios']);
  });

  it('is deterministic (two runs → identical output)', async () => {
    const b = await analyzeProject(ROOT);
    expect(JSON.stringify(b.linked)).toBe(JSON.stringify(a.linked));
    expect(JSON.stringify(b.rows.map((r) => r.ir))).toBe(JSON.stringify(a.rows.map((r) => r.ir)));
  });
});
