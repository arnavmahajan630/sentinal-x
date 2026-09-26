import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { KnowledgeError } from './errors';
import { FrontMatter } from './schema';
import { REFERENCE_SECTIONS, VULN_SECTIONS } from './types';
import type { Playbook, SectionName } from './types';

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

/** explicit → `PLAYBOOKS_DIR` → `<cwd>/playbooks` → walk up from this module (tsx dev + bundled server) */
export function resolvePlaybooksDir(explicit?: string): string {
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  if (process.env.PLAYBOOKS_DIR) candidates.push(process.env.PLAYBOOKS_DIR);
  candidates.push(path.join(process.cwd(), 'playbooks'));
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    candidates.push(path.join(dir, 'playbooks'));
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const hit = candidates.find(isDir);
  if (!hit)
    throw new KnowledgeError(
      'not_found',
      `Playbooks directory not found (tried: ${candidates.slice(0, 4).join(', ')} …). Set PLAYBOOKS_DIR.`,
    );
  return hit;
}

/** split a markdown body into `## Heading` sections, ignoring headings inside code fences */
export function splitSections(body: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  let cur: { name: string; lines: string[] } | null = null;
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^```/.test(line.trim())) fence = !fence;
    const m = !fence ? /^## (.+?)\s*$/.exec(line) : null;
    if (m) {
      if (cur) out.push({ name: cur.name, text: cur.lines.join('\n').trim() });
      cur = { name: m[1]!, lines: [] };
    } else cur?.lines.push(line);
  }
  if (cur) out.push({ name: cur.name, text: cur.lines.join('\n').trim() });
  return out;
}

export function parsePlaybook(raw: string, file: string): Playbook {
  const fail = (msg: string) => new KnowledgeError('invalid_playbook', `${file}: ${msg}`);
  const fm = matter(raw);
  const parsed = FrontMatter.safeParse(fm.data);
  if (!parsed.success)
    throw fail(
      `front-matter: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ')}`,
    );
  const meta = parsed.data;
  if (meta.type !== path.basename(file, '.md'))
    throw fail(`type "${meta.type}" must equal the file name`);

  const body = fm.content.trim();
  const secs = splitSections(body);
  const want: readonly string[] =
    meta.kind === 'vulnerability' ? VULN_SECTIONS : REFERENCE_SECTIONS;
  const got = secs.map((s) => s.name);
  if (JSON.stringify(got) !== JSON.stringify(want))
    throw fail(
      `sections must be, in order: ${want.join(' | ')} (got: ${got.join(' | ') || 'none'})`,
    );
  const empty = secs.find((s) => s.text.length < 40);
  if (empty) throw fail(`section "${empty.name}" is empty/too short`);

  const hash = createHash('sha1').update(raw).digest('hex');
  return {
    ...meta,
    sections: Object.fromEntries(secs.map((s) => [s.name as SectionName, s.text])),
    body,
    hash,
    version: hash.slice(0, 8),
    file,
  };
}

export function loadPlaybooksFromDir(dir: string): Playbook[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const out = files.map((f) => parsePlaybook(readFileSync(path.join(dir, f), 'utf8'), f));
  const seen = new Set<string>();
  for (const p of out) {
    if (seen.has(p.type))
      throw new KnowledgeError('invalid_playbook', `duplicate playbook type "${p.type}"`);
    seen.add(p.type);
  }
  return out.sort((a, b) => (a.type < b.type ? -1 : 1));
}
