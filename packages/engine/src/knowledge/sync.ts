import { models } from '../db/collections';
import type { KnowledgeRegistry } from './registry';

export interface SyncResult {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
}

/** Files stay the source of truth; this mirrors metadata + content hash/version into `security_knowledge`. Idempotent. */
export async function syncKnowledge(reg: KnowledgeRegistry): Promise<SyncResult> {
  const existing = new Map(
    (
      await models.security_knowledge
        .find({}, { type: 1, hash: 1, _id: 0 })
        .lean<{ type: string; hash?: string }[]>()
    ).map((d) => [d.type, d.hash]),
  );
  const res: SyncResult = { added: [], updated: [], removed: [], unchanged: [] };
  const ops: any[] = [];
  for (const p of reg.listPlaybooks()) {
    const prev = existing.get(p.type);
    if (prev === p.hash) {
      res.unchanged.push(p.type);
      continue;
    }
    (prev === undefined ? res.added : res.updated).push(p.type);
    ops.push({
      updateOne: {
        filter: { type: p.type },
        update: {
          $set: {
            type: p.type,
            title: p.title,
            kind: p.kind,
            agent: p.agent,
            owasp: p.owasp,
            apiTop10: p.apiTop10 ?? null,
            cwe: p.cwe,
            severityBase: p.severityBase,
            verifierTemplate: p.verifierTemplate,
            verification: p.verification,
            factQueries: p.factQueries,
            signals: p.signals,
            requires: p.requires,
            appliesTo: p.appliesTo,
            summary: p.summary,
            body: p.body,
            hash: p.hash,
            version: p.version,
            file: p.file,
            syncedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }
  const keep = new Set(reg.listPlaybooks().map((p) => p.type));
  res.removed = [...existing.keys()].filter((t) => !keep.has(t));
  if (ops.length) await models.security_knowledge.bulkWrite(ops, { ordered: false });
  if (res.removed.length)
    await models.security_knowledge.deleteMany({ type: { $in: res.removed } });
  return res;
}
