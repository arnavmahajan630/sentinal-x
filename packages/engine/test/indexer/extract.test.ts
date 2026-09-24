import { describe, expect, it } from 'vitest';
import { extractCode } from '../../src/indexer/extract';
import { createProject } from '../../src/indexer/parse';
import { ex } from './helpers';

describe('parse errors', () => {
  it('reports a syntax error instead of throwing', () => {
    const r = extractCode(createProject(), 'a.js', 'server', 'const x = ;\nmodule.exports = {');
    expect('error' in r && r.error).toMatch(/expression expected/i);
    expect('error' in r && r.line).toBe(1);
  });
});

describe('routes & mounts', () => {
  it('extracts verbs, path forms and handler refs', () => {
    const ir = ex(`
      const express = require('express'); const ctrl = require('./c');
      const app = express(); const BASE = '/b';
      app.get('/a', ctrl.list);
      app.post(BASE + '/x', (req, res) => res.send('x'));
      app.put(\`/t\`, ctrl.put);
      app.delete(['/d1', '/d2'], ctrl.del);
      app.get(/^\\/re/, ctrl.re);
      app.get('setting');
    `);
    const rs = ir.routes.map(
      (r) => `${r.method} ${r.path}${r.dynamic ? '!' : ''} ${r.handler.kind}:${r.handler.text}`,
    );
    expect(rs).toEqual([
      'GET /a member:ctrl.list',
      expect.stringMatching(/^POST \/b\/x inline:/),
      'PUT /t member:ctrl.put',
      'DELETE /d1 member:ctrl.del',
      'DELETE /d2 member:ctrl.del',
      'GET ! member:ctrl.re',
    ]);
  });

  it('keeps route-level middleware order and unwraps wrappers/factories', () => {
    const ir = ex(`
      const express = require('express'); const router = express.Router();
      router.post('/x', auth, requireRole('admin', 'ops'), validate(schema), asyncHandler(create));
    `);
    const r = ir.routes[0]!;
    expect(r.middleware.map((m) => m.text)).toEqual([
      'auth',
      "requireRole('admin', 'ops')",
      'validate(schema)',
    ]);
    expect(r.middleware[1]).toMatchObject({
      kind: 'call',
      factory: 'requireRole',
      args: ["'admin'", "'ops'"],
    });
    expect(r.handler).toMatchObject({ kind: 'ident', wrapper: 'asyncHandler', text: 'create' });
  });

  it('handles router.route() chains in source order', () => {
    const ir = ex(`
      const { Router } = require('express'); const r = Router();
      r.route('/:id').get(a).put(b).delete(c);
    `);
    expect(ir.routes.map((x) => `${x.method} ${x.path} ${x.handler.text}`)).toEqual([
      'GET /:id a',
      'PUT /:id b',
      'DELETE /:id c',
    ]);
    expect(ir.routers).toMatchObject([{ name: 'r', kind: 'router' }]);
  });

  it('records use() mounts with/without path, arrays of middleware and routers', () => {
    const ir = ex(`
      const express = require('express'); const app = express();
      app.use(cors());
      app.use('/api', [a, b], sub);
      app.use(['/x','/y'], m);
    `);
    expect(ir.mounts.map((m) => `${m.path ?? '∅'}:${m.args.map((a) => a.text).join(',')}`)).toEqual(
      ['∅:cors()', '/api:a,b,sub', '/x:m', '/y:m'],
    );
  });

  it('ignores non-router receivers and flags dynamic registration', () => {
    const ir = ex(`
      const map = new Map(); map.get('k'); axios.get('/x', cb);
      module.exports = (app) => { ['a'].forEach((n) => app.get('/' + n, h)); require('./p/' + n); };
    `);
    expect(ir.routes).toHaveLength(1);
    expect(ir.routes[0]).toMatchObject({ router: 'app', dynamic: true });
    expect(ir.routers).toMatchObject([{ name: 'app', implicit: true }]);
    expect(ir.flags).toContain('dynamic-registration');
  });
});

