import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { ScriptedProvider, calls, finishCall } from '../../src/agents';
import { runAssessment } from '../../src/orchestrator/run';
import { fixtureEngine } from '../facts/helpers';
import { PLAYBOOKS_DIR } from '../knowledge/helpers';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const projectId = 'fixture_e2e';

describe('orchestrator e2e MongoDB persistence', () => {
  let mongoAvailable = false;
  let engine: any;

  beforeAll(async () => {
    try {
      await connectDb(url);
      await initCollections();
      mongoAvailable = true;
    } catch {
      mongoAvailable = false;
    }
    ({ engine } = await fixtureEngine());
  });

  afterAll(async () => {
    if (mongoAvailable) {
      await models.findings.deleteMany({ projectId });
      await models.security_events.deleteMany({ projectId });
      await models.agent_runs.deleteMany({ projectId });
      await disconnectDb();
    }
  });

  it('persists assessment lifecycle to security_events and agent_runs when MongoDB is connected', async () => {
    if (!mongoAvailable) {
      console.log('Skipping MongoDB e2e test (MongoDB not running locally)');
      return;
    }

    const provider = new ScriptedProvider([
      calls({ name: 'getSecrets', args: {} }),
      finishCall('Checked secrets', 'none'),
      calls({ name: 'getUnprotectedRoutes' }),
      finishCall('Checked unprotected routes', 'none'),
    ]);

    const result = await runAssessment(projectId, {
      provider,
      engine,
      playbooksDir: PLAYBOOKS_DIR,
      enableVerification: false,
      retryDelaysMs: [0, 0],
    });

    expect(result.status).toBe('completed');

    // Verify security_events persisted
    const events = await models.security_events.find({ projectId }).lean();
    expect(events.length).toBeGreaterThanOrEqual(2);
    const types = events.map((e: any) => e.type);
    expect(types).toContain('assessment.started');
    expect(types).toContain('assessment.finished');
  });
});
