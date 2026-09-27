import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import {
  MongoRunStore,
  ScriptedProvider,
  call,
  calls,
  createMongoCheckpointer,
  finishCall,
  getRunSteps,
  runAgent,
} from '../../src/agents';
import { createFactEngine } from '../../src/facts';
import { buildGraph } from '../../src/graph';
import { indexProject } from '../../src/indexer';
import { FIXTURE } from '../graph/helpers';
import { registry, testAgent } from './helpers';

// Needs MongoDB. Real index → graph → FactEngine(Mongo) → agent runtime → Mongo trace + LangGraph checkpoints.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
let tmp: string;
let pid: string;
const runIds: string[] = [];

beforeAll(async () => {
  await connectDb(url);
  await initCollections();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-agent-'));
  await fs.cp(FIXTURE, tmp, { recursive: true });
  pid = (await indexProject(tmp)).projectId;
  await buildGraph(pid);
});
afterAll(async () => {
  for (const c of ['files', 'graph_nodes', 'graph_edges', 'security_events'] as const)
    await models[c].deleteMany({ projectId: pid });
  await models.projects.deleteMany({ projectId: pid });
  await models.agent_runs.deleteMany({ runId: { $in: runIds } });
  for (const c of ['agent_steps', 'tool_calls', 'observations', 'hypotheses'] as const)
    await models[c].deleteMany({ runId: { $in: runIds } });
  const db = mongoose.connection.db!;
  await db.collection('agent_checkpoints').deleteMany({ thread_id: { $in: runIds } });
  await db.collection('agent_checkpoint_writes').deleteMany({ thread_id: { $in: runIds } });
  await fs.rm(tmp, { recursive: true, force: true });
  await disconnectDb();
});

describe('runAgent on the real stack (Mongo store + checkpointer + Mongo-backed facts)', () => {
  it('persists a replayable trace and checkpoints; hypotheses derive nodes from the live graph', async () => {
    const provider = new ScriptedProvider([
      call('getUnprotectedRoutes'),
      call('getRoute', { route: 'GET /api/users/:id' }),
      calls({
        name: 'proposeHypothesis',
        args: {
          type: 'missing-auth',
          subject: { kind: 'route', route: 'GET /api/users/:id' },
          evidence: [2],
          rationale: 'Anonymous callers receive the user document including its password.',
          confidence: 'high',
        },
      }),
      finishCall('one public data route', 'findings'),
    ]);
    const r = await runAgent({
      projectId: pid,
      agent: testAgent,
      goal: 'find missing auth',
      provider,
      registry: registry(),
      retryDelaysMs: [0],
    });
    runIds.push(r.runId);
    expect(r).toMatchObject({ status: 'completed', outcome: 'findings' });
    expect(r.hypotheses[0]!.affectedNodes).toEqual(
      expect.arrayContaining(['Route:GET /api/users/:id', 'Model:User', 'Asset:User.password']),
    );

    // Mongo: run, contiguous steps, tool calls with full output, observations/hypotheses
    const run = await models.agent_runs.findOne({ runId: r.runId }).lean<any>();
    expect(run).toMatchObject({
      status: 'completed',
      agent: 'auth',
      projectId: pid,
      stepCount: r.steps,
    });
    const steps = await getRunSteps(r.runId);
    expect(steps.map((s) => s.seq)).toEqual(steps.map((_, i) => i + 1));
    expect(steps.at(-1)!.kind).toBe('run.finished');
    expect((await getRunSteps(r.runId, 3)).map((s) => s.seq)).toEqual(
      steps.slice(3).map((s) => s.seq),
    ); // SSE replay after seq
    const tcs = await new MongoRunStore().getToolCalls(r.runId);
    expect(tcs.map((t) => t.tool)).toEqual([
      'getUnprotectedRoutes',
      'getRoute',
      'proposeHypothesis',
      'finish',
    ]);
    expect((tcs[1]!.output as any).id).toBe('GET /api/users/:id');
    expect(await models.hypotheses.countDocuments({ runId: r.runId })).toBe(1);

    // unique (runId, seq) is enforced
    await expect(
      models.agent_steps.create({
        runId: r.runId,
        seq: 1,
        kind: 'dup',
        title: 'x',
        ts: new Date(),
      }),
    ).rejects.toThrow(/duplicate key/i);

    // LangGraph checkpoint readable by thread_id = runId, with the conversation state
    const tuple = await createMongoCheckpointer().getTuple({
      configurable: { thread_id: r.runId },
    });
    expect(tuple).toBeDefined();
    const messages = (tuple!.checkpoint.channel_values as any).messages as { role: string }[];
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(4);
    expect((tuple!.checkpoint.channel_values as any).done).toMatchObject({ status: 'completed' });
  });

  it('a fresh engine per run sees graph changes (facts are a per-run snapshot)', async () => {
    const before = await createFactEngine(pid).getRoute('GET /api/orders/:id');
    expect(before.authorization).toBe('unknown');
    const provider = new ScriptedProvider([
      call('getRoute', { route: 'GET /api/orders/:id' }),
      finishCall('checked'),
    ]);
    const r = await runAgent({
      projectId: pid,
      agent: testAgent,
      goal: 'check',
      provider,
      registry: registry(),
      retryDelaysMs: [0],
    });
    runIds.push(r.runId);
    const out = (await new MongoRunStore().getToolCalls(r.runId))[0]!.output as any;
    expect(out).toMatchObject({ id: 'GET /api/orders/:id', authorization: 'unknown' });
  });
});
