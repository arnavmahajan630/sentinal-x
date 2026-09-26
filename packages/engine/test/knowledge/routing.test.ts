import { beforeAll, describe, expect, it } from 'vitest';
import type { FactEngine } from '../../src/facts/engine';
import { collectSignals, signalsFromJwtUsage } from '../../src/knowledge';
import type { ProjectSignals } from '../../src/knowledge';
import { fixtureEngine } from '../facts/helpers';
import { realRegistry } from './helpers';

const reg = realRegistry();
let engine: FactEngine;
let ps: ProjectSignals;
beforeAll(async () => {
  ({ engine } = await fixtureEngine());
  ps = await collectSignals(engine);
});

const route = (id: string) =>
  reg
    .matchPlaybooks(ps.routes[id]!, { includeReferences: false })
    .map((m) => m.playbook.type)
    .sort();

/** facts → signals → playbooks on the seeded vulnerable app: the whole point of C4's routing */
describe('fixture routing (facts → signals → playbooks)', () => {
  it('covers exactly the mounted routes', () => {
    expect(Object.keys(ps.routes)).toHaveLength(15);
  });

  it('the seeded IDOR routes route to idor (and the authorization reference)', async () => {
    expect(route('GET /api/orders/:id')).toEqual(['data-exposure', 'idor']);
    expect(
      reg.getPlaybooksForSignals(ps.routes['GET /api/orders/:id']!).map((p) => p.type),
    ).toContain('authorization');
    expect(route('PUT /api/orders/:id')).toEqual(['data-exposure', 'idor', 'mass-assignment']);
  });

  it('routes with a blocking authorization check do NOT route to idor / privilege playbooks', () => {
    expect(route('DELETE /api/orders/:id')).toEqual([]);
    expect(route('GET /api/orders/mine/:id')).toEqual(['data-exposure']);
    expect(route('GET /api/admin/stats')).toEqual([]);
    expect(route('DELETE /api/admin/users/:id')).toEqual([]);
  });

  it('public/unauthenticated data routes', () => {
    expect(route('GET /api/users/:id')).toEqual(['data-exposure', 'idor', 'missing-auth']);
    expect(route('GET /api/users/:id/orders')).toEqual(['data-exposure', 'idor', 'missing-auth']);
    expect(route('POST /api/auth/login')).toEqual([
      'data-exposure',
      'missing-auth',
      'nosql-injection',
    ]);
    expect(route('POST /api/auth/register')).toEqual([
      'data-exposure',
      'mass-assignment',
      'missing-auth',
    ]);
    expect(route('POST /api/orders')).toEqual(['data-exposure', 'mass-assignment']);
  });

  it('routes with nothing interesting route to nothing', () => {
    expect(route('GET /api/health')).toEqual([]);
    expect(route('GET /api/profile')).toEqual([]);
    expect(route('GET /api/v1/ping')).toEqual([]);
  });

  it('login is a NoSQL injection candidate because body values build the filter', () => {
    expect(ps.routes['POST /api/auth/login']).toContain('query-built-from-input-object');
    expect(ps.routes['PUT /api/orders/:id']).not.toContain('query-built-from-input-object'); // id from params, body only as update data
  });

  it('jwt + secrets route to jwt-security / secret-exposure', () => {
    const sign = ps.jwt.find((j) => j.op === 'sign')!;
    const verify = ps.jwt.find((j) => j.op === 'verify')!;
    expect(sign.signals).toEqual(['jwt:hardcoded-secret']);
    expect(verify.signals).toEqual(['jwt:literal-fallback']);
    expect(
      reg.matchPlaybooks(ps.jwt.flatMap((j) => j.signals)).map((m) => m.playbook.type),
    ).toEqual(['jwt-security']);
    expect(ps.secrets).toEqual([
      'secret:connection-string-credentials',
      'secret:env-file-committed',
      'secret:hardcoded',
    ]);
    expect(reg.matchPlaybooks(ps.secrets).map((m) => m.playbook.type)).toEqual(['secret-exposure']);
    expect(ps.all).toEqual(
      expect.arrayContaining([
        'jwt:hardcoded-secret',
        'secret:env-file-committed',
        'mass-assignment',
      ]),
    );
  });

  it('every signal produced is in the catalog (no drift between facts and vocabulary)', async () => {
    const { SIGNAL_CATALOG } = await import('../../src/knowledge');
    for (const s of ps.all) expect(s in SIGNAL_CATALOG, s).toBe(true);
    for (const u of await engine.getJwtUsage())
      for (const s of signalsFromJwtUsage(u)) expect(s in SIGNAL_CATALOG).toBe(true);
  });
});
