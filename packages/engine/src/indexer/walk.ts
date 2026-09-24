import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import type { Ignore } from 'ignore';
import type { FileKind } from './types';

export interface WalkedFile {
  path: string; // project-relative, posix
  kind: FileKind;
  size: number;
  hash: string;
  /** extract = run extractors; record = store row only; skip = listed with reason */
  action: 'extract' | 'record' | 'skip';
  skipReason?: string;
  text?: string; // present for extract + client-record files
  /** sibling lockfile text for package.json */
  lockText?: string | null;
}

export const MAX_FILE_BYTES = 1_000_000;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const ALWAYS_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '.turbo',
  '.cache',
  '.nuxt',
  '.svelte-kit',
  '.vercel',
]);
const TEST_RE =
  /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|cypress)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/;
const SERVER_IMPORT_RE =
  /(?:from\s+|require\(\s*|import\(\s*)['"](?:express|mongoose|mongodb|jsonwebtoken|bcrypt(?:js)?|cors|helmet|passport(?:-[\w-]+)?|cookie-parser|body-parser|koa|fastify|@nestjs\/[\w-]+)['"]/;
const CLIENT_IMPORT_RE =
  /(?:from\s+|require\(\s*|import\(\s*)['"](?:react|react-dom(?:\/[\w-]+)?|react-router(?:-dom)?|next(?:\/[\w-]+)?|vue|svelte|@tanstack\/react-query|lucide-react)['"]/;
const SERVER_DEPS = [
  'express',
  'mongoose',
  'jsonwebtoken',
  'koa',
  'fastify',
  '@nestjs/core',
  'mongodb',
];
const CLIENT_DEPS = ['react', 'react-dom', 'vue', 'svelte', 'vite', 'next', '@angular/core'];

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

interface Layer {
  base: string; // rel dir posix ('' = root)
  ig: Ignore;
}

async function readIfExists(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf8');
  } catch {
    return null;
  }
}

function isIgnored(layers: Layer[], rel: string, isDir: boolean): boolean {
  for (const l of layers) {
    const sub = l.base ? (rel.startsWith(l.base + '/') ? rel.slice(l.base.length + 1) : null) : rel;
    if (sub === null) continue;
    if (l.ig.ignores(isDir ? sub + '/' : sub)) return true;
  }
  return false;
}

function parseDeps(text: string): Set<string> {
  try {
    const j = JSON.parse(text);
    return new Set([...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})]);
  } catch {
    return new Set();
  }
}

export function classifyPath(rel: string): 'test' | 'config' | 'client-path' | undefined {
  const base = rel.split('/').pop()!;
  if (TEST_RE.test(rel)) return 'test';
  if (
    base === 'package.json' ||
    /^(ts|js)config(\..+)?\.json$/.test(base) ||
    base.startsWith('.env')
  )
    return 'config';
  if (/(^|\/)(client|frontend|web|ui)(\/|$)/.test(rel) || /\.(jsx|tsx)$/.test(base))
    return 'client-path';
  return undefined;
}

/** Walk + classify every relevant file. Deterministic order (sorted by path). */
export async function walkProject(rootAbs: string): Promise<WalkedFile[]> {
  const files: { rel: string; abs: string; size: number }[] = [];

  async function visit(dirAbs: string, dirRel: string, parentLayers: Layer[]) {
    const layers = [...parentLayers];
    const gi = await readIfExists(path.join(dirAbs, '.gitignore'));
    if (gi !== null) layers.push({ base: dirRel, ig: ignore().add(gi) });
    const entries = await fs.readdir(dirAbs, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      const abs = path.join(dirAbs, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(e.name) || isIgnored(layers, rel, true)) continue;
        await visit(abs, rel, layers);
      } else if (e.isFile()) {
        if (isIgnored(layers, rel, false)) continue;
        const relevant =
          CODE_EXT.test(e.name) ||
          e.name === 'package.json' ||
          e.name.startsWith('.env') ||
          /^(ts|js)config(\..+)?\.json$/.test(e.name);
        if (!relevant) continue;
        const st = await fs.stat(abs);
        files.push({ rel, abs, size: st.size });
      }
    }
  }
  await visit(rootAbs, '', []);

  // package.json deps by directory (for classification)
  const pkgDeps = new Map<string, Set<string>>();
  for (const f of files) {
    if (f.rel.split('/').pop() === 'package.json') {
      const t = await readIfExists(f.abs);
      if (t)
        pkgDeps.set(
          f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '',
          parseDeps(t),
        );
    }
  }
  const nearestDeps = (rel: string): Set<string> | undefined => {
    let dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    for (;;) {
      const d = pkgDeps.get(dir);
      if (d) return d;
      if (!dir) return undefined;
      dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    }
  };

  const out: WalkedFile[] = [];
  for (const f of files) {
    const base = f.rel.split('/').pop()!;
    if (CODE_EXT.test(base) && (/\.min\.[cm]?js$/.test(base) || /\.d\.[cm]?ts$/.test(base))) {
      out.push({
        path: f.rel,
        kind: 'shared',
        size: f.size,
        hash: '',
        action: 'skip',
        skipReason: /\.d\./.test(base) ? 'declaration' : 'minified',
      });
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      out.push({
        path: f.rel,
        kind: 'shared',
        size: f.size,
        hash: '',
        action: 'skip',
        skipReason: 'too-large',
      });
      continue;
    }
    const text = await fs.readFile(f.abs, 'utf8');
    const cp = classifyPath(f.rel);

    if (cp === 'config') {
      let lockText: string | null | undefined;
      let hash = sha1(text);
      if (base === 'package.json') {
        lockText = await readIfExists(path.join(path.dirname(f.abs), 'package-lock.json'));
        hash = sha1(text + '\u0000' + (lockText ?? ''));
      }
      out.push({
        path: f.rel,
        kind: 'config',
        size: f.size,
        hash,
        action: 'extract',
        text,
        lockText,
      });
      continue;
    }
    if (cp === 'test') {
      out.push({ path: f.rel, kind: 'test', size: f.size, hash: sha1(text), action: 'record' });
      continue;
    }
    let kind: FileKind;
    if (cp === 'client-path') kind = 'client';
    else if (SERVER_IMPORT_RE.test(text)) kind = 'server';
    else if (CLIENT_IMPORT_RE.test(text)) kind = 'client';
    else {
      const deps = nearestDeps(f.rel);
      const isServer = deps && SERVER_DEPS.some((d) => deps.has(d));
      const isClient = deps && CLIENT_DEPS.some((d) => deps.has(d));
      kind = isServer ? 'server' : isClient ? 'client' : 'shared';
    }
    out.push({
      path: f.rel,
      kind,
      size: f.size,
      hash: sha1(text),
      action: kind === 'client' ? 'record' : 'extract',
      text,
    });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return out;
}

export async function readInstalledVersion(
  rootAbs: string,
  pkgDirRel: string,
  name: string,
): Promise<string | undefined> {
  const t = await readIfExists(path.join(rootAbs, pkgDirRel, 'node_modules', name, 'package.json'));
  if (!t) return undefined;
  try {
    return JSON.parse(t).version;
  } catch {
    return undefined;
  }
}