describe('inputs & aliases', () => {
  it('finds member, element, destructured and aliased inputs; uses the real req param name', () => {
    const ir = ex(`
      exports.h = async (request, res) => {
        const { id, name: n } = request.params;
        const body = request.body;
        const q = request.query['page'];
        const token = request.get('Authorization');
        const again = id;
        use(again, body.email, q, n, token);
      };
    `);
    const ids = ir.inputs.map((i) => `${i.source}.${i.path}`).sort();
    expect(ids).toEqual(
      [
        'body.',
        'body.email',
        'headers.authorization',
        'params.id',
        'params.name',
        'query.page',
      ].sort(),
    );
    expect(ir.inputs.find((i) => i.path === 'id')!.boundTo).toContain('id');
  });

  it('does not treat unrelated .body/.params as inputs', () => {
    const ir = ex(`function f(config) { return config.params.id + config.body; }`);
    expect(ir.inputs).toHaveLength(0);
  });
});

describe('mongoose ops & models', () => {
  it('captures op, query shape, sources, select, chain and result var', () => {
    const ir = ex(`
      const User = require('./User');
      exports.h = async (req, res) => {
        const u = await User.findOne({ email: req.body.email, role: 'x', ...req.query }).select('-password +apiKey').lean();
        const all = await User.find({}, { hash: 0 });
      };
    `);
    const [a, b] = ir.mongoOps;
    expect(a).toMatchObject({
      receiver: 'User',
      op: 'findOne',
      resultVar: 'u',
      chain: ['select', 'lean'],
      select: ['-password', '+apiKey'],
    });
    expect(a!.argSources.sort()).toEqual(['req.body.email', 'req.query']);
    expect(a!.queryShape).toMatchObject({
      kind: 'object',
      keys: {
        email: { kind: 'input', source: 'body', path: 'email' },
        role: { kind: 'literal', value: 'x' },
      },
    });
    expect(b!.select).toEqual(['-hash']);
  });

  it('models: `new`, instance ops (only on result vars), raw collections, mongoose.model receivers', () => {
    const ir = ex(`
      exports.h = async (req, res) => {
        const o = new Order({ ...req.body });
        await o.save();
        await other.save();
        await db.collection('users').findOne({ n: req.body.n });
        await mongoose.model('Log').create(req.body);
      };
    `);
    expect(ir.mongoOps.map((o) => `${o.instance ? 'i:' : ''}${o.receiver}.${o.op}`)).toEqual([
      'collection:users.findOne',
      'mongoose.model(Log).create',
      'Order.new',
      'i:o.save',
    ]);
  });

  it('parses schemas: nested docs, arrays, refs, select:false', () => {
    const ir = ex(`
      const mongoose = require('mongoose');
      const s = new mongoose.Schema({
        name: String,
        password: { type: String, required: true },
        apiKey: { type: String, select: false },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        card: { number: String, cvv: String },
        items: [{ sku: String }],
        tags: [String],
      });
      const Thing = mongoose.model('Thing', s);
      module.exports = Thing;
    `);
    const m = ir.models[0]!;
    expect(m).toMatchObject({ name: 'Thing', varName: 'Thing' });
    const f = Object.fromEntries(m.fields.map((x) => [x.name, x]));
    expect(f.password).toMatchObject({ type: 'String', required: true });
    expect(f.apiKey).toMatchObject({ select: false });
    expect(f.owner).toMatchObject({ type: 'ObjectId', ref: 'User' });
    expect(Object.keys(f)).toEqual(
      expect.arrayContaining(['card', 'card.cvv', 'items', 'items.sku', 'tags']),
    );
    expect(f.tags!.type).toBe('Array<String>');
    expect(ir.exports).toMatchObject([{ name: 'default', local: 'Thing' }]);
  });
});

