import { describe, expect, it } from 'vitest';
import { ScriptedProvider, call, calls, finishCall, say } from '../../src/agents';
import type { AgentStep } from '../../src/agents';
import { harness, lastTool } from './helpers';

const kinds = (steps: AgentStep[]) => steps.map((s) => s.kind);

describe('runAgent: happy path (trivial demo-style agent)', () => {
  it('queries facts, records observations, proposes + queues verification, finishes; streams a contiguous trace', async () => {
    const h = await harness();
    const streamed: AgentStep[] = [];
    const provider = new ScriptedProvider([
      calls({ name: 'getUnprotectedRoutes' }), // #1
      calls({ name: 'getRoute', args: { route: 'GET /api/users/:id' } }), // #2
      calls(
        {
          name: 'recordObservation',
          args: {
            kind: 'fact',
            text: 'GET /api/users/:id is public and returns credentials',
            evidence: [2],
          },
        }, // #3
        {
          name: 'proposeHypothesis',
          args: {
            type: 'missing-auth',
            subject: { kind: 'route', route: 'GET /api/users/:id' },
            evidence: [2],
            rationale: 'Public route returns the user document including password.',
            confidence: 'high',
          },
        }, // #4
      ),
      (c) => call('requestVerification', { hypothesisId: lastTool(c.messages).data.hypothesisId }), // #5
      finishCall('Found one public data route.', 'findings'),
    ]);
    // subscribe as soon as the run starts (runId unknown up front → subscribe to every agent channel via store afterwards; also check bus via a listener on the first published message)
    const origPublish = h.bus.publish.bind(h.bus);
    h.bus.publish = ((ch: any, data: any) => {
      if (String(ch).startsWith('agent:')) streamed.push(data);
      return origPublish(ch, data);
    }) as any;

    const r = await h.run({ provider });
    expect(r).toMatchObject({
      status: 'completed',
      outcome: 'findings',
      agent: 'auth',
      projectId: 'fixture',
    });
    expect(r.summary).toBe('Found one public data route.');
    expect(r.usage).toMatchObject({ llmCalls: 5, toolCalls: 6 });
    expect(r.usage.inTok).toBe(500);
    expect(r.observations).toMatchObject([{ kind: 'fact', evidence: [2] }]);
    expect(r.hypotheses).toHaveLength(1);
    const hyp = r.hypotheses[0]!;
    expect(hyp).toMatchObject({
      type: 'missing-auth',
      status: 'verification-requested',
      verifierTemplate: 'missing-auth',
      confidence: 'high',
      evidence: [2],
    });
    expect(hyp.affectedNodes).toEqual(
      expect.arrayContaining(['Route:GET /api/users/:id', 'Model:User', 'Asset:User.password']),
    );
    expect(r.verificationRequests).toMatchObject([
      { hypothesisId: hyp.id, template: 'missing-auth' },
    ]);
    expect(r.playbooks.map((p) => p.split('@')[0])).toEqual([
      'idor',
      'missing-auth',
      'authorization',
    ]); // spec playbooks + applicable reference

    // trace: persisted == streamed, contiguous seq, expected order
    const steps = await h.store.getSteps(r.runId);
    expect(steps.map((s) => s.seq)).toEqual(steps.map((_, i) => i + 1));
    expect(kinds(steps)[0]).toBe('run.started');
    expect(kinds(steps).at(-1)).toBe('run.finished');
    expect(kinds(steps)).toEqual(
      expect.arrayContaining([
        'llm',
        'tool.call',
        'tool.result',
        'observation',
        'hypothesis',
        'verification.requested',
      ]),
    );
    expect(streamed.map((s) => [s.seq, s.kind])).toEqual(steps.map((s) => [s.seq, s.kind]));
    for (const s of streamed) expect(JSON.parse(JSON.stringify(s))).toEqual(s); // JSON-safe UI shape
    expect(streamed[0]).toMatchObject({
      runId: r.runId,
      seq: 1,
      kind: 'run.started',
      ts: expect.any(String),
    });

    // tool calls persisted with full outputs; run record finalised
    const tcs = await h.store.getToolCalls(r.runId);
    expect(tcs.map((t) => [t.seq, t.tool])).toEqual([
      [1, 'getUnprotectedRoutes'],
      [2, 'getRoute'],
      [3, 'recordObservation'],
      [4, 'proposeHypothesis'],
      [5, 'requestVerification'],
      [6, 'finish'],
    ]);
    expect((tcs[1]!.output as any).id).toBe('GET /api/users/:id');
    expect(await h.store.getRun(r.runId)).toMatchObject({
      status: 'completed',
      stepCount: steps.length,
      usage: { llmCalls: 5 },
    });
    expect(await h.store.getHypotheses(r.runId)).toHaveLength(1);
    expect((await h.store.getHypotheses(r.runId))[0]!.status).toBe('verification-requested');

    // global timeline
    expect(h.globalMsgs.map((m) => (m.data as any).kind)).toEqual([
      'agent.run.started',
      'hypothesis.proposed',
      'verification.requested',
      'agent.run.finished',
    ]);
  });

  it('the LLM sees numbered results, the playbook rules and only allowed tool names', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'GET /api/health' }),
      finishCall(),
    ]);
    await h.run({ provider });
    const first = provider.calls[0]!;
    expect(first.messages[0]!.role).toBe('system');
    expect(first.messages[0]!.content).toContain('You cannot confirm vulnerabilities');
    expect(first.messages[0]!.content).toContain('Playbook: idor@');
    expect(first.messages[0]!.content).toContain('False-positive rules');
    expect(first.tools!.map((t) => t.name)).toContain('proposeHypothesis');
    // getFindings (read of already-confirmed findings) and attachAttackPath (attaches a
    // chain to an already-CONFIRMED finding) are sanctioned C8 exceptions — see
    // test/agents/tools.test.ts for the full "no creation/confirmation tool" check.
    const sanctioned = new Set(['getFindings', 'attachAttackPath']);
    expect(
      first.tools!
        .map((t) => t.name)
        .filter((n) => !sanctioned.has(n))
        .some((n) => /finding|confirm/i.test(n)),
    ).toBe(false);
    const second = provider.calls[1]!;
    const toolMsg = second.messages.find((m) => m.role === 'tool')!;
    expect(JSON.parse(toolMsg.content)).toMatchObject({
      call: 1,
      ok: true,
      data: { id: 'GET /api/health' },
    });
    expect(second.messages.find((m) => m.role === 'assistant')!.toolCalls![0]!.name).toBe(
      'getRoute',
    );
  });
});

