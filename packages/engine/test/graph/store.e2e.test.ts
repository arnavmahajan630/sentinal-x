import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bus, connectDb, disconnectDb, initCollections, models } from '../../src';
import { MongoGraphStore, buildGraph } from '../../src/graph';
import type { BuildGraphResult } from '../../src/graph';
import { indexProject } from '../../src/indexer';
import { FIXTURE } from './helpers';

// Needs MongoDB (`docker compose up -d mongo`). Isolated `sentinelx_test` database.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';

let tmp: string;
let pid: string;
let store: MongoGraphStore;
let first: BuildGraphResult;
const events: any[] = [];
const p = (rel: string) => path.join(tmp, rel);
const rebuild = async () => {
  await indexProject(tmp);
  return buildGraph(pid);
};
async function assertNoDangling() {
  const nodes = new Set((await store.find({})).map((n) => n.id));
  for (const e of await store.edges({})) {
    expect(nodes.has(e.from), `dangling from in ${e.id}`).toBe(true);
    expect(nodes.has(e.to), `dangling to in ${e.id}`).toBe(true);
  }
}

beforeAll(async () => {
  await connectDb(url);
  await initCollections();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-graph-'));
  await fs.cp(FIXTURE, tmp, { recursive: true });
  bus.subscribe('events', (m) => events.push(m));
  const idx = await indexProject(tmp);
  pid = idx.projectId;
  store = new MongoGraphStore(pid);
  first = await buildGraph(pid);
});
afterAll(async () => {
  if (pid) {
    for (const c of ['files', 'graph_nodes', 'graph_edges', 'security_events'] as const)
      await models[c].deleteMany({ projectId: pid });
    await models.projects.deleteMany({ projectId: pid });
  }
  await fs.rm(tmp, { recursive: true, force: true });
  await disconnectDb();
});

