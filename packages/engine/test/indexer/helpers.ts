import { extractCode, extractConfigFile } from '../../src/indexer/extract';
import { link } from '../../src/indexer/link';
import { createProject } from '../../src/indexer/parse';
import type { FileIR, FileKind } from '../../src/indexer/types';

const project = createProject();

/** extract raw IR for a code snippet (throws when it fails to parse) */
export function ex(code: string, path = 'server/x.js', kind: FileKind = 'server'): FileIR {
  const isConfig = path.endsWith('.json') || /(^|\/)\.env/.test(path);
  const r = isConfig ? extractConfigFile(path, code) : extractCode(project, path, kind, code);
  if ('error' in r) throw new Error(`extract failed: ${r.error}`);
  return r.ir;
}

/** extract + link a set of in-memory files */
export function linkFiles(files: Record<string, string>) {
  const irs = Object.entries(files).map(([p, c]) =>
    ex(c, p, p.endsWith('.json') || /(^|\/)\.env/.test(p) ? 'config' : 'server'),
  );
  return { irs, res: link(irs) };
}

export const route = (res: ReturnType<typeof link>, id: string) => {
  const r = res.routes.find((x) => x.id === id);
  if (!r) throw new Error(`no route ${id}; have: ${res.routes.map((x) => x.id).join(' | ')}`);
  return r;
};

export const chainNames = (r: {
  chain: { origin: string; ref: { factory?: string; text: string } }[];
}) => r.chain.map((c) => `${c.origin}:${c.ref.factory ?? c.ref.text}`);