describe('runAgent: tool errors are fed back, not thrown', () => {
  it('unknown route → structured error with suggestions → agent corrects and continues', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'GET /api/order/:id' }),
      (c) => {
        const t = lastTool(c.messages);
        expect(t).toMatchObject({ call: 1, ok: false, error: { code: 'not_found' } });
        return call('getRoute', { route: t.error.suggestions[0] });
      },
      finishCall('corrected'),
    ]);
    const r = await h.run({ provider });
    expect(r.status).toBe('completed');
    const tcs = await h.store.getToolCalls(r.runId);
    expect(tcs.map((t) => t.ok)).toEqual([false, true, true]);
  });

  it('rejected hypotheses come back with the reason and are not stored', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'DELETE /api/orders/:id' }),
      call('proposeHypothesis', {
        type: 'idor',
        subject: { kind: 'route', route: 'DELETE /api/orders/:id' },
        evidence: [1],
        rationale: 'Order deletion by id looks like an IDOR to me.',
        confidence: 'medium',
      }),
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({
          ok: false,
          error: { code: 'not_supported_by_facts' },
        });
        return call('recordObservation', {
          kind: 'safe',
          text: 'DELETE /api/orders/:id has a blocking ownership check',
          evidence: [1],
        });
      },
      finishCall('nothing to report', 'none'),
    ]);
    const r = await h.run({ provider });
    expect(r).toMatchObject({ status: 'completed', outcome: 'none' });
    expect(r.hypotheses).toEqual([]);
    expect(r.observations).toMatchObject([{ kind: 'safe' }]);
    expect(kinds(await h.store.getSteps(r.runId))).toContain('hypothesis.rejected');
    expect(h.globalMsgs.map((m) => (m.data as any).kind)).not.toContain('hypothesis.proposed');
  });

  it('requestVerification: undecided class (jwt) is refused; duplicate refused; investigation only to allowed agents', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getJwtUsage'),
      call('proposeHypothesis', {
        type: 'jwt-security',
        subject: { kind: 'jwt', fn: 'server/routes/auth.routes.js#anon@7:23' },
        evidence: [1],
        rationale: 'JWT is signed with a hardcoded secret literal in the login handler.',
        confidence: 'high',
      }),
      (c) => call('requestVerification', { hypothesisId: lastTool(c.messages).data.hypothesisId }),
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({ ok: false, error: { code: 'rejected' } });
        expect(lastTool(c.messages).error.message).toContain('undecided');
        return call('requestInvestigation', {
          agent: 'attack-path',
          question: 'Can the forged token reach admin routes?',
        });
      },
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({
          ok: false,
          error: { code: 'not_allowed', suggestions: ['dataflow'] },
        });
        return call('requestInvestigation', {
          agent: 'dataflow',
          question: 'Does the login query allow operator injection?',
          refs: ['Route:POST /api/auth/login'],
        });
      },
      finishCall('jwt weakness found', 'findings'),
    ]);
    const r = await h.run({ provider });
    expect(r.status).toBe('completed');
    expect(r.hypotheses[0]).toMatchObject({
      type: 'jwt-security',
      verifierTemplate: null,
      verification: 'undecided',
      status: 'proposed',
    });
    expect(r.verificationRequests).toEqual([]);
    expect(r.investigationRequests).toMatchObject([
      { from: 'auth', target: 'dataflow', refs: ['Route:POST /api/auth/login'] },
    ]);
  });
});