describe('buildGraph + MongoGraphStore (DoD queries)', () => {
  it('first build persists the whole model and reports it', async () => {
    const st = await store.stats();
    expect(st.nodes).toBe(first.nodes);
    expect(st.edges).toBe(first.edges);
    expect(first.added).toEqual({ nodes: first.nodes, edges: first.edges });
    expect(st.byNodeType).toMatchObject({ Route: 16, Project: 1, Database: 1, Model: 2 });
    const proj = await models.projects.findOne({ projectId: pid }).lean<any>();
    expect(proj.graph).toMatchObject({ nodes: first.nodes, edges: first.edges });
    expect(
      await models.security_events.countDocuments({ projectId: pid, type: 'graph.built' }),
    ).toBe(1);
    expect(events.some((e) => e.data.kind === 'graph.built')).toBe(true);
    await assertNoDangling();
  });

  it('has unique indexes on (projectId,id)', async () => {
    const idx = await models.graph_nodes.collection.indexes();
    expect(idx.some((i) => i.unique && Object.keys(i.key).join(',') === 'projectId,id')).toBe(true);
    const eidx = await models.graph_edges.collection.indexes();
    expect(eidx.some((i) => i.unique && Object.keys(i.key).join(',') === 'projectId,id')).toBe(
      true,
    );
    expect(eidx.some((i) => Object.keys(i.key).join(',') === 'projectId,to,type')).toBe(true);
  });

  it('find({type:Route, props:{protected:false}}) returns exactly the open mounted routes', async () => {
    const open = (await store.find({ type: 'Route', props: { protected: false, mounted: true } }))
      .map((n) => n.key)
      .sort();
    expect(open).toEqual([
      'GET /api/health',
      'GET /api/users/:id',
      'GET /api/users/:id/orders',
      'GET /api/v1/ping',
      'GET /api/v2/ping',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ]);
  });

  it('POST /orders/:id-style traversal: PROTECTED_BY → CALLS handler → ACCESSES Model → Database', async () => {
    const rid = 'Route:PUT /api/orders/:id';
    const mws = await store.edgesOf(rid, { type: 'PROTECTED_BY' });
    const names = (
      await Promise.all(
        mws.sort((a, b) => a.props!.order - b.props!.order).map((e) => store.node(e.to)),
      )
    ).map((n) => n!.props.name);
    expect(names).toEqual(['cors', 'express.json', 'authenticate']);
    const [handler] = await store.neighbors(rid, 'CALLS');
    expect(handler!.key).toBe('server/controllers/order.controller.js#updateOrder');
    expect((await store.neighbors(handler!.id, 'ACCESSES')).map((n) => n.id)).toEqual([
      'Model:Order',
    ]);
    expect((await store.neighbors('Model:Order', 'ACCESSES')).map((n) => n.id)).toEqual([
      'Database:mongodb',
    ]);
    expect((await store.neighbors('Model:Order', 'ACCESSES', 'in')).map((n) => n.key)).toEqual(
      expect.arrayContaining([
        'server/controllers/order.controller.js#updateOrder',
        'server/controllers/order.controller.js#getOrder',
      ]),
    );
  });

  it('path(): user-controlled id → model via FLOWS_TO/CALLS; detail carries edge props; unreachable = null', async () => {
    const input = 'Input:server/controllers/order.controller.js#updateOrder:req.params.id';
    const path1 = await store.path(input, 'Model:Order', ['FLOWS_TO', 'CALLS']);
    expect(path1!.map((n) => n.id)).toEqual([
      input,
      'Function:server/controllers/order.controller.js#updateOrder',
      'Model:Order',
    ]);
    const d = await store.pathDetail(input, 'Model:Order', ['FLOWS_TO']);
    expect(d!.edges.map((e) => e.type)).toEqual(['FLOWS_TO', 'FLOWS_TO']);
    expect(d!.edges[1]!.props!.ops[0].op).toBe('findByIdAndUpdate');
    expect(await store.path(input, 'Model:Order', ['CALLS'])).toBeNull(); // wrong edge types
    expect(await store.path(input, 'Database:mongodb')).not.toBeNull(); // any edges: input → fn → model → db
    expect(await store.path(input, 'Database:mongodb', undefined, 2)).toBeNull(); // depth bound
    expect((await store.path('Model:Order', 'Model:Order'))!.length).toBe(1);
    expect(await store.path('Model:Order', 'Route:GET /api/health')).toBeNull(); // directed
  });

  it('find(): keyPrefix, limit, exact props; edges(): filters', async () => {
    const fns = await store.find({ type: 'Function', keyPrefix: 'server/controllers/' });
    expect(fns.map((n) => n.key)).toEqual(
      expect.arrayContaining(['server/controllers/order.controller.js#getOrder']),
    );
    expect(fns.every((n) => n.key.startsWith('server/controllers/'))).toBe(true);
    expect(await store.find({ type: 'Route', limit: 3 })).toHaveLength(3);
    expect(
      (await store.find({ type: 'Asset', props: { tier: 'credential' } })).map((n) => n.key).sort(),
    ).toEqual(['User.apiKey', 'User.password']);
    expect(await store.find({ type: ['Model', 'Database'] })).toHaveLength(3);
    expect((await store.edges({ type: 'EXPOSES', from: `Project:${pid}` })).length).toBe(15); // mounted routes
    expect(await store.node('Route:nope')).toBeNull();
  });

  it('addNode/addEdge upsert; removeSubtree deletes node + incident edges', async () => {
    const id = await store.addNode({ type: 'Secret', key: 'env:TEST_ONLY', props: { a: 1 } });
    await store.addNode({ type: 'Secret', key: 'env:TEST_ONLY', props: { a: 2 } });
    expect((await store.node(id))!.props).toEqual({ a: 2 });
    await store.addEdge({
      type: 'USES',
      from: 'Function:server/middleware/auth.js#authenticate',
      to: id,
      props: { via: ['x'] },
    });
    await store.addEdge({
      type: 'USES',
      from: 'Function:server/middleware/auth.js#authenticate',
      to: id,
    });
    expect(await store.edgesOf(id, { dir: 'in' })).toHaveLength(1);
    await store.removeSubtree([id]);
    expect(await store.node(id)).toBeNull();
    expect(await store.edgesOf(id, { dir: 'in' })).toHaveLength(0);
    await assertNoDangling();
  });
});

