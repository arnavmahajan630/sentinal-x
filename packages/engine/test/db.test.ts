import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLECTION_NAMES, connectDb, disconnectDb, initCollections, models, pingDb } from '../src';

// Needs a real MongoDB. `docker compose up -d mongo` then MONGO_TEST_URL is auto-defaulted.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';

describe('db collections', () => {
  beforeAll(async () => {
    await connectDb(url);
    await initCollections();
  });
  afterAll(async () => {
    await disconnectDb();
  });

  it('registers all 14 collections', () => {
    expect(COLLECTION_NAMES).toHaveLength(14);
  });

  it('pings', async () => {
    expect(await pingDb()).toBe(true);
  });

  it('creates the required indexes', async () => {
    const keys = async (m: keyof typeof models) =>
      (await models[m].collection.indexes()).map((i) => Object.keys(i.key).join(','));
    expect(await keys('graph_nodes')).toContain('projectId,type');
    expect(await keys('graph_edges')).toContain('projectId,type,from');
    expect(await keys('findings')).toContain('projectId,status');
    expect(await keys('agent_steps')).toContain('runId,ts');
  });
});