describe('jwt / secrets / env', () => {
  it('captures jwt ops without leaking raw secrets', () => {
    const ir = ex(`
      const jwt = require('jsonwebtoken');
      const { verify } = require('jsonwebtoken');
      const a = jwt.sign({ id: 1 }, 'hunter2hunter2', { expiresIn: '1h' });
      const b = jwt.sign({ id: 1 }, process.env.S);
      const c = jwt.verify(t, process.env.S || 'fallbackvalue', { algorithms: ['none'], ignoreExpiration: true });
      const d = verify(t, cfg.secret);
      const e = jwt.decode(t);
    `);
    const [a, b, c, d, e] = ir.jwtOps;
    expect(a).toMatchObject({
      op: 'sign',
      secretSource: { kind: 'literal', len: 14 },
      expiresIn: '1h',
    });
    expect(a!.flags).toContain('hardcoded-secret');
    expect(b).toMatchObject({ secretSource: { kind: 'env', name: 'S' }, expiresIn: null });
    expect(c).toMatchObject({
      op: 'verify',
      secretSource: { kind: 'env', name: 'S' },
      algorithms: ['none'],
    });
    expect(c!.flags).toEqual(
      expect.arrayContaining(['literal-fallback', 'algorithm-none', 'ignoreExpiration']),
    );
    expect(d).toMatchObject({ op: 'verify', secretSource: { kind: 'var', name: 'cfg.secret' } });
    expect(e!.flags).toContain('decode-only');
    expect(JSON.stringify(ir)).not.toContain('hunter2hunter2');
  });

  it('finds env reads (with default) and masked hard-coded secrets', () => {
    const ir = ex(`
      const { A, B = 'x' } = process.env;
      const port = process.env.PORT || 3000;
      const cfg = { apiKey: 'sk-abcdefghijklmnopqrstuvwx', password: 'correct-horse-battery', title: 'A perfectly normal title' };
      const url = 'mongodb://root:toor1234@localhost/db';
    `);
    expect(ir.envReads.map((e) => `${e.name}:${e.hasDefault}`).sort()).toEqual([
      'A:false',
      'B:true',
      'PORT:true',
    ]);
    const kinds = ir.secrets.map((s) => `${s.kind}:${s.name}`).sort();
    expect(kinds).toEqual(
      expect.arrayContaining([
        'connection-string:url',
        'hardcoded-secret:password',
        'known-token:apiKey',
      ]),
    );
    expect(ir.secrets.find((s) => s.name === 'title')).toBeUndefined();
    const dumped = JSON.stringify(ir);
    for (const raw of ['correct-horse-battery', 'toor1234', 'sk-abcdefghijklmnopqrstuvwx'])
      expect(dumped).not.toContain(raw);
  });

  it('masks env-file secrets and skips example files', () => {
    const real = ex(
      '# c\nJWT_SECRET=supersecretvalue\nPORT=3000\nexport DB="mongodb://a:b@h/d"\n',
      'server/.env',
    );
    expect(real.envFile!.keys.map((k) => `${k.name}:${k.secretLike}`)).toEqual([
      'JWT_SECRET:true',
      'PORT:false',
      'DB:true',
    ]);
    expect(real.secrets.map((s) => s.name)).toEqual(['JWT_SECRET', 'DB']);
    expect(JSON.stringify(real)).not.toContain('supersecretvalue');
    const example = ex('JWT_SECRET=changeme-please\n', 'server/.env.example');
    expect(example.secrets).toHaveLength(0);
    expect(example.envFile!.keys).toHaveLength(1);
  });
});

