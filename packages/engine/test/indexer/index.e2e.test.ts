import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bus, connectDb, disconnectDb, initCollections, models } from '../../src';
import { indexProject, loadProjectIR, refreshProject } from '../../src/indexer';
import type { IndexResult } from '../../src/indexer';

// Needs MongoDB (`docker compose up -d mongo`). Uses the isolated `sentinelx_test` database.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const FIXTURE = path.resolve(__dirname, '../fixtures/vuln-mern');

let tmp: string;
let projectId: string;
const events: any[] = [];

const p = (rel: string) => path.join(tmp, rel);
const read = (rel: string) => fs.readFile(p(rel), 'utf8');

beforeAll(async () => {
  await connectDb(url);
  await initCollections();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-idx-'));
  await fs.cp(FIXTURE, tmp, { recursive: true });
  // the fixture's own .gitignore hides this dir from Sentinel-X's git; recreate it here
  await fs.mkdir(p('server/ignored'), { recursive: true });
  await fs.writeFile(p('server/ignored/leak.js'), "app.get('/leak', h);");
  bus.subscribe('events', (m) => events.push(m));
});
afterAll(async () => {
  if (projectId) {
    await models.files.deleteMany({ projectId });
    await models.projects.deleteMany({ projectId });
    await models.security_events.deleteMany({ projectId });
  }
  await fs.rm(tmp, { recursive: true, force: true });
  await disconnectDb();
});

describe('indexProject (persisted)', () => {
  let first: IndexResult;

  it('indexes the fixture, persists rows, and reports honestly', async () => {
    first = await indexProject(tmp);
    projectId = first.projectId;
    expect(first.stats).toMatchObject({
      files: 20,
      indexed: 17,
      recorded: 2,
      unparsed: 1,
      skipped: 0,
      routes: 16,
    });
    expect(first.unparsed).toEqual([
      { path: 'server/broken.js', error: expect.stringMatching(/expression expected/i), line: 1 },
    ]);
    expect(await models.files.countDocuments({ projectId })).toBe(20);
    const proj = await models.projects.findOne({ projectId }).lean<any>();
    expect(proj).toMatchObject({ status: 'indexed', name: path.basename(tmp), gitHead: null });
    expect(proj.stats.routes).toBe(16);
    expect(
      await models.security_events.countDocuments({ projectId, type: 'project.indexed' }),
    ).toBe(1);
    expect(
      events.some((e) => e.data.kind === 'project.indexed' && e.data.projectId === projectId),
    ).toBe(true);
  });

  it('skips gitignored directories', async () => {
    const paths = (await models.files.find({ projectId }).lean<any[]>()).map((d) => d.path);
    expect(paths.some((x) => x.includes('ignored/'))).toBe(false);
  });

  it('never persists raw secrets', async () => {
    const dump = JSON.stringify(await models.files.find({ projectId }).lean());
    for (const raw of ['secret123', 'hunter2pass', 'supersecretvalue123', 'fallback-secret'])
      expect(dump).not.toContain(raw);
  });

  it('loadProjectIR (C1→C2 contract) returns rows + linked routes', async () => {
    const pir = await loadProjectIR(projectId);
    expect(pir.routes).toHaveLength(16);
    expect(pir.files.find((f) => f.path === 'server/broken.js')).toMatchObject({
      status: 'unparsed',
      ir: null,
    });
    expect(pir.files.find((f) => f.path === 'server/app.js')!.linked!.routes.length).toBe(4);
    await expect(loadProjectIR('nope')).rejects.toThrow(/Unknown project/);
  });

  it('is idempotent: re-running changes nothing and creates no duplicates', async () => {
    const again = await indexProject(tmp);
    expect(again.projectId).toBe(projectId);
    expect(again.changed).toEqual([]);
    expect(again.changedLinked).toEqual([]);
    expect(again.removed).toEqual([]);
    expect(await models.files.countDocuments({ projectId })).toBe(20);
    expect(await models.projects.countDocuments({ path: first.root })).toBe(1);
  });

  it('re-index after an edit: only that file is re-extracted; linked view changes stay targeted', async () => {
    const src = await read('server/controllers/order.controller.js');
    await fs.writeFile(
      p('server/controllers/order.controller.js'),
      src.replace(
        'const order = await Order.findById(req.params.id);\n  res.json(order);',
        'const order = await Order.findById(req.params.id);\n  if (order.user.toString() !== req.user.id) return res.sendStatus(403);\n  res.json(order);',
      ),
    );
    const r = await refreshProject(projectId);
    expect(r.changed).toEqual(['server/controllers/order.controller.js']);
    const doc = await models.files
      .findOne({ projectId, path: 'server/controllers/order.controller.js' })
      .lean<any>();
    const owner = doc.ir.authz.filter(
      (a: any) => a.kind === 'ownership-compare' && a.fnId.endsWith('#getOrder'),
    );
    expect(owner).toHaveLength(1); // the fix is now visible in IR
  });

  it('a global middleware change re-links only the routes it affects', async () => {
    const app = await read('server/app.js');
    await fs.writeFile(p('server/app.js'), app.replace('app.use(authenticate);\n', ''));
    const r = await refreshProject(projectId);
    expect(r.changed).toEqual(['server/app.js']);
    expect(r.changedLinked.sort()).toEqual([
      'server/app.js',
      'server/routes/admin.routes.mjs',
      'server/routes/orders.routes.js',
    ]);
    // routes that never had it are untouched
    expect(r.changedLinked).not.toContain('server/routes/auth.routes.js');
    expect(r.changedLinked).not.toContain('server/src/users.routes.ts');
    const orders = (await loadProjectIR(projectId)).routes.find(
      (x) => x.id === 'GET /api/orders/:id',
    )!;
    expect(orders.chain.map((c) => c.ref.factory ?? c.ref.text)).toEqual(['cors', 'express.json']);
  });

  it('removes rows for deleted files and marks parse recovery', async () => {
    await fs.rm(p('server/middleware/audit.js'));
    await fs.writeFile(p('server/broken.js'), 'module.exports = {};\n');
    const r = await refreshProject(projectId);
    expect(r.removed).toEqual(['server/middleware/audit.js']);
    expect(r.stats.unparsed).toBe(0);
    expect(await models.files.countDocuments({ projectId })).toBe(19);
    expect(
      await models.files.countDocuments({ projectId, path: 'server/middleware/audit.js' }),
    ).toBe(0);
  });

  it('refreshProject rejects unknown projects', async () => {
    await expect(refreshProject('does-not-exist')).rejects.toThrow(/Unknown project/);
  });

  it('a missing directory fails the run and marks the project failed only if it was known', async () => {
    await expect(indexProject(path.join(tmp, 'nope'))).rejects.toThrow();
  });
});
