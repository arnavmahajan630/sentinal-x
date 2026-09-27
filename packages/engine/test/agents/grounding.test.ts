import { beforeAll, describe, expect, it } from 'vitest';
import { groundHypothesis } from '../../src/agents';
import type { GroundingDeps, Hypothesis, ToolCallRecord } from '../../src/agents';
import { fixtureEngine } from '../facts/helpers';
import { registry } from './helpers';

let deps: GroundingDeps;
const rec = (
  seq: number,
  tool: string,
  args: unknown,
  output: unknown,
  ok = true,
): ToolCallRecord => ({
  runId: 'r',
  seq,
  callId: `c${seq}`,
  tool,
  args,
  ok,
  output,
  durationMs: 1,
  ts: '',
});

beforeAll(async () => {
  const { engine } = await fixtureEngine();
  const gaps = await engine.getAuthorizationGaps();
  deps = {
    engine,
    registry: registry(),
    allowedTypes: ['idor', 'missing-auth', 'jwt-security', 'secret-exposure', 'mass-assignment'],
    existing: [],
    calls: [
      rec(1, 'getRoute', { route: 'GET /api/orders/:id' }, { id: 'GET /api/orders/:id' }),
      rec(2, 'getRoute', { route: 'DELETE /api/orders/:id' }, { id: 'DELETE /api/orders/:id' }),
      rec(3, 'getAuthorizationGaps', {}, gaps),
      rec(4, 'getRoute', { route: 'GET /api/orders/:id' }, { error: 'x' }, false),
      rec(5, 'recordObservation', { text: 'x' }, { recorded: true }),
      rec(6, 'getRoute', { route: 'GET /api/users/:id' }, {}),
      rec(7, 'getRoute', { route: 'GET /api/health' }, {}),
      rec(8, 'getJwtUsage', {}, await engine.getJwtUsage()),
      rec(9, 'getSecrets', {}, await engine.getSecrets()),
    ],
  };
});

const route = (r: string) => ({ kind: 'route' as const, route: r });
const ground = (input: Parameters<typeof groundHypothesis>[1], over: Partial<GroundingDeps> = {}) =>
  groundHypothesis({ ...deps, ...over }, input);

describe('groundHypothesis: accepts real, supported proposals and derives everything itself', () => {
  it('idor on the seeded IDOR route (evidence: route-scoped call)', async () => {
    const r = await ground({ type: 'idor', subject: route('GET /api/orders/:id'), evidence: [1] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grounded).toMatchObject({
      type: 'idor',
      verifierTemplate: 'idor',
      verification: 'dynamic',
      severityHint: 'high',
      subject: { kind: 'route', route: 'GET /api/orders/:id' },
    });
    expect(r.grounded.playbook).toMatch(/^idor@[0-9a-f]{8}$/);
    expect(r.grounded.affectedNodes).toEqual(
      expect.arrayContaining([
        'Route:GET /api/orders/:id',
        'Function:server/controllers/order.controller.js#getOrder',
        'Model:Order',
        'Asset:Order.paymentDetails',
        'Asset:Order.customerId',
      ]),
    );
    expect(r.grounded.signals).toContain('authorization:unknown');
  });

  it('evidence may be a listing call whose output contains the route; route ids are normalized', async () => {
    const r = await ground({ type: 'idor', subject: route('get /api/orders/:id'), evidence: [3] });
    expect(r.ok && r.grounded.subject).toEqual({ kind: 'route', route: 'GET /api/orders/:id' });
  });

  it('jwt and secret subjects', async () => {
    const jwt = await ground({
      type: 'jwt-security',
      subject: { kind: 'jwt', fn: 'server/routes/auth.routes.js#anon@7:23' },
      evidence: [8],
    });
    expect(jwt.ok && jwt.grounded).toMatchObject({
      type: 'jwt-security',
      verifierTemplate: null,
      verification: 'undecided',
      signals: ['jwt:hardcoded-secret'],
    });
    expect(jwt.ok && jwt.grounded.affectedNodes).toContain('Route:POST /api/auth/login');
    const sec = await ground({
      type: 'secret-exposure',
      subject: { kind: 'secret', id: 'Secret:env:MONGO_URI' },
      evidence: [9],
    });
    expect(sec.ok && sec.grounded.affectedNodes).toContain('Secret:env:MONGO_URI');
  });
});

describe('groundHypothesis: rejects ungrounded proposals with a reason the agent can act on', () => {
  const err = async (
    input: Parameters<typeof groundHypothesis>[1],
    over?: Partial<GroundingDeps>,
  ) => {
    const r = await ground(input, over);
    if (r.ok) throw new Error('expected rejection');
    return r.error;
  };

  it('signal gate: blocking ownership check → no idor; harmless route → no missing-auth', async () => {
    const e1 = await err({ type: 'idor', subject: route('DELETE /api/orders/:id'), evidence: [2] });
    expect(e1.code).toBe('not_supported_by_facts');
    expect(e1.message).toContain('authorization:present');
    expect(
      (await err({ type: 'missing-auth', subject: route('GET /api/health'), evidence: [7] })).code,
    ).toBe('not_supported_by_facts');
  });

  it('unknown route → not_found with suggestions; unknown playbook; reference playbook; not allowed; wrong subject kind', async () => {
    const e = await err({ type: 'idor', subject: route('GET /api/order/:id'), evidence: [1] });
    expect(e).toMatchObject({
      code: 'not_found',
      suggestions: expect.arrayContaining(['GET /api/orders/:id']),
    });
    expect(
      (await err({ type: 'idorr', subject: route('GET /api/orders/:id'), evidence: [1] }))
        .suggestions,
    ).toContain('idor');
    expect(
      (await err({ type: 'authorization', subject: route('GET /api/orders/:id'), evidence: [1] }))
        .code,
    ).toBe('invalid_argument');
    expect(
      (
        await err(
          { type: 'idor', subject: route('GET /api/orders/:id'), evidence: [1] },
          { allowedTypes: ['missing-auth'] },
        )
      ).code,
    ).toBe('not_allowed');
    expect(
      (await err({ type: 'jwt-security', subject: route('GET /api/orders/:id'), evidence: [1] }))
        .message,
    ).toContain('jwt subject');
  });

  it('evidence: missing, unknown call, failed call, non-fact call, not about the subject', async () => {
    const base = { type: 'idor', subject: route('GET /api/orders/:id') };
    expect((await err({ ...base, evidence: [] })).code).toBe('invalid_argument');
    expect((await err({ ...base, evidence: [99] })).message).toContain(
      'not a tool call of this run',
    );
    expect((await err({ ...base, evidence: [4] })).message).toContain('failed');
    expect((await err({ ...base, evidence: [5] })).message).toContain('not a fact query');
    const other = await err({ ...base, evidence: [6] }); // a getRoute for a different route
    expect(other.code).toBe('invalid_evidence');
    expect(other.message).toContain('None of the cited calls');
  });

  it('duplicates in the same run', async () => {
    const existing = [
      { type: 'idor', subject: { kind: 'route', route: 'GET /api/orders/:id' } } as Hypothesis,
    ];
    expect(
      (
        await err(
          { type: 'idor', subject: route('GET /api/orders/:id'), evidence: [1] },
          { existing },
        )
      ).code,
    ).toBe('duplicate');
  });
});
