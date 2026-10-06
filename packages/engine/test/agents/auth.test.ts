import { describe, expect, it } from 'vitest';
import { ScriptedProvider, authAgent, call, finishCall } from '../../src/agents';
import { harness, lastTool, registry } from './helpers';

// ScriptedProvider can only assert what tool calls were made, not that a real model
// would *decline* to call a tool (e.g. refusing to flag login/register as missing-auth).
// Case 5 below pins the prompt content that carries that instruction to the model; the
// actual judgment call is only verified by the manual live-run smoke test (see the C6
// plan's Verification section), not by this suite.

describe('authAgent: scope is pinned to the four access-control playbooks', () => {
  it('defaults hypothesisTypes to vulnerability playbooks whose agent === auth', () => {
    const reg = registry();
    const types = reg
      .listPlaybooks({ kind: 'vulnerability', agent: 'auth' })
      .map((p) => p.type)
      .sort();
    expect(types).toEqual(['idor', 'jwt-security', 'missing-auth', 'privilege-escalation']);
    expect(authAgent.hypothesisTypes).toBeUndefined();
    expect(authAgent.playbooks?.slice().sort()).toEqual(types);
  });
});

describe('authAgent: seeded IDOR end-to-end', () => {
  it('finds GET /api/orders/:id, grounds affectedNodes/playbook/verifierTemplate mechanically', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getAuthorizationGaps', {}), // #1
      call('getRoute', { route: 'GET /api/orders/:id' }), // #2
      call('getDataflow', { route: 'GET /api/orders/:id' }), // #3
      call('proposeHypothesis', {
        type: 'idor',
        subject: { kind: 'route', route: 'GET /api/orders/:id' },
        evidence: [2],
        rationale: 'No blocking ownership check stands between the id param and Order.findById.',
        confidence: 'high',
      }), // #4
      finishCall('seeded IDOR found', 'findings'),
    ]);
    const r = await h.run({ agent: authAgent, provider });
    expect(r).toMatchObject({ status: 'completed', outcome: 'findings', agent: 'auth' });
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp.type).toBe('idor');
    expect(hyp.playbook).toMatch(/^idor@/);
    expect(hyp.verifierTemplate).toBe('idor');
    expect(hyp.affectedNodes).toEqual(
      expect.arrayContaining(['Route:GET /api/orders/:id', 'Model:Order']),
    );
  });
});

describe('authAgent: mechanical false-positive rejection on safe routes', () => {
  const cases: Array<{ route: string; note: string }> = [
    { route: 'DELETE /api/orders/:id', note: 'guarded ownership-compare (403)' },
    { route: 'GET /api/orders/mine/:id', note: 'user-scoped-query' },
    { route: 'GET /api/admin/stats', note: 'role-check via requireRole middleware' },
  ];

  for (const { route, note } of cases) {
    it(`refuses idor on ${route} (${note}), accepts the corrective safe observation`, async () => {
      const h = await harness();
      const provider = new ScriptedProvider([
        call('getRoute', { route }), // #1
        call('proposeHypothesis', {
          type: 'idor',
          subject: { kind: 'route', route },
          evidence: [1],
          rationale: 'Looks like an IDOR at a glance.',
          confidence: 'medium',
        }), // #2 — expected to be rejected
        (c) => {
          expect(lastTool(c.messages)).toMatchObject({
            ok: false,
            error: { code: 'not_supported_by_facts' },
          });
          return call('recordObservation', {
            kind: 'safe',
            text: `${route} has a blocking ${note}`,
            evidence: [1],
          });
        },
        finishCall('nothing to report', 'none'),
      ]);
      const r = await h.run({ agent: authAgent, provider });
      expect(r).toMatchObject({ status: 'completed', outcome: 'none' });
      expect(r.hypotheses).toEqual([]);
      expect(r.observations).toMatchObject([{ kind: 'safe' }]);
    });
  }
});

describe('authAgent: JWT hypothesis path (documents the known verifierTemplate gap)', () => {
  it('grounds a jwt-security hypothesis but leaves verifierTemplate null — jwt-security.md has verification: undecided', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getJwtUsage', {}), // #1
      (c) => {
        const usages = lastTool(c.messages).data as { fn: string; flags: string[] }[];
        const fn = usages.find((u) => u.flags.includes('hardcoded-secret'))!.fn;
        return call('proposeHypothesis', {
          type: 'jwt-security',
          subject: { kind: 'jwt', fn },
          evidence: [1],
          rationale: 'JWT is signed with a hardcoded secret literal.',
          confidence: 'high',
        });
      }, // #2
      finishCall('jwt weakness found', 'findings'),
    ]);
    const r = await h.run({ agent: authAgent, provider });
    expect(r.status).toBe('completed');
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp.type).toBe('jwt-security');
    expect(hyp.signals).toContain('jwt:hardcoded-secret');
    // Known gap inherited from C4: playbooks/jwt-security.md has verifierTemplate: null
    // (verification: undecided), so this hypothesis can never be queued for verification
    // via requestVerification. Not a C6 bug — documented here, not papered over.
    expect(hyp.verifierTemplate).toBeNull();
  });
});

describe('authAgent: requestVerification queuing is optional, never required', () => {
  it('queues the idor hypothesis for verification when the agent chooses to', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'GET /api/orders/:id' }), // #1
      call('proposeHypothesis', {
        type: 'idor',
        subject: { kind: 'route', route: 'GET /api/orders/:id' },
        evidence: [1],
        rationale: 'No blocking ownership check.',
        confidence: 'high',
      }), // #2
      (c) => call('requestVerification', { hypothesisId: lastTool(c.messages).data.hypothesisId }), // #3
      finishCall('seeded IDOR found, queued for verification', 'findings'),
    ]);
    const r = await h.run({ agent: authAgent, provider });
    expect(r.verificationRequests).toMatchObject([{ template: 'idor' }]);
    expect(r.hypotheses[0]!.status).toBe('verification-requested');
  });
});

describe('authAgent: prompt carries the login/register false-positive instruction', () => {
  it("missing-auth.md's False-positive rules section (injected verbatim by buildSystemPrompt) names auth endpoints as public by design", () => {
    const reg = registry();
    const section = reg.getPlaybook('missing-auth').sections['False-positive rules'];
    expect(section).toBeDefined();
    expect(section).toContain('/login');
    expect(section).toMatch(/public by design/i);
    // This only proves the instruction reaches the model's prompt, not that a real model
    // obeys it — see the file header comment and the C6 plan's live-run verification step.
  });
});
