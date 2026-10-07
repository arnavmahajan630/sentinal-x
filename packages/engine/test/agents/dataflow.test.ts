import { describe, expect, it } from 'vitest';
import { ScriptedProvider, call, dataflowAgent, finishCall } from '../../src/agents';
import { harness, lastTool, registry } from './helpers';

describe('dataflowAgent: scope is pinned to the four dataflow playbooks', () => {
  it('defaults hypothesisTypes to vulnerability playbooks whose agent === dataflow', () => {
    const reg = registry();
    const types = reg
      .listPlaybooks({ kind: 'vulnerability', agent: 'dataflow' })
      .map((p) => p.type)
      .sort();
    expect(types).toEqual(['data-exposure', 'mass-assignment', 'nosql-injection', 'secret-exposure']);
    expect(dataflowAgent.hypothesisTypes).toBeUndefined();
    expect(dataflowAgent.playbooks?.slice().sort()).toEqual(types);
  });
});

describe('dataflowAgent: nosql-injection end-to-end', () => {
  it('grounds on POST /api/auth/login (query built from req.body)', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'POST /api/auth/login' }), // #1
      call('getDataflow', { route: 'POST /api/auth/login' }), // #2
      call('proposeHypothesis', {
        type: 'nosql-injection',
        subject: { kind: 'route', route: 'POST /api/auth/login' },
        evidence: [2],
        rationale: 'The login filter is built directly from req.body.username/password.',
        confidence: 'high',
      }), // #3
      finishCall('nosql injection candidate found', 'findings'),
    ]);
    const r = await h.run({ agent: dataflowAgent, provider });
    expect(r).toMatchObject({ status: 'completed', outcome: 'findings', agent: 'dataflow' });
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp.type).toBe('nosql-injection');
    expect(hyp.playbook).toMatch(/^nosql-injection@/);
    expect(hyp.verifierTemplate).toBe('nosql-injection');
    expect(hyp.affectedNodes).toContain('Route:POST /api/auth/login');
  });

  it('refuses on GET /api/orders/mine/:id — the filter is built from req.params, not body/query', async () => {
    const h = await harness();
    const route = 'GET /api/orders/mine/:id';
    const provider = new ScriptedProvider([
      call('getRoute', { route }), // #1
      call('proposeHypothesis', {
        type: 'nosql-injection',
        subject: { kind: 'route', route },
        evidence: [1],
        rationale: 'Looks like an injectable filter.',
        confidence: 'low',
      }), // #2 — expected to be rejected
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({
          ok: false,
          error: { code: 'not_supported_by_facts' },
        });
        return call('recordObservation', {
          kind: 'safe',
          text: `${route} scopes its filter by req.params.id and req.user.id, not body/query input`,
          evidence: [1],
        });
      },
      finishCall('nothing to report', 'none'),
    ]);
    const r = await h.run({ agent: dataflowAgent, provider });
    expect(r).toMatchObject({ status: 'completed', outcome: 'none' });
    expect(r.hypotheses).toEqual([]);
  });
});

describe('dataflowAgent: mass-assignment end-to-end', () => {
  it('grounds on PUT /api/orders/:id (whole req.body passed into findByIdAndUpdate)', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'PUT /api/orders/:id' }), // #1
      call('proposeHypothesis', {
        type: 'mass-assignment',
        subject: { kind: 'route', route: 'PUT /api/orders/:id' },
        evidence: [1],
        rationale: 'findByIdAndUpdate(id, req.body) passes the whole body through unfiltered.',
        confidence: 'high',
      }), // #2
      finishCall('mass-assignment candidate found', 'findings'),
    ]);
    const r = await h.run({ agent: dataflowAgent, provider });
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp.type).toBe('mass-assignment');
    expect(hyp.verifierTemplate).toBe('mass-assignment');
  });

  it('refuses on GET /api/orders/:id — a read has no write op to mass-assign into', async () => {
    const h = await harness();
    const route = 'GET /api/orders/:id';
    const provider = new ScriptedProvider([
      call('getRoute', { route }), // #1
      call('proposeHypothesis', {
        type: 'mass-assignment',
        subject: { kind: 'route', route },
        evidence: [1],
        rationale: 'Maybe mass-assignment?',
        confidence: 'low',
      }), // #2 — expected to be rejected
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({
          ok: false,
          error: { code: 'not_supported_by_facts' },
        });
        return call('recordObservation', {
          kind: 'safe',
          text: `${route} is a read, no write op touches req.body`,
          evidence: [1],
        });
      },
      finishCall('nothing to report', 'none'),
    ]);
    const r = await h.run({ agent: dataflowAgent, provider });
    expect(r.hypotheses).toEqual([]);
  });
});

describe('dataflowAgent: data-exposure end-to-end', () => {
  it('grounds on POST /api/auth/login leaking User.password', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getExposure', { route: 'POST /api/auth/login' }), // #1
      (c) => {
        const exposures = lastTool(c.messages).data as { assetId: string; tier: string }[];
        const cred = exposures.find((e) => e.tier === 'credential')!;
        return call('proposeHypothesis', {
          type: 'data-exposure',
          subject: { kind: 'route', route: 'POST /api/auth/login' },
          evidence: [1],
          rationale: `The login response returns the full user document including ${cred.assetId}.`,
          confidence: 'high',
        });
      }, // #2
      finishCall('data-exposure candidate found', 'findings'),
    ]);
    const r = await h.run({ agent: dataflowAgent, provider });
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp.type).toBe('data-exposure');
    expect(hyp.verifierTemplate).toBe('data-exposure');
    expect(hyp.affectedNodes).toContain('Asset:User.password');
  });
});

describe('dataflowAgent: secret-exposure path (documents the known verifierTemplate gap)', () => {
  it('grounds a secret-exposure hypothesis but leaves verifierTemplate null — secret-exposure.md has verification: undecided', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getSecrets', {}), // #1
      (c) => {
        const secrets = lastTool(c.messages).data as { id: string; source: string }[];
        const hardcoded = secrets.find((s) => s.source === 'code')!;
        return call('proposeHypothesis', {
          type: 'secret-exposure',
          subject: { kind: 'secret', id: hardcoded.id },
          evidence: [1],
          rationale: 'A secret literal is committed in source.',
          confidence: 'high',
        });
      }, // #2
      finishCall('hardcoded secret found', 'findings'),
    ]);
    const r = await h.run({ agent: dataflowAgent, provider });
    expect(r.status).toBe('completed');
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp.type).toBe('secret-exposure');
    // Known gap: secret-exposure.md has verifierTemplate: null (verification: undecided),
    // same deferral as jwt-security under the Auth agent — documented, not papered over.
    expect(hyp.verifierTemplate).toBeNull();
  });
});
