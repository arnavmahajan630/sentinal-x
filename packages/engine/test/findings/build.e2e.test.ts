import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { loadConfig } from '../../src/config';
import { fixtureEngine } from '../facts/helpers';
import { buildFinding } from '../../src/findings/build';
import type { Hypothesis } from '../../src/agents/runtime/types';
import type { VerificationRun } from '../../src/verification/engine';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const projectId = 'fixture';

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: randomUUID(),
    runId: 'run-1',
    projectId,
    agent: 'auth',
    type: 'idor',
    subject: { kind: 'route', route: 'GET /api/orders/:id' },
    title: 'IDOR on GET /api/orders/:id',
    rationale: 'no blocking ownership check',
    confidence: 'high',
    evidence: [1],
    affectedNodes: ['Route:GET /api/orders/:id', 'Model:Order', 'Asset:Order.paymentDetails'],
    signals: ['authorization:unknown'],
    playbook: 'idor@abcd1234',
    verifierTemplate: 'idor',
    verification: 'dynamic',
    severityHint: 'high',
    status: 'verification-requested',
    ts: new Date().toISOString(),
    ...overrides,
  };
}

function run(overrides: Partial<VerificationRun> = {}): VerificationRun {
  return {
    id: randomUUID(),
    projectId,
    runId: 'run-1',
    hypothesisId: 'h-1',
    template: 'idor',
    result: 'CONFIRMED',
    evidence: { request: {}, response: {}, expected: '403', actual: '200 + B data' },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildFinding', () => {
  let engine: Awaited<ReturnType<typeof fixtureEngine>>['engine'];
  const cfg = loadConfig({ ...process.env, MONGO_URL: url } as NodeJS.ProcessEnv);

  beforeAll(async () => {
    await connectDb(url);
    await initCollections();
    ({ engine } = await fixtureEngine());
  });
  afterAll(async () => {
    await models.findings.deleteMany({ projectId });
    await models.security_events.deleteMany({ projectId });
    await disconnectDb();
  });

  it('CONFIRMED → persists a Finding, escalated for the financial-tier asset', async () => {
    const h = hypothesis();
    const r = run();
    const finding = await buildFinding(cfg, engine, h, r);
    expect(finding).not.toBeNull();
    expect(finding).toMatchObject({
      type: 'idor',
      status: 'open',
      agentRun: 'run-1',
      verificationResult: { runId: r.id, result: 'CONFIRMED' },
    });
    // base severityBase for idor is 'high'; Order.paymentDetails is financial-tier (0.9) → escalates
    expect(finding!.severity).toBe('critical');
    const stored = await models.findings.findOne({ id: finding!.id }).lean();
    expect(stored).toBeTruthy();
  });

  it('REJECTED → no Finding', async () => {
    const h = hypothesis();
    const r = run({ result: 'REJECTED' });
    const finding = await buildFinding(cfg, engine, h, r);
    expect(finding).toBeNull();
  });

  it('INCONCLUSIVE → no Finding', async () => {
    const h = hypothesis();
    const r = run({ result: 'INCONCLUSIVE' });
    const finding = await buildFinding(cfg, engine, h, r);
    expect(finding).toBeNull();
  });
});
