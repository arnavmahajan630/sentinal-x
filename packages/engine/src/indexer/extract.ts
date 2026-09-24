import type { Project } from 'ts-morph';
import { Ctx } from './context';
import { extractAuthz } from './extractors/authz';
import { extractEnvFile, extractPackageJson, extractTsconfig } from './extractors/config';
import type { PackageExtras } from './extractors/config';
import { extractFunctions } from './extractors/functions';
import { extractExports, extractImports, extractRouterDecls } from './extractors/imports';
import { extractInputs } from './extractors/inputs';
import { extractJwt } from './extractors/jwt';
import { extractModels, extractMongoOps } from './extractors/mongoose';
import { extractResponses } from './extractors/responses';
import { extractRoutes } from './extractors/routes';
import { extractEnvAndSecrets } from './extractors/secrets';
import { parseSource } from './parse';
import { emptyFileIR } from './types';
import type { FileIR, FileKind } from './types';

export type ExtractResult = { ir: FileIR } | { error: string; line?: number; col?: number };

export function langOf(path: string): FileIR['lang'] {
  if (/\.(tsx?|mts|cts)$/.test(path)) return 'ts';
  if (/\.(jsx?|mjs|cjs)$/.test(path)) return 'js';
  if (/\.json$/.test(path)) return 'json';
  if (/(^|\/)\.env/.test(path)) return 'env';
  return 'other';
}

/** Raw, per-file IR. Pure function of `(path, kind, text)` (+ sibling lock for package.json). */
export function extractCode(
  project: Project,
  path: string,
  kind: FileKind,
  text: string,
): ExtractResult {
  const parsed = parseSource(project, path, text);
  if ('error' in parsed) return parsed;
  const { sf } = parsed;
  try {
    const ctx = new Ctx(path, sf);
    const ir = emptyFileIR(path, kind, langOf(path));
    extractImports(ctx, ir);
    extractExports(ctx, ir);
    extractRouterDecls(ctx, ir);
    extractFunctions(ctx, ir);
    extractRoutes(ctx, ir);
    extractInputs(ctx, ir);
    extractMongoOps(ctx, ir);
    extractModels(ctx, ir);
    extractJwt(ctx, ir);
    extractEnvAndSecrets(ctx, ir);
    extractAuthz(ctx, ir);
    extractResponses(ctx, ir);
    return { ir };
  } catch (e) {
    return { error: `extractor failed: ${(e as Error).message}` };
  } finally {
    project.removeSourceFile(sf);
  }
}

export function extractConfigFile(
  path: string,
  text: string,
  extras?: PackageExtras,
): ExtractResult {
  const ir = emptyFileIR(path, 'config', langOf(path));
  try {
    const base = path.split('/').pop()!;
    if (base === 'package.json') extractPackageJson(ir, text, extras);
    else if (/^(ts|js)config(\..+)?\.json$/.test(base)) extractTsconfig(ir, text);
    else if (base.startsWith('.env')) extractEnvFile(ir, text);
    return { ir };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
