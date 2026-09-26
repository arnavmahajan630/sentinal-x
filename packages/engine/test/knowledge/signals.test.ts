import { describe, expect, it } from 'vitest';
import type { RouteFact } from '../../src/facts/types';
import {
  SIGNAL_CATALOG,
  signalsFromJwtUsage,
  signalsFromRoute,
  signalsFromSecrets,
} from '../../src/knowledge';

const route = (o: Partial<RouteFact> = {}): RouteFact => ({
  id: 'GET /x',
  method: 'GET',
  path: '/x',
  fullPath: '/x',
  protected: true,
  authEnforcement: 'enforcing',
  authorization: 'unknown',
  exposesUserId: false,
  mutates: false,
  massAssignment: false,
  exposesSensitive: [],
  models: [],
  authMiddleware: [],
  roleGuards: [],
  middleware: [],
  inputs: [],
  dbOps: [],
  sensitiveFields: [],
  exposedSensitive: [],
  authzEvidence: [],
  selfAuthenticated: false,
  mounted: true,
  dynamic: false,
  file: 'f.js',
  ...o,
});
const op = (o: any) => ({
  model: 'M',
  op: 'findOne',
  fn: 'f#g',
  via: 'handler' as const,
  argSources: [],
  loc: { file: 'f.js', line: 1 },
  ...o,
});

describe('signalsFromRoute', () => {
  it('authorization + basic flags', () => {
    expect(signalsFromRoute(route())).toEqual(['authorization:unknown']);
    expect(signalsFromRoute(route({ protected: false, authorization: 'none' }))).toEqual([
      'authorization:none',
      'unprotected',
    ]);
    expect(signalsFromRoute(route({ authEnforcement: 'weak' }))).toContain('auth-weak');
    expect(signalsFromRoute(route({ exposesUserId: true }))).toContain(
      'user-controlled-id-flows-to-model-read',
    );
  });

  it('data signals: writes, mass assignment, exposure tiers, unprotected-touches-data', () => {
    const s = signalsFromRoute(
      route({
        protected: false,
        authorization: 'none',
        models: ['User'],
        massAssignment: true,
        exposesSensitive: ['User.password'],
        exposedSensitive: [{ tier: 'credential' } as any],
        dbOps: [op({ op: 'create', argSources: ['req.body'] })],
      }),
    );
    expect(s).toEqual(
      expect.arrayContaining([
        'writes-data',
        'mass-assignment',
        'exposes-sensitive',
        'exposes-credential',
        'unprotected-touches-data',
      ]),
    );
    expect(
      signalsFromRoute(
        route({ exposesSensitive: ['O.x'], exposedSensitive: [{ tier: 'pii' } as any] }),
      ),
    ).not.toContain('exposes-credential');
  });

  it('query-built-from-input-object: body/query in a filter only; not params, not create', () => {
    const shape = (v: any) => ({ kind: 'object', keys: { a: v } });
    const inp = (source: string) => ({ kind: 'input', source, path: 'x' });
    expect(signalsFromRoute(route({ dbOps: [op({ queryShape: shape(inp('body')) })] }))).toContain(
      'query-built-from-input-object',
    );
    expect(signalsFromRoute(route({ dbOps: [op({ queryShape: shape(inp('query')) })] }))).toContain(
      'query-built-from-input-object',
    );
    expect(signalsFromRoute(route({ dbOps: [op({ queryShape: inp('body') })] }))).toContain(
      'query-built-from-input-object',
    ); // find(req.body.x) whole
    expect(
      signalsFromRoute(route({ dbOps: [op({ queryShape: shape(inp('params')) })] })),
    ).not.toContain('query-built-from-input-object');
    expect(
      signalsFromRoute(route({ dbOps: [op({ op: 'create', queryShape: shape(inp('body')) })] })),
    ).not.toContain('query-built-from-input-object');
    expect(
      signalsFromRoute(
        route({
          dbOps: [
            op({
              queryShape: { kind: 'object', keys: { u: { kind: 'authctx', path: 'user.id' } } },
            }),
          ],
        }),
      ),
    ).not.toContain('query-built-from-input-object');
  });

  it('privileged-path-without-role-check: path pattern minus role evidence/guards', () => {
    expect(signalsFromRoute(route({ fullPath: '/api/admin/users' }))).toContain(
      'privileged-path-without-role-check',
    );
    expect(signalsFromRoute(route({ fullPath: '/api/internal/x' }))).toContain(
      'privileged-path-without-role-check',
    );
    expect(signalsFromRoute(route({ fullPath: '/api/administration-policy' }))).not.toContain(
      'privileged-path-without-role-check',
    );
    expect(
      signalsFromRoute(
        route({ fullPath: '/api/admin/users', roleGuards: [{ name: 'requireRole' }] }),
      ),
    ).not.toContain('privileged-path-without-role-check');
    expect(
      signalsFromRoute(
        route({
          fullPath: '/api/admin/users',
          authzEvidence: [
            { kind: 'role-check', blocking: true, expr: 'x', fn: 'f', where: 'handler' },
          ],
        }),
      ),
    ).not.toContain('privileged-path-without-role-check');
  });

  it('output is sorted, unique and inside the catalog', () => {
    const s = signalsFromRoute(
      route({ protected: false, authorization: 'none', models: ['M'], massAssignment: true }),
    );
    expect(s).toEqual([...new Set(s)].sort());
    for (const x of s) expect(x in SIGNAL_CATALOG).toBe(true);
  });
});

describe('jwt + secrets signals', () => {
  const u = (o: any) => ({
    fn: 'f#g',
    file: 'f.js',
    op: 'sign',
    secretSource: {},
    flags: [],
    line: 1,
    usedByRoutes: [],
    ...o,
  });
  it('jwt flags → signals', () => {
    expect(signalsFromJwtUsage(u({ flags: ['hardcoded-secret'], expiresIn: '7d' }))).toEqual([
      'jwt:hardcoded-secret',
    ]);
    expect(signalsFromJwtUsage(u({ op: 'sign', expiresIn: null }))).toEqual(['jwt:no-expiry']);
    expect(
      signalsFromJwtUsage(
        u({ op: 'verify', flags: ['literal-fallback', 'algorithm-none', 'ignoreExpiration'] }),
      ),
    ).toEqual(['jwt:algorithm-none', 'jwt:ignore-expiration', 'jwt:literal-fallback']);
    expect(signalsFromJwtUsage(u({ op: 'decode', flags: ['decode-only'] }))).toEqual([
      'jwt:decode-only',
    ]);
    expect(signalsFromJwtUsage(u({ op: 'verify' }))).toEqual([]);
  });
  it('secrets → signals', () => {
    const s = (o: any) => ({ id: 'x', name: 'N', usedBy: [], ...o });
    expect(signalsFromSecrets([s({ source: 'code', kind: 'hardcoded-secret' })])).toEqual([
      'secret:hardcoded',
    ]);
    expect(
      signalsFromSecrets([s({ source: 'env', name: 'MONGO_URI', definedIn: 'server/.env' })]),
    ).toEqual(['secret:connection-string-credentials', 'secret:env-file-committed']);
    expect(signalsFromSecrets([s({ source: 'env', name: 'JWT_SECRET' })])).toEqual([]); // read from env, not defined in repo
    expect(signalsFromSecrets([])).toEqual([]);
  });
});
