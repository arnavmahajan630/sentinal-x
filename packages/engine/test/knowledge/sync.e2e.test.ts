import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { KnowledgeRegistry, syncKnowledge } from '../../src/knowledge';
import { PLAYBOOKS_DIR } from './helpers';

// Needs MongoDB. Uses the isolated `sentinelx_test` database and a temp copy of the playbooks.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
let tmp: string;

beforeAll(async () => {
  await connectDb(url);
  await initCollections();
  await models.security_knowledge.deleteMany({});
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-kn-'));
  await fs.cp(PLAYBOOKS_DIR, tmp, { recursive: true });
});
afterAll(async () => {
  await models.security_knowledge.deleteMany({});
  await fs.rm(tmp, { recursive: true, force: true });
  await disconnectDb();
});

describe('syncKnowledge → security_knowledge', () => {
  it('first sync adds all 9 with hash/version; unique index on type', async () => {
    const r = await syncKnowledge(KnowledgeRegistry.fromDir(tmp));
    expect(r.added).toHaveLength(9);
    expect(r.updated.concat(r.removed, r.unchanged)).toEqual([]);
    const doc = await models.security_knowledge.findOne({ type: 'idor' }).lean<any>();
    expect(doc).toMatchObject({
      kind: 'vulnerability',
      agent: 'auth',
      verifierTemplate: 'idor',
      verification: 'dynamic',
      owasp: 'A01:2025',
      apiTop10: 'API1:2023',
      severityBase: 'high',
    });
    expect(doc.version).toBe(doc.hash.slice(0, 8));
    expect(doc.body).toContain('## Investigation strategy');
    expect(doc.factQueries).toContain('getAuthorizationGaps');
    const idx = await models.security_knowledge.collection.indexes();
    expect(idx.some((i) => i.unique && Object.keys(i.key).join(',') === 'type')).toBe(true);
  });

  it('is idempotent: second sync changes nothing', async () => {
    const r = await syncKnowledge(KnowledgeRegistry.fromDir(tmp));
    expect(r.unchanged).toHaveLength(9);
    expect(r.added.concat(r.updated, r.removed)).toEqual([]);
    expect(await models.security_knowledge.countDocuments({})).toBe(9);
  });

  it('an edited playbook updates (new version); a removed one is deleted', async () => {
    const before = await models.security_knowledge.findOne({ type: 'idor' }).lean<any>();
    const f = path.join(tmp, 'idor.md');
    await fs.writeFile(
      f,
      (await fs.readFile(f, 'utf8')).replace('Threat\nThe API', 'Threat\nThe application API'),
    );
    await fs.rm(path.join(tmp, 'jwt-security.md'));
    const r = await syncKnowledge(KnowledgeRegistry.fromDir(tmp));
    expect(r.updated).toEqual(['idor']);
    expect(r.removed).toEqual(['jwt-security']);
    const after = await models.security_knowledge.findOne({ type: 'idor' }).lean<any>();
    expect(after.version).not.toBe(before.version);
    expect(after.body).toContain('The application API');
    expect(await models.security_knowledge.countDocuments({})).toBe(8);
  });
});
