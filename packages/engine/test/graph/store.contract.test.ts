import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { InMemoryGraphStore, MongoGraphStore } from '../../src/graph';
import type { GraphStore } from '../../src/graph';

// Same expectations for every GraphStore implementation → the abstraction is genuinely swappable.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const PID = 'contract-test';

async function seed(s: GraphStore) {
  await s.addNode({ type: 'Route', key: 'GET /a', props: { protected: false, n: { deep: 1 } } });
  await s.addNode({ type: 'Route', key: 'GET /b', props: { protected: true } });
  await s.addNode({ type: 'Function', key: 'f#h', props: { name: 'h' } });
  await s.addNode({ type: 'Model', key: 'M' });
  await s.addNode({ type: 'Database', key: 'mongodb' });
  await s.addEdge({ type: 'CALLS', from: 'Route:GET /a', to: 'Function:f#h', props: { w: 1 } });
  await s.addEdge({ type: 'ACCESSES', from: 'Function:f#h', to: 'Model:M' });
  await s.addEdge({ type: 'ACCESSES', from: 'Model:M', to: 'Database:mongodb' });
  await s.addEdge({ type: 'PROTECTED_BY', from: 'Route:GET /b', to: 'Function:f#h' });
}

function contract(name: string, make: () => Promise<GraphStore>) {
  describe(`GraphStore contract: ${name}`, () => {
    let s: GraphStore;
    beforeAll(async () => {
      s = await make();
      await seed(s);
    });

    it('node / find', async () => {
      expect((await s.node('Route:GET /a'))!.props.protected).toBe(false);
      expect(await s.node('Route:nope')).toBeNull();
      expect(
        (await s.find({ type: 'Route', props: { protected: true } })).map((n) => n.key),
      ).toEqual(['GET /b']);
      expect((await s.find({ type: 'Route', props: { 'n.deep': 1 } })).map((n) => n.key)).toEqual([
        'GET /a',
      ]);
      expect((await s.find({ type: ['Model', 'Database'] })).map((n) => n.key)).toEqual([
        'mongodb',
        'M',
      ]); // sorted by id
      expect((await s.find({ keyPrefix: 'GET' })).length).toBe(2);
      expect((await s.find({ type: 'Route', limit: 1 })).length).toBe(1);
      expect((await s.find({ key: 'M' })).map((n) => n.id)).toEqual(['Model:M']);
    });

    it('edges / edgesOf / neighbors', async () => {
      expect((await s.edgesOf('Function:f#h')).map((e) => e.to)).toEqual(['Model:M']);
      expect((await s.edgesOf('Function:f#h', { dir: 'in' })).map((e) => e.type).sort()).toEqual([
        'CALLS',
        'PROTECTED_BY',
      ]);
      expect((await s.edgesOf('Function:f#h', { dir: 'in', type: 'CALLS' })).length).toBe(1);
      expect((await s.neighbors('Route:GET /a', 'CALLS')).map((n) => n.id)).toEqual([
        'Function:f#h',
      ]);
      expect((await s.neighbors('Function:f#h', undefined, 'in')).map((n) => n.id).sort()).toEqual([
        'Route:GET /a',
        'Route:GET /b',
      ]);
      expect((await s.edges({ type: 'ACCESSES' })).length).toBe(2);
      expect((await s.edges({ from: 'Route:GET /a' }))[0]!.props).toEqual({ w: 1 });
      expect((await s.edges({ props: { w: 1 } })).length).toBe(1);
    });

    it('path is directed, type-filtered and depth-bounded; pathDetail returns edges', async () => {
      expect((await s.path('Route:GET /a', 'Database:mongodb'))!.map((n) => n.id)).toEqual([
        'Route:GET /a',
        'Function:f#h',
        'Model:M',
        'Database:mongodb',
      ]);
      expect(await s.path('Route:GET /a', 'Database:mongodb', ['CALLS'])).toBeNull();
      expect(await s.path('Route:GET /a', 'Database:mongodb', undefined, 2)).toBeNull();
      expect(await s.path('Database:mongodb', 'Route:GET /a')).toBeNull();
      expect((await s.path('Model:M', 'Model:M'))!.length).toBe(1);
      expect(
        (await s.pathDetail('Route:GET /a', 'Model:M', ['CALLS', 'ACCESSES']))!.edges.map(
          (e) => e.type,
        ),
      ).toEqual(['CALLS', 'ACCESSES']);
    });

    it('addNode/addEdge upsert; removeSubtree drops incident edges', async () => {
      await s.addNode({ type: 'Secret', key: 'env:X', props: { a: 1 } });
      await s.addNode({ type: 'Secret', key: 'env:X', props: { a: 2 } });
      expect((await s.node('Secret:env:X'))!.props).toEqual({ a: 2 });
      await s.addEdge({ type: 'USES', from: 'Function:f#h', to: 'Secret:env:X' });
      await s.addEdge({ type: 'USES', from: 'Function:f#h', to: 'Secret:env:X' });
      expect((await s.edgesOf('Secret:env:X', { dir: 'in' })).length).toBe(1);
      await s.removeSubtree(['Secret:env:X']);
      expect(await s.node('Secret:env:X')).toBeNull();
      expect((await s.edgesOf('Function:f#h', { type: 'USES' })).length).toBe(0);
    });

    it('stats', async () => {
      const st = await s.stats();
      expect(st.nodes).toBe(5);
      expect(st.edges).toBe(4);
      expect(st.byNodeType).toMatchObject({ Route: 2, Function: 1, Model: 1, Database: 1 });
    });
  });
}

contract('InMemoryGraphStore', async () => new InMemoryGraphStore(PID));

describe('Mongo contract setup', () => {
  beforeAll(async () => {
    await connectDb(url);
    await initCollections();
    await models.graph_nodes.deleteMany({ projectId: PID });
    await models.graph_edges.deleteMany({ projectId: PID });
  });
  afterAll(async () => {
    await models.graph_nodes.deleteMany({ projectId: PID });
    await models.graph_edges.deleteMany({ projectId: PID });
    await disconnectDb();
  });
  it('connected', () => expect(true).toBe(true));
  contract('MongoGraphStore', async () => new MongoGraphStore(PID));
});
