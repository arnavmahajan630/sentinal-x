import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { bus, EVENTS_CHANNEL } from '../bus';
import { models } from '../db/collections';
import { analyzeProject } from './analyze';
import { langOf } from './extract';
import { sha1 } from './walk';
import { IR_VERSION } from './types';
import type { FileIR, FileStatus, IndexStats, LinkedFile } from './types';

export * from './types';
export { loadProjectIR } from './load';
export type { FileRow, ProjectIR } from './load';
export { link } from './link';
export { walkProject } from './walk';
export { analyzeProject } from './analyze';

export interface IndexOptions {
  /** re-extract every file even if its hash is unchanged */
  force?: boolean;
}
export interface UnparsedFile {
  path: string;
  error: string;
  line?: number;
}
export interface IndexResult {
  projectId: string;
  root: string;
  stats: IndexStats;
  unparsed: UnparsedFile[];
  /** files whose raw IR was (re)extracted, added, or whose content changed */
  changed: string[];
  /** files whose LINKED view changed (includes changed files; also files affected by another file's change) */
  changedLinked: string[];
  removed: string[];
  durationMs: number;
}

/** JSON round-trip: drops `undefined` so stored IR never contains nulls that weren't there (Mongo turns undefined → null). */
const toJson = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const projectIdFor = (rootAbs: string): string => sha1(rootAbs).slice(0, 12);

async function gitInfo(root: string): Promise<{ head: string | null; branch: string | null }> {
  try {
    const git = simpleGit(root);
    if (!(await fs.stat(path.join(root, '.git')).catch(() => null)))
      return { head: null, branch: null };
    const head = (await git.revparse(['HEAD'])).trim();
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    return { head, branch };
  } catch {
    return { head: null, branch: null };
  }
}

function computeStats(
  rows: { path: string; status: FileStatus; ir: FileIR | null }[],
  linked: Record<string, LinkedFile>,
): IndexStats {
  const s: IndexStats = {
    files: rows.length,
    indexed: 0,
    recorded: 0,
    unparsed: 0,
    skipped: 0,
    routes: 0,
    functions: 0,
    mongoOps: 0,
    models: 0,
    inputs: 0,
    deps: 0,
  };
  for (const r of rows) {
    if (r.status === 'indexed') s.indexed++;
    else if (r.status === 'recorded') s.recorded++;
    else if (r.status === 'unparsed') s.unparsed++;
    else s.skipped++;
    if (r.ir) {
      s.routes += r.ir.routes.length;
      s.functions += r.ir.functions.length;
      // only ops whose receiver resolved to a model (`new Foo()` etc. are unverified until linked)
      s.mongoOps += (linked[r.path]?.opModels ?? []).filter(Boolean).length;
      s.models += r.ir.models.length;
      s.inputs += r.ir.inputs.length;
      s.deps += r.ir.deps.length;
    }
  }
  return s;
}

/**
 * Index (or incrementally re-index) a project. Idempotent: rows are keyed by (projectId, path);
 * files whose content hash is unchanged reuse their stored raw IR; the linker always re-runs over everything.
 */
export async function indexProject(
  rootPath: string,
  opts: IndexOptions = {},
): Promise<IndexResult> {
  const t0 = Date.now();
  const root = await fs.realpath(rootPath);
  if (!(await fs.stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const projectId = projectIdFor(root);

  await models.projects.updateOne(
    { projectId },
    { $set: { projectId, path: root, name: path.basename(root), status: 'indexing' } },
    { upsert: true },
  );

  try {
    const existingDocs = await models.files.find({ projectId }).lean();
    const existing = new Map<string, any>(existingDocs.map((d: any) => [d.path as string, d]));
    const { rows, linked: linkRes } = await analyzeProject(root, existing, { force: opts.force });

    const currentPaths = new Set(rows.map((r) => r.w.path));
    const removed = [...existing.keys()].filter((p) => !currentPaths.has(p));

    const changed: string[] = [];
    const changedLinked: string[] = [];
    const ops: any[] = [];
    for (const r of rows) {
      const prev = existing.get(r.w.path);
      const linked = linkRes.files[r.w.path] ?? null;
      const linkedHash = linked ? sha1(JSON.stringify(linked)) : '';
      const contentChanged = !r.reused || !prev;
      if (contentChanged) changed.push(r.w.path);
      const linkChanged = !prev || prev.linkedHash !== linkedHash;
      if (linkChanged || contentChanged) changedLinked.push(r.w.path);
      if (!contentChanged && !linkChanged && prev.status === r.status) continue;
      ops.push({
        updateOne: {
          filter: { projectId, path: r.w.path },
          update: {
            $set: {
              projectId,
              path: r.w.path,
              kind: r.w.kind,
              lang: r.ir?.lang ?? langOf(r.w.path),
              status: r.status,
              hash: r.w.hash,
              size: r.w.size,
              irVersion: IR_VERSION,
              ir: r.ir ? toJson(r.ir) : null,
              linked: linked ? toJson(linked) : null,
              linkedHash,
              parseError: r.parseError ?? null,
              parseLine: r.parseLine ?? null,
              skipReason: r.w.skipReason ?? null,
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length) await models.files.bulkWrite(ops, { ordered: false });
    if (removed.length) await models.files.deleteMany({ projectId, path: { $in: removed } });

    const stats = computeStats(
      rows.map((r) => ({ path: r.w.path, status: r.status, ir: r.ir })),
      linkRes.files,
    );
    const unparsed: UnparsedFile[] = rows
      .filter((r) => r.status === 'unparsed')
      .map((r) => ({ path: r.w.path, error: r.parseError ?? 'unparsed', line: r.parseLine }));
    const git = await gitInfo(root);
    await models.projects.updateOne(
      { projectId },
      {
        $set: {
          status: 'indexed',
          gitHead: git.head,
          gitBranch: git.branch,
          stats,
          indexedAt: new Date(),
        },
      },
    );

    const durationMs = Date.now() - t0;
    const summary = `project indexed: ${stats.files} files, ${stats.routes} routes, ${stats.mongoOps} mongo ops, ${stats.unparsed} unparsed`;
    await models.security_events.create({
      projectId,
      ts: new Date(),
      type: 'project.indexed',
      summary,
      stats,
      changed: changed.length,
      removed: removed.length,
    });
    bus.publish(EVENTS_CHANNEL, {
      kind: 'project.indexed',
      projectId,
      summary,
      stats: stats as unknown as Record<string, unknown>,
    });

    return { projectId, root, stats, unparsed, changed, changedLinked, removed, durationMs };
  } catch (e) {
    await models.projects.updateOne(
      { projectId },
      { $set: { status: 'failed', error: (e as Error).message } },
    );
    throw e;
  }
}

/** Incremental re-index of an already-known project (hash-based; used by C10 after a change). */
export async function refreshProject(
  projectId: string,
  opts: IndexOptions = {},
): Promise<IndexResult> {
  const p = await models.projects.findOne({ projectId }).lean<{ path?: string }>();
  if (!p?.path) throw new Error(`Unknown project ${projectId}`);
  return indexProject(p.path, opts);
}
