import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { FactEngine, createFactEngine, runFactTool } from '../../src/facts';
import { buildGraph } from '../../src/graph';
import { indexProject } from '../../src/indexer';
import { FIXTURE } from '../graph/helpers';
import { fixtureEngine } from './helpers';

// Needs MongoDB. Proves the Mongo-backed engine answers exactly like the in-memory one, and reacts to code changes.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
let tmp: string;
let pid: string;

beforeAll(async () => {
  await connectDb(url);
  await initCollections();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-facts-'));
  await fs.cp(FIXTURE, tmp, { recursive: true });
  pid = (await indexProject(tmp)).projectId;
  await buildGraph(pid);
});
afterAll(async () => {
  for (const c of ['files', 'graph_nodes', 'graph_edges', 'security_events'] as const)
    await models[c].deleteMany({ projectId: pid });
  await models.projects.deleteMany({ projectId: pid });
  await fs.rm(tmp, { recursive: true, force: true });
  await disconnectDb();
});

describe('FactEngine over MongoGraphStore', () => {
  it('answers the same as the in-memory engine (project id/paths aside)', async () => {
    const mongo = createFactEngine(pid);
    const { engine: mem } = await fixtureEngine();
    for (const [tool, args] of [
      ['getRoute', { route: 'PUT /api/orders/:id' }],
      ['getRoute', { route: 'DELETE /api/orders/:id' }],
      ['getAuthorizationGaps', {}],
      ['getUnprotectedRoutes', {}],
      ['getMiddlewareChain', { route: 'GET /api/admin/stats' }],
      ['getDataflow', { route: 'POST /api/auth/login' }],
      ['getModelAccess', { model: 'Order' }],
      ['getSensitiveAssets', {}],
      ['getJwtUsage', {}],
      ['getExposure', { asset: 'User.password' }],
    ] as const) {
      const a = await runFactTool(mongo, tool, args);
      const b = await runFactTool(mem, tool, args);
      expect(a.ok, tool).toBe(true);
      expect(a, tool).toEqual(b);
    }
    expect(mongo).toBeInstanceOf(FactEngine);
  });

  it('after a code fix + rebuild, a NEW engine sees GET /api/orders/:id as authorized (IDOR closed)', async () => {
    const before = await createFactEngine(pid).getRoute('GET /api/orders/:id');
    expect(before.authorization).toBe('unknown');
    const f = path.join(tmp, 'server/controllers/order.controller.js');
    const src = await fs.readFile(f, 'utf8');
    await fs.writeFile(
      f,
      src.replace(
        'const order = await Order.findById(req.params.id);\n  res.json(order);',
        "const order = await Order.findById(req.params.id);\n  if (order.user.toString() !== req.user.id) return res.status(403).json({ error: 'forbidden' });\n  res.json(order);",
      ),
    );
    await indexProject(tmp);
    await buildGraph(pid);
    const after = createFactEngine(pid);
    const r = await after.getRoute('GET /api/orders/:id');
    expect(r.authorization).toBe('present');
    expect(r.authzEvidence).toMatchObject([
      { kind: 'ownership-compare', blocking: true, guards: { status: 403 } },
    ]);
    expect((await after.getAuthorizationGaps()).items.map((g) => g.route.id)).toEqual([
      'POST /api/orders',
      'PUT /api/orders/:id',
    ]);
  });
});
