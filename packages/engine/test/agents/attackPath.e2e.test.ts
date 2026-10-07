import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { attackPathAgent, ScriptedProvider, call, calls, finishCall } from '../../src/agents';
import { harness, lastTool } from './helpers';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const projectId = 'fixture';

function finding(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    projectId,
    type: 'idor',
    severity: 'critical',
    confidence: 'high',
    status: 'open',
    affectedNodes: ['Route:GET /api/orders/:id'],
    evidence: { request: {}, response: {}, expected: '', actual: '' },
    verificationResult: { runId: 'r1', result: 'CONFIRMED', verifiedAt: new Date().toISOString() },
    agentRun: 'run-1',
    references: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('attackPathAgent', () => {
  beforeAll(async () => {
    await connectDb(url);
    await initCollections();
  });
  afterEach(async () => {
    await models.findings.deleteMany({ projectId });
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it('composes two CONFIRMED findings into a labeled chain, attaches it to the first', async () => {
    const f1 = finding({ type: 'idor', affectedNodes: ['Route:GET /api/orders/:id'] });
    const f2 = finding({ type: 'data-exposure', affectedNodes: ['Asset:Order.paymentDetails'] });
    await models.findings.insertMany([f1, f2]);

    const h = await harness();
    const provider = new ScriptedProvider([
      call('getFindings', { status: 'open', verificationResult: 'CONFIRMED' }), // #1
      call('getAttackPath', {
        from: 'Route:GET /api/orders/:id',
        to: 'Asset:Order.paymentDetails',
      }), // #2
      (c) => {
        const path = lastTool(c.messages).data as { nodes: { id: string }[]; edges: unknown[] };
        return call('attachAttackPath', {
          findingId: f1.id,
          chainFindingIds: [f1.id, f2.id],
          path: { nodes: path.nodes.map((n) => n.id), edges: path.edges },
          narrative: 'The IDOR on GET /api/orders/:id directly reaches the leaked payment details.',
          evidence: [2],
        });
      }, // #3
      finishCall('attack path composed', 'findings'),
    ]);
    const r = await h.run({ agent: attackPathAgent, provider });
    expect(r.status).toBe('completed');

    const updated = await models.findings.findOne({ id: f1.id }).lean();
    expect(updated).toMatchObject({
      attackPath: {
        findingIds: [f1.id, f2.id],
        narrative: expect.stringContaining('IDOR'),
      },
    });
  });

  it('rejects attaching a chain to a finding that does not exist', async () => {
    const h = await harness();
    const provider = new ScriptedProvider([
      call('attachAttackPath', {
        findingId: 'does-not-exist',
        chainFindingIds: ['does-not-exist'],
        path: { nodes: [], edges: [] },
        narrative: 'This should never attach — the finding does not exist.',
        evidence: [],
      }),
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({ ok: false, error: { code: 'not_found' } });
        return finishCall('nothing to attach', 'none');
      },
      finishCall('done', 'none'),
    ]);
    const r = await h.run({ agent: attackPathAgent, provider });
    expect(r.status).toBe('completed');
  });

  it('rejects attaching a chain to a finding that is not CONFIRMED/open', async () => {
    const f = finding({
      status: 'resolved',
      verificationResult: { runId: 'r2', result: 'REJECTED', verifiedAt: new Date().toISOString() },
    });
    await models.findings.insertOne(f);
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getFindings', {}),
      call('attachAttackPath', {
        findingId: f.id,
        chainFindingIds: [f.id],
        path: { nodes: [], edges: [] },
        narrative: 'This should be rejected — the finding is not open/CONFIRMED.',
        evidence: [1],
      }),
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({ ok: false, error: { code: 'rejected' } });
        return finishCall('nothing to attach', 'none');
      },
      finishCall('done', 'none'),
    ]);
    await h.run({ agent: attackPathAgent, provider });
    const unchanged = await models.findings.findOne({ id: f.id }).lean();
    expect((unchanged as any)?.attackPath).toBeUndefined();
  });

  it('getAttackPath returning null means the agent has nothing to attach (illustrative — proves the script never calls attachAttackPath, not that a real model would behave this way)', async () => {
    const f1 = finding({ type: 'idor', affectedNodes: ['Route:GET /api/health'] });
    const f2 = finding({ type: 'data-exposure', affectedNodes: ['Asset:Order.paymentDetails'] });
    await models.findings.insertMany([f1, f2]);
    const h = await harness();
    const provider = new ScriptedProvider([
      call('getFindings', { status: 'open', verificationResult: 'CONFIRMED' }), // #1
      call('getAttackPath', { from: 'Route:GET /api/health', to: 'Asset:Order.paymentDetails' }), // #2
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({ ok: true, data: null });
        return finishCall('no real chain between these findings', 'none');
      },
    ]);
    const r = await h.run({ agent: attackPathAgent, provider });
    expect(r).toMatchObject({ status: 'completed', outcome: 'none' });
    const unchanged1 = await models.findings.findOne({ id: f1.id }).lean();
    const unchanged2 = await models.findings.findOne({ id: f2.id }).lean();
    expect((unchanged1 as any)?.attackPath).toBeUndefined();
    expect((unchanged2 as any)?.attackPath).toBeUndefined();
  });

  it('rejects evidence that does not cite a real getAttackPath call', async () => {
    const f = finding();
    await models.findings.insertOne(f);
    const h = await harness();
    const provider = new ScriptedProvider([
      calls({ name: 'getFindings', args: {} }), // #1
      call('attachAttackPath', {
        findingId: f.id,
        chainFindingIds: [f.id],
        path: { nodes: ['Route:GET /api/orders/:id'], edges: [] },
        narrative: 'This cites the wrong tool call as evidence, so it must be rejected.',
        evidence: [1], // #1 was getFindings, not getAttackPath
      }),
      (c) => {
        expect(lastTool(c.messages)).toMatchObject({
          ok: false,
          error: { code: 'invalid_evidence' },
        });
        return finishCall('nothing to attach', 'none');
      },
      finishCall('done', 'none'),
    ]);
    await h.run({ agent: attackPathAgent, provider });
    const unchanged = await models.findings.findOne({ id: f.id }).lean();
    expect((unchanged as any)?.attackPath).toBeUndefined();
  });
});