describe('authz signals', () => {
  const code = (body: string) => ex(`exports.h = async (req, res, next) => { ${body} };`);
  it('ownership compare + guard', () => {
    const ir = code(`if (o.owner.toString() !== req.user.id) return res.status(403).json({});`);
    const a = ir.authz.find((x) => x.kind === 'ownership-compare')!;
    expect(a.guards).toEqual({ status: 403, action: 'respond' });
    expect(a.operands).toMatchObject({ auth: 'user.id', other: { kind: 'var', name: 'o.owner' } });
  });
  it('self-access check (param id vs authenticated id) and .equals()', () => {
    const ir = code(
      `if (req.params.id !== req.userId) throw new Error('x'); if (!o.user.equals(req.user._id)) next(err);`,
    );
    const kinds = ir.authz.filter((x) => x.kind === 'ownership-compare');
    expect(kinds).toHaveLength(2);
    expect(kinds[0]!.guards).toEqual({ action: 'throw' });
    expect(kinds[1]!.guards).toEqual({ action: 'next' });
  });
  it('role checks', () => {
    const ir = code(
      `if (req.user.role !== 'admin') return res.sendStatus(403); if (['a','b'].includes(req.user.role)) {} if (!req.user.isAdmin) {}`,
    );
    expect(ir.authz.filter((x) => x.kind === 'role-check')).toHaveLength(3);
  });
  it('user-scoped queries count for reads/updates, not creates; and are not flagged when absent', () => {
    const ir = code(
      `await Order.findOne({ _id: req.params.id, user: req.user.id }); await Order.create({ user: req.user.id }); await Order.findById(req.params.id);`,
    );
    expect(ir.authz.filter((x) => x.kind === 'user-scoped-query')).toHaveLength(1);
    expect(ir.authz.filter((x) => x.kind === 'ownership-compare')).toHaveLength(0);
  });
  it('does not treat assignments to req.user as reads', () => {
    const ir = code(`req.user = decoded;`);
    expect(ir.authz).toHaveLength(0);
  });
});

describe('responses, functions, traits', () => {
  it('captures response sinks with status', () => {
    const ir = ex(
      `exports.h = (req, res) => { res.status(201).json({ a: req.body.a, u }); res.send(x); res.sendStatus(204); };`,
    );
    expect(ir.responses.map((r) => `${r.method}:${r.status ?? ''}`)).toEqual([
      'status.json:201',
      'send:',
      'sendStatus:204',
    ]);
    expect(ir.responses[0]!.args[0]).toMatchObject({
      kind: 'object',
      keys: { a: { kind: 'input' }, u: { kind: 'var', name: 'u' } },
    });
  });

  it('computes middleware traits as facts', () => {
    const ir = ex(`
      const jwt = require('jsonwebtoken');
      function authenticate(req, res, next) {
        const t = req.headers['authorization'];
        try { req.user = jwt.verify(t, s); next(); } catch (e) { res.status(401).end(); }
      }
    `);
    const fn = ir.functions.find((f) => f.name === 'authenticate')!;
    expect(fn.traits).toEqual({
      readsAuthHeader: true,
      callsJwtVerify: true,
      setsReqUser: true,
      sendsAuthError: true,
      callsNext: true,
      usesReqRes: true,
    });
  });

  it('names functions stably (exports.x, object members, factories with nested fns)', () => {
    const ir = ex(`
      exports.a = () => 1;
      const o = { b() {}, c: () => 2 };
      function factory(role) { return (req, res, next) => next(); }
    `);
    expect(ir.functions.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        'server/x.js#a',
        'server/x.js#o.b',
        'server/x.js#o.c',
        'server/x.js#factory',
      ]),
    );
    const inner = ir.functions.find((f) => f.parent === 'server/x.js#factory');
    expect(inner).toBeDefined();
  });
});

describe('imports & exports', () => {
  it('reads esm + cjs imports and exports', () => {
    const ir = ex(
      `
      import a, { b as c } from './m'; import * as ns from 'pkg';
      const d = require('./d'); const { e, f: g } = require('./e'); const h = require('./h').i;
      export const k = 1; export default function main() {} export { c as z };
      module.exports.cj = () => {}; exports.two = 2;
    `,
      'server/x.ts',
    );
    expect(
      ir.imports.map(
        (i) =>
          `${i.style}:${i.module}:${i.default ?? ''}:${i.namespace ?? ''}:${i.names.map((n) => n.imported + '>' + n.local).join('|')}`,
      ),
    ).toEqual([
      'esm:./m:a::b>c',
      'esm:pkg::ns:',
      'cjs:./d:d::',
      'cjs:./e:::e>e|f>g',
      'cjs:./h:::i>h',
    ]);
    expect(ir.exports.map((e) => e.name).sort()).toEqual(['cj', 'default', 'k', 'two', 'z']);
  });
});
