import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { ChangeEngine } from '../../src/change/engine';
import { indexProject } from '../../src/indexer';
import { buildGraph } from '../../src/graph';
import type { Finding } from '../../src/findings/model';
import type { VerificationRun } from '../../src/verification/engine';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const fixturePath = path.resolve('packages/engine/test/fixtures/vuln-mern');

describe('ChangeEngine e2e (Targeted Re-analysis & Transitions)', () => {
  let mongoAvailable = false;
  let projectId: string;

  beforeAll(async () => {
    try {
      await connectDb(url);
      await initCollections();
      mongoAvailable = true;
    } catch {
      mongoAvailable = false;
    }
  });

  afterAll(async () => {
    if (mongoAvailable) {
      if (projectId) {
        await models.projects.deleteMany({ projectId });
        await models.files.deleteMany({ projectId });
        await models.graph_nodes.deleteMany({ projectId });
        await models.graph_edges.deleteMany({ projectId });
        await models.findings.deleteMany({ projectId });
        await models.change_sets.deleteMany({ projectId });
        await models.security_events.deleteMany({ projectId });
      }
      await disconnectDb();
    }
  });

  it('indexes, tracks code changes, updates graph, and transitions findings: open → resolved → regressed', async () => {
    if (!mongoAvailable) {
      console.log('Skipping MongoDB e2e test (MongoDB not running locally)');
      return;
    }

    // 1. Initial indexing and graph build
    const idx = await indexProject(fixturePath);
    projectId = idx.projectId;
    await buildGraph(projectId);

    // 2. Seed an initial open IDOR finding on GET /api/orders/:id
    const now = new Date().toISOString();
    const seededFinding: Finding = {
      id: 'finding-idor-1',
      projectId,
      type: 'idor',
      severity: 'high',
      confidence: 'high',
      status: 'open',
      affectedNodes: [
        'Route:GET /api/orders/:id',
        'Function:server/controllers/order.controller.js#getOrder',
      ],
      evidence: {
        request: { method: 'GET', path: '/api/orders/order-2' },
        response: { status: 200 },
        expected: '403 or 404',
        actual: '200 OK',
      },
      verificationResult: { runId: 'v-init-1', result: 'CONFIRMED', verifiedAt: now },
      agentRun: 'run-init',
      references: {},
      createdAt: now,
      updatedAt: now,
    };
    await models.findings.create(seededFinding);

    const changeEngine = new ChangeEngine();

    // 3. Simulate code change in orders route where fix was applied (verifier returns REJECTED)
    const fixVerifier = async (f: Finding): Promise<VerificationRun> => ({
      id: 'v-fix-run',
      projectId,
      runId: 'reverify-fix',
      hypothesisId: f.agentRun,
      template: 'idor',
      result: 'REJECTED',
      evidence: {
        request: { method: 'GET', path: '/api/orders/order-2' },
        response: { status: 403 },
        expected: '403 or 404',
        actual: '403 Forbidden',
      },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });

    const fixResult = await changeEngine.processChange(projectId, {
      changedFiles: ['server/routes/orders.routes.js'],
      verifier: fixVerifier,
      runAgents: false,
    });

    expect(fixResult.changeSet.status).toBe('completed');
    expect(fixResult.impact.impactedRoutes).toContain('Route:GET /api/orders/:id');
    expect(fixResult.transitions).toHaveLength(1);
    expect(fixResult.transitions[0]!.findingId).toBe('finding-idor-1');
    expect(fixResult.transitions[0]!.fromStatus).toBe('open');
    expect(fixResult.transitions[0]!.toStatus).toBe('resolved');

    // Verify finding in DB is now resolved
    const dbFindingResolved = await models.findings.findOne({ id: 'finding-idor-1' }).lean();
    expect((dbFindingResolved as any).status).toBe('resolved');

    // 4. Simulate reverting the fix: verifier now CONFIRMED again (finding flips resolved → regressed)
    const regressVerifier = async (f: Finding): Promise<VerificationRun> => ({
      id: 'v-regress-run',
      projectId,
      runId: 'reverify-regress',
      hypothesisId: f.agentRun,
      template: 'idor',
      result: 'CONFIRMED',
      evidence: {
        request: { method: 'GET', path: '/api/orders/order-2' },
        response: { status: 200 },
        expected: '403 or 404',
        actual: '200 OK',
      },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });

    const regressResult = await changeEngine.processChange(projectId, {
      changedFiles: ['server/routes/orders.routes.js'],
      verifier: regressVerifier,
      runAgents: false,
    });

    expect(regressResult.transitions).toHaveLength(1);
    expect(regressResult.transitions[0]!.findingId).toBe('finding-idor-1');
    expect(regressResult.transitions[0]!.fromStatus).toBe('resolved');
    expect(regressResult.transitions[0]!.toStatus).toBe('regressed');

    // Verify finding in DB is now regressed
    const dbFindingRegressed = await models.findings.findOne({ id: 'finding-idor-1' }).lean();
    expect((dbFindingRegressed as any).status).toBe('regressed');

    // Verify change_sets and security_events persisted
    const changeSets = await models.change_sets.find({ projectId }).lean();
    expect(changeSets.length).toBeGreaterThanOrEqual(2);

    const changeEvents = await models.security_events
      .find({
        projectId,
        type: {
          $in: ['change.detected', 'change.completed', 'finding.resolved', 'finding.regressed'],
        },
      })
      .lean();
    expect(changeEvents.length).toBeGreaterThanOrEqual(4);
  });
});
