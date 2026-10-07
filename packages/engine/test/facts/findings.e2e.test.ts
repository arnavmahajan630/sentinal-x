import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { fixtureEngine } from './helpers';
import type { FactEngine } from '../../src/facts/engine';

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
    affectedNodes: ['Route:GET /api/orders/:id', 'Asset:Order.paymentDetails'],
    evidence: { request: {}, response: {}, expected: '', actual: '' },
    verificationResult: { runId: 'r1', result: 'CONFIRMED', verifiedAt: new Date().toISOString() },
    agentRun: 'run-1',
    references: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FactEngine.getFindings', () => {
  let engine: FactEngine;

  beforeAll(async () => {
    await connectDb(url);
    await initCollections();
    ({ engine } = await fixtureEngine());
    await models.findings.insertMany([
      finding({ type: 'idor', status: 'open' }),
      finding({ type: 'mass-assignment', status: 'open' }),
      finding({
        type: 'bfla',
        status: 'resolved',
        verificationResult: { runId: 'r2', result: 'REJECTED', verifiedAt: new Date().toISOString() },
      }),
    ]);
  });
  afterAll(async () => {
    await models.findings.deleteMany({ projectId });
    await disconnectDb();
  });

  it('lists all findings for the project with a synthesized title', async () => {
    const all = await engine.getFindings({});
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({ affectedNodes: expect.any(Array) });
    expect(all[0]!.title).toMatch(/^\S+ on /);
  });

  it('filters by status', async () => {
    const open = await engine.getFindings({ status: 'open' });
    expect(open).toHaveLength(2);
    expect(open.every((f) => f.status === 'open')).toBe(true);
  });

  it('filters by type', async () => {
    const idor = await engine.getFindings({ type: 'idor' });
    expect(idor).toHaveLength(1);
    expect(idor[0]!.type).toBe('idor');
  });

  it('filters by verificationResult', async () => {
    const confirmed = await engine.getFindings({ verificationResult: 'CONFIRMED' });
    expect(confirmed).toHaveLength(2);
    const rejected = await engine.getFindings({ verificationResult: 'REJECTED' });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.type).toBe('bfla');
  });
});