describe('runAgent: budgets and termination', () => {
  it('maxSteps → inconclusive with a budget.exhausted step; partial results kept', async () => {
    const h = await harness();
    const provider = new ScriptedProvider(() => call('getRoutes'));
    const r = await h.run({ provider, budget: { maxSteps: 3 } });
    expect(r).toMatchObject({
      status: 'inconclusive',
      reason: 'budget:steps',
      usage: { llmCalls: 3 },
    });
    const steps = await h.store.getSteps(r.runId);
    expect(steps.find((s) => s.kind === 'budget.exhausted')!.detail).toMatchObject({
      reason: 'budget:steps',
    });
    expect(kinds(steps).at(-1)).toBe('run.finished');
    // a warning is sent to the model before the last steps
    expect(
      provider.calls
        .at(-1)!
        .messages.some((m) => m.role === 'user' && m.content.startsWith('Budget warning')),
    ).toBe(true);
  });

  it('maxTokens', async () => {
    const h = await harness();
    const provider = new ScriptedProvider(() => ({
      ...call('getRoutes'),
      usage: { inTok: 4000, outTok: 500 },
    }));
    const r = await h.run({ provider, budget: { maxTokens: 8000, maxSteps: 20 } });
    expect(r).toMatchObject({ status: 'inconclusive', reason: 'budget:tokens' });
    expect(r.usage.llmCalls).toBe(2);
  });

  it('missing provider usage is estimated from text size', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      {
        text: '',
        toolCalls: [{ id: 'a', name: 'finish', args: { outcome: 'none', summary: 'nothing' } }],
        usage: { inTok: 0, outTok: 0 },
      },
    ]);
    const r = await h.run({ provider });
    expect(r.usage.inTok).toBeGreaterThan(100);
    expect(r.usage.outTok).toBeGreaterThan(0);
  });

  it('maxToolCalls', async () => {
    const h = await harness();
    const provider = new ScriptedProvider(() =>
      calls({ name: 'getRoutes' }, { name: 'getRoutes' }, { name: 'getRoutes' }),
    );
    const r = await h.run({ provider, budget: { maxToolCalls: 4, maxSteps: 10 } });
    expect(r).toMatchObject({ status: 'inconclusive', reason: 'budget:toolCalls' });
    expect((await h.store.getToolCalls(r.runId)).length).toBe(4);
  });

  it('timeout', async () => {
    const h = await harness();
    const provider = new ScriptedProvider(async () => {
      await new Promise((res) => setTimeout(res, 30));
      return call('getRoutes');
    });
    const r = await h.run({ provider, budget: { timeoutMs: 20, maxSteps: 10 } });
    expect(r).toMatchObject({ status: 'inconclusive', reason: 'budget:timeout' });
  });

  it('no tool use: nudged with forced tool choice, then recovers or ends inconclusive', async () => {
    const h = await harness();
    const recover = new ScriptedProvider([
      say('I think everything is fine'),
      finishCall('all good'),
    ]);
    const r1 = await h.run({ provider: recover });
    expect(r1.status).toBe('completed');
    expect(recover.calls[0]!.opts?.toolChoice).toBe('auto');
    expect(recover.calls[1]!.opts?.toolChoice).toBe('required');
    expect(recover.calls[1]!.messages.at(-1)!.content).toContain('did not call a tool');

    const stubborn = new ScriptedProvider(() => say('just chatting'));
    const r2 = await h.run({ provider: stubborn });
    expect(r2).toMatchObject({ status: 'inconclusive', reason: 'no_tool_use' });
    expect(stubborn.calls).toHaveLength(3);
  });

  it('cancellation via AbortSignal', async () => {
    const h = await harness();
    const ac = new AbortController();
    const provider = new ScriptedProvider((c) => {
      if (c.index === 1) ac.abort();
      return call('getRoutes');
    });
    const r = await h.run({ provider, signal: ac.signal });
    expect(r).toMatchObject({ status: 'cancelled', reason: 'cancelled' });
    expect(await h.store.getRun(r.runId)).toMatchObject({ status: 'cancelled' });
  });
});