describe('buildGraph: incremental (diff-apply)', () => {
  it('is idempotent: rebuild with no change → zero delta', async () => {
    const r = await rebuild();
    expect(r.added).toEqual({ nodes: 0, edges: 0 });
    expect(r.changed).toEqual({ nodes: 0, edges: 0 });
    expect(r.removed).toEqual({ nodes: 0, edges: 0 });
    expect(r.changedNodeIds).toEqual([]);
    expect((await store.stats()).nodes).toBe(first.nodes);
  });

  it('a code fix changes only the affected function; ids survive', async () => {
    const f = p('server/controllers/order.controller.js');
    const src = await fs.readFile(f, 'utf8');
    await fs.writeFile(
      f,
      src.replace(
        'const order = await Order.findById(req.params.id);\n  res.json(order);',
        'const order = await Order.findById(req.params.id);\n  if (order.user.toString() !== req.user.id) return res.sendStatus(403);\n  res.json(order);',
      ),
    );
    const r = await rebuild();
    expect(r.removed).toEqual({ nodes: 0, edges: 0 });
    expect(r.changedNodeIds).toContain('Function:server/controllers/order.controller.js#getOrder');
    expect(r.changedNodeIds).not.toContain('Route:POST /api/auth/login');
    expect(r.changedNodeIds).not.toContain('Model:User');
    const fn = await store.node('Function:server/controllers/order.controller.js#getOrder');
    expect(fn!.props.authz.map((a: any) => a.kind)).toContain('ownership-compare'); // fix now visible in the graph
    expect(await store.node('Route:GET /api/orders/:id')).not.toBeNull(); // id stable
    await assertNoDangling();
  });

  it('removing a global middleware re-flags only the routes behind it', async () => {
    const f = p('server/app.js');
    await fs.writeFile(f, (await fs.readFile(f, 'utf8')).replace('app.use(authenticate);\n', ''));
    const r = await rebuild();
    expect(r.removed.edges).toBeGreaterThan(0);
    for (const id of [
      'GET /api/orders/:id',
      'PUT /api/orders/:id',
      'GET /api/admin/stats',
      'GET /api/profile',
    ]) {
      const n = await store.node(`Route:${id}`);
      expect(n!.props, id).toMatchObject({ protected: false, authEnforcement: 'none' });
    }
    expect((await store.node('Route:POST /api/auth/login'))!.props.protected).toBe(false);
    expect(r.changedNodeIds).not.toContain('Route:POST /api/auth/login');
    expect(r.changedNodeIds).not.toContain('Route:GET /api/health');
    // authenticate is no longer in any chain → its Middleware node is gone, its Function remains
    expect(await store.node('Middleware:server/middleware/auth.js#authenticate')).toBeNull();
    expect(await store.node('Function:server/middleware/auth.js#authenticate')).not.toBeNull();
    await assertNoDangling();
  });

  it('a deleted file removes its nodes and edges cleanly', async () => {
    await fs.rm(p('server/middleware/audit.js'));
    const r = await rebuild();
    expect(r.removed.nodes).toBeGreaterThan(0);
    expect(await store.node('File:server/middleware/audit.js')).toBeNull();
    expect(await store.node('Function:server/middleware/audit.js#auditLog')).toBeNull();
    await assertNoDangling();
  });

  it('unknown project fails clearly', async () => {
    await expect(buildGraph('does-not-exist')).rejects.toThrow(/Unknown project/);
  });
});
