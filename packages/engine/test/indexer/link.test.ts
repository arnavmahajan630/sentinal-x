import { describe, expect, it } from 'vitest';
import { chainNames, linkFiles, route } from './helpers';

describe('linker: routes', () => {
  it('composes mount prefixes across files (cjs) and inherits middleware in order', () => {
    const { res } = linkFiles({
      'app.js': `
        const express = require('express'); const orders = require('./orders'); const { auth, role } = require('./mw');
        const app = express();
        app.use(cors());
        app.use('/api/orders', orders);
        app.use('/api/admin', role('admin'), require('./admin'));
      `,
      'orders.js': `const { Router } = require('express'); const r = Router(); r.get('/:id', h); module.exports = r; function h(req,res){}`,
      'admin.js': `const { Router } = require('express'); const r = Router(); r.use(log); r.delete('/u/:id', h); module.exports = r; function h(){} function log(){}`,
      'mw.js': `exports.auth = (req,res,next)=>next(); exports.role = (r) => (req,res,next)=>next();`,
    });
    expect(chainNames(route(res, 'GET /api/orders/:id'))).toEqual(['app:cors']);
    const admin = route(res, 'DELETE /api/admin/u/:id');
    expect(chainNames(admin)).toEqual(['app:cors', 'mount:role', 'router:log']);
    expect(admin.chain[1]!.ref.args).toEqual(["'admin'"]);
    expect(admin.chain[1]!.fnId).toBe('mw.js#role'); // factory resolved across files
    expect(admin.handlerFnId).toBe('admin.js#h');
    expect(admin.mounted).toBe(true);
  });

  it('middleware order: use() only applies to routes registered after it', () => {
    const { res } = linkFiles({
      'app.js': `
        const express = require('express'); const app = express();
        app.get('/public', h);
        app.use(auth);
        app.get('/private', h);
        function h(){} function auth(req,res,next){}
      `,
    });
    expect(chainNames(route(res, 'GET /public'))).toEqual([]);
    expect(chainNames(route(res, 'GET /private'))).toEqual(['app:auth']);
  });

  it('path-scoped use() only applies to matching prefixes (segment-aware, params as wildcards)', () => {
    const { res } = linkFiles({
      'app.js': `
        const express = require('express'); const app = express();
        app.use('/api/admin', guard);
        app.use('/api/:tenant/x', tenantGuard);
        app.get('/api/admin/a', h); app.get('/api/administrator', h); app.get('/api/t1/x/y', h); app.get('/api/t1/z', h);
        function h(){} function guard(){} function tenantGuard(){}
      `,
    });
    expect(chainNames(route(res, 'GET /api/admin/a'))).toEqual(['app:guard']);
    expect(chainNames(route(res, 'GET /api/administrator'))).toEqual([]);
    expect(chainNames(route(res, 'GET /api/t1/x/y'))).toEqual(['app:tenantGuard']);
    expect(chainNames(route(res, 'GET /api/t1/z'))).toEqual([]);
  });

  it('a router mounted twice yields one route instance per mount; unmounted routers are flagged', () => {
    const { res } = linkFiles({
      'app.js': `const express = require('express'); const app = express(); const r = require('./r'); app.use('/v1', r); app.use('/v2', r);`,
      'r.js': `const { Router } = require('express'); const r = Router(); r.get('/x', h); module.exports = r; function h(){}`,
      'lonely.js': `const { Router } = require('express'); const r = Router(); r.get('/y', h); module.exports = r; function h(){}`,
    });
    expect(res.routes.map((r) => r.id).sort()).toEqual(['GET /v1/x', 'GET /v2/x', 'GET /y']);
    expect(route(res, 'GET /y').mounted).toBe(false);
  });

  it('esm + ts + tsconfig path aliases + barrel re-exports', () => {
    const { res } = linkFiles({
      'tsconfig.json': `{ /* c */ "compilerOptions": { "baseUrl": ".", "paths": { "@ctl/*": ["controllers/*"] } } }`,
      'server.ts': `
        import express from 'express'; import users from './routes/users'; import { getUser } from '@ctl/index';
        const app = express(); app.use('/users', users); app.get('/direct', getUser);
      `,
      'routes/users.ts': `import { Router } from 'express'; import * as c from '../controllers'; const r = Router(); r.get('/:id', c.getUser); export default r;`,
      'controllers/index.ts': `export * from './user.controller';`,
      'controllers/user.controller.ts': `export async function getUser(req, res) {}`,
    });
    expect(route(res, 'GET /users/:id').handlerFnId).toBe('controllers/user.controller.ts#getUser');
    expect(route(res, 'GET /direct').handlerFnId).toBe('controllers/user.controller.ts#getUser');
  });

  it('keeps ambiguous (dynamic-path) middleware as conditional instead of dropping or asserting it', () => {
    const { res } = linkFiles({
      'app.js': `const express = require('express'); const app = express(); app.use('/' + base, guard); app.get('/x', h); function h(){} function guard(){}`,
    });
    expect(route(res, 'GET /x').chain).toMatchObject([
      { ref: { text: 'guard' }, conditional: true },
    ]);
  });

  it('unresolvable handlers stay as refs (never dropped)', () => {
    const { res } = linkFiles({
      'app.js': `const express = require('express'); const app = express(); app.get('/x', require('some-pkg').handler);`,
    });
    const r = route(res, 'GET /x');
    expect(r.handlerFnId).toBeUndefined();
    expect(r.handler.text).toContain('some-pkg');
  });
});

describe('linker: models, calls, imports', () => {
  it('resolves ops to models via require/import and instance ops via result vars', () => {
    const { irs, res } = linkFiles({
      'models/Order.js': `const m = require('mongoose'); module.exports = m.model('Order', new m.Schema({ a: String }));`,
      'models/User.ts': `import mongoose from 'mongoose'; export const User = mongoose.model('User', new mongoose.Schema({}));`,
      'c.js': `
        const Order = require('./models/Order'); const { User } = require('./models/User'); const jwt = require('jsonwebtoken'); const h = require('./h');
        exports.f = async (req, res) => {
          const o = new Order({}); await o.save(); await User.find({}); jwt.verify(t, s); h.help(); localCall();
        };
        function localCall() {}
      `,
      'h.js': `exports.help = () => {};`,
    });
    const c = irs.find((i) => i.path === 'c.js')!;
    expect(c.mongoOps.map((o) => `${o.receiver}.${o.op}`)).toEqual([
      'User.find',
      'Order.new',
      'o.save',
    ]);
    expect(res.files['c.js']!.opModels).toEqual(['User', 'Order', 'Order']);
    const calls = res.files['c.js']!.calls.map(
      (x) =>
        `${x.callee}=${x.resolved.kind}:${(x.resolved as any).fnId ?? (x.resolved as any).model ?? (x.resolved as any).module}`,
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        'jwt.verify=external:jsonwebtoken',
        'h.help=fn:h.js#help',
        'localCall=fn:c.js#localCall',
        'User.find=model:User',
        'new Order=model:Order',
      ]),
    );
    expect(res.files['c.js']!.imports).toEqual(
      expect.arrayContaining([
        { module: './models/Order', resolvedPath: 'models/Order.js', external: false },
        { module: 'jsonwebtoken', external: true },
      ]),
    );
  });
});