describe('runAgent: provider failures never throw', () => {
  it('transient errors are retried (with error steps), then the run continues', async () => {
    const h = await harness();
    let n = 0;
    const provider = new ScriptedProvider(() => {
      if (n++ < 2) throw new Error('429 rate limited');
      return finishCall('recovered');
    });
    const r = await h.run({ provider });
    expect(r.status).toBe('completed');
    expect((await h.store.getSteps(r.runId)).filter((s) => s.kind === 'error')).toHaveLength(2);
  });

  it('persistent failure → status failed with the error persisted', async () => {
    const h = await harness();
    const provider = new ScriptedProvider(() => {
      throw new Error('boom');
    });
    const r = await h.run({ provider });
    expect(r).toMatchObject({ status: 'failed', reason: 'error', error: 'boom' });
    expect(await h.store.getRun(r.runId)).toMatchObject({ status: 'failed', error: 'boom' });
  });
});

describe('runAgent: isolation', () => {
  it('two runs are independent (own ids, own traces, own budgets)', async () => {
    const h = await harness();
    const a = await h.run({
      provider: new ScriptedProvider([
        call('getRoute', { route: 'GET /api/health' }),
        finishCall('run-a'),
      ]),
    });
    const b = await h.run({ provider: new ScriptedProvider([finishCall('run-b')]) });
    expect(a.runId).not.toBe(b.runId);
    expect((await h.store.getSteps(a.runId)).length).toBeGreaterThan(
      (await h.store.getSteps(b.runId)).length,
    );
    expect(await h.store.getToolCalls(b.runId)).toHaveLength(1); // only `finish`
    expect(a.summary).toBe('run-a');
    expect(b.summary).toBe('run-b');
  });
});
