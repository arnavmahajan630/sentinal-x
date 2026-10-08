import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/bus';
import { MemoryRunStore } from '../../src/agents';
import { ScriptedProvider, call, calls, finishCall } from '../../src/agents';
import { Supervisor } from '../../src/orchestrator/supervisor';
import { runAgentOnDemand, onChange } from '../../src/orchestrator/run';
import { fixtureEngine } from '../facts/helpers';
import { PLAYBOOKS_DIR } from '../knowledge/helpers';
import { lastTool } from '../agents/helpers';

describe('Supervisor & execution pipeline', () => {
  it('executes full assessment across detection agents, handles verification, and emits timeline events', async () => {
    const { engine } = await fixtureEngine();
    const store = new MemoryRunStore();
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe('events', (m) => events.push(m.data));

    // Scripted LLM steps for auth agent then dataflow agent
    const provider = new ScriptedProvider([
      // --- Auth agent turns ---
      calls({ name: 'getUnprotectedRoutes' }), // #1
      calls({ name: 'getRoute', args: { route: 'GET /api/users/:id' } }), // #2
      calls(
        {
          name: 'recordObservation',
          args: {
            kind: 'fact',
            text: 'GET /api/users/:id is public',
            evidence: [2],
          },
        }, // #3
        {
          name: 'proposeHypothesis',
          args: {
            type: 'missing-auth',
            subject: { kind: 'route', route: 'GET /api/users/:id' },
            evidence: [2],
            rationale: 'Public route returns sensitive user data without check.',
            confidence: 'high',
          },
        }, // #4
      ),
      (c) => call('requestVerification', { hypothesisId: lastTool(c.messages).data.hypothesisId }), // #5
      finishCall('Auth investigation done', 'findings'), // #6

      // --- Dataflow agent turns ---
      calls({ name: 'getSecrets', args: {} }), // #7
      finishCall('No hardcoded secrets found', 'none'), // #8
    ]);

    const supervisor = new Supervisor();
    const result = await supervisor.execute(
      'fixture',
      'full',
      ['auth', 'dataflow'],
      {
        provider,
        engine,
        store,
        bus,
        playbooksDir: PLAYBOOKS_DIR,
        enableVerification: false, // will produce INCONCLUSIVE verification without docker sandbox
        retryDelaysMs: [0, 0],
      },
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('full');
    expect(result.projectId).toBe('fixture');
    expect(Object.keys(result.agents)).toHaveLength(2);

    const authSummary = Object.values(result.agents).find((a) => a.agent === 'auth');
    const dataflowSummary = Object.values(result.agents).find((a) => a.agent === 'dataflow');

    expect(authSummary).toBeDefined();
    expect(authSummary!.status).toBe('completed');
    expect(authSummary!.hypothesesCount).toBe(1);

    expect(dataflowSummary).toBeDefined();
    expect(dataflowSummary!.status).toBe('completed');

    expect(result.hypotheses).toHaveLength(1);
    expect(result.verificationRuns).toHaveLength(1);
    expect(result.verificationRuns[0]!.result).toBe('INCONCLUSIVE');

    // Check emitted events on bus
    const eventKinds = events.map((e) => e.kind);
    expect(eventKinds).toContain('assessment.started');
    expect(eventKinds).toContain('assessment.finished');
  });

  it('respects cancellation signal and terminates with cancelled status', async () => {
    const { engine } = await fixtureEngine();
    const store = new MemoryRunStore();
    const bus = new EventBus();

    const controller = new AbortController();
    controller.abort(); // already aborted

    const provider = new ScriptedProvider([finishCall('done')]);
    const supervisor = new Supervisor();

    const result = await supervisor.execute(
      'fixture',
      'full',
      ['auth'],
      {
        provider,
        engine,
        store,
        bus,
        signal: controller.signal,
        playbooksDir: PLAYBOOKS_DIR,
      },
    );

    expect(result.status).toBe('cancelled');
    expect(Object.keys(result.agents)).toHaveLength(0);
  });

  it('runs on-demand single agent through runAgentOnDemand', async () => {
    const { engine } = await fixtureEngine();
    const store = new MemoryRunStore();
    const bus = new EventBus();

    const provider = new ScriptedProvider([
      calls({ name: 'getSecrets', args: {} }),
      finishCall('Dataflow check complete', 'none'),
    ]);

    const result = await runAgentOnDemand('fixture', 'dataflow', {
      provider,
      engine,
      store,
      bus,
      playbooksDir: PLAYBOOKS_DIR,
      retryDelaysMs: [0, 0],
    });

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('agent');
    expect(Object.keys(result.agents)).toHaveLength(1);
    expect(Object.values(result.agents)[0]!.agent).toBe('dataflow');
  });

  it('runs targeted subset of agents through onChange based on relevance', async () => {
    const { engine } = await fixtureEngine();
    const store = new MemoryRunStore();
    const bus = new EventBus();

    const provider = new ScriptedProvider([
      calls({ name: 'getUnprotectedRoutes' }),
      finishCall('Auth change check complete', 'none'),
    ]);

    const result = await onChange(
      'fixture',
      { changedFiles: ['src/routes/auth.ts'] },
      {
        provider,
        engine,
        store,
        bus,
        playbooksDir: PLAYBOOKS_DIR,
        retryDelaysMs: [0, 0],
      },
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('change');
    expect(Object.keys(result.agents)).toHaveLength(1);
    expect(Object.values(result.agents)[0]!.agent).toBe('auth');
  });

  it('routes inter-agent investigation requests from auth to dataflow', async () => {
    const { engine } = await fixtureEngine();
    const store = new MemoryRunStore();
    const bus = new EventBus();

    // 1st agent run: auth calls requestInvestigation then finish
    // 2nd agent run: dataflow runs the routed investigation question
    const provider = new ScriptedProvider([
      // --- Auth agent ---
      calls({
        name: 'requestInvestigation',
        args: {
          agent: 'dataflow',
          question: 'Does the order route input reach findOne unvalidated?',
          refs: ['Route:GET /api/orders/:id'],
        },
      }),
      finishCall('Auth agent requested dataflow analysis', 'none'),

      // --- Routed Dataflow agent ---
      calls({ name: 'getSecrets', args: {} }),
      finishCall('Dataflow answered question', 'none'),
    ]);

    const supervisor = new Supervisor();
    const result = await supervisor.execute(
      'fixture',
      'full',
      ['auth'], // only start with auth; dataflow will be triggered via investigation
      {
        provider,
        engine,
        store,
        bus,
        playbooksDir: PLAYBOOKS_DIR,
        maxInvestigationDepth: 1,
        retryDelaysMs: [0, 0],
      },
    );

    expect(result.status).toBe('completed');
    // Both auth and the routed dataflow runs should be recorded
    const agentNames = Object.values(result.agents).map((a) => a.agent);
    expect(agentNames).toContain('auth');
    expect(agentNames).toContain('dataflow');
    expect(Object.keys(result.agents)).toHaveLength(2);
  });
});
