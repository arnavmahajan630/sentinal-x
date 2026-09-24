import { extractCode, extractConfigFile, langOf } from './extract';
import { link } from './link';
import { createProject } from './parse';
import { IR_VERSION, emptyFileIR } from './types';
import type { FileIR, FileKind, FileStatus, ImportIR, LinkResult } from './types';
import { readInstalledVersion, walkProject } from './walk';
import type { WalkedFile } from './walk';

export interface PrevRow {
  hash: string;
  irVersion: number;
  kind: FileKind;
  status: FileStatus;
  ir: FileIR | null;
  parseError?: string | null;
}
export interface AnalyzedRow {
  w: WalkedFile;
  status: FileStatus;
  ir: FileIR | null;
  parseError?: string;
  parseLine?: number;
  /** raw IR came from the previous index (content hash unchanged) */
  reused: boolean;
}
export interface Analysis {
  rows: AnalyzedRow[];
  linked: LinkResult;
}

export function scanImports(text: string, file: string): ImportIR[] {
  const out: ImportIR[] = [];
  const re =
    /(?:\bimport\s+(?:[^'"()]*?\s+from\s+)?|\brequire\(\s*|\bimport\(\s*)['"]([^'"]+)['"]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const line = text.slice(0, m.index).split('\n').length;
    out.push({
      module: m[1]!,
      style: m[0].includes('require') ? 'cjs' : 'esm',
      names: [],
      loc: { file, line, col: 1 },
    });
  }
  return out;
}

/**
 * Pure analysis (no database): walk → classify → extract (reusing `prev` rows whose hash is unchanged) → link.
 * `indexProject` wraps this with persistence; tests use it directly.
 */
export async function analyzeProject(
  root: string,
  prev: Map<string, PrevRow> = new Map(),
  opts: { force?: boolean } = {},
): Promise<Analysis> {
  const walked = await walkProject(root);
  const project = createProject();
  const rows: AnalyzedRow[] = [];

  for (const w of walked) {
    const p = prev.get(w.path);
    const fresh =
      !opts.force &&
      p &&
      p.hash === w.hash &&
      p.irVersion === IR_VERSION &&
      p.kind === w.kind &&
      w.action !== 'skip';
    if (fresh) {
      rows.push({
        w,
        status: p.status,
        ir: p.ir ?? null,
        parseError: p.parseError ?? undefined,
        reused: true,
      });
    } else if (w.action === 'skip') {
      rows.push({ w, status: 'skipped', ir: null, reused: false });
    } else if (w.action === 'record') {
      const ir = emptyFileIR(w.path, w.kind, langOf(w.path));
      if (w.kind === 'client' && w.text) ir.imports = scanImports(w.text, w.path);
      rows.push({ w, status: 'recorded', ir, reused: false });
    } else {
      const r =
        w.kind === 'config'
          ? extractConfigFile(w.path, w.text!, { lockText: w.lockText })
          : extractCode(project, w.path, w.kind, w.text!);
      if ('ir' in r) {
        // installed versions from node_modules when the lockfile has no entry
        if (w.kind === 'config' && w.path.endsWith('package.json')) {
          const dir = w.path.includes('/') ? w.path.slice(0, w.path.lastIndexOf('/')) : '';
          for (const d of r.ir.deps) {
            if (!d.installed) {
              const v = await readInstalledVersion(root, dir, d.name);
              if (v) d.installed = v;
            }
          }
        }
        rows.push({ w, status: 'indexed', ir: r.ir, reused: false });
      } else {
        rows.push({
          w,
          status: 'unparsed',
          ir: null,
          parseError: r.error,
          parseLine: r.line,
          reused: false,
        });
      }
    }
  }

  const linked = link(rows.filter((r) => r.ir).map((r) => r.ir!));
  return { rows, linked };
}
