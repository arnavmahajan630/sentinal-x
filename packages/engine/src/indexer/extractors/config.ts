import { ts } from 'ts-morph';
import { entropy, maskPreview } from '../context';
import type { DepIR, FileIR, Loc } from '../types';
import { SECRET_NAME_RE, classifySecret, toSecret } from './secrets';

export interface PackageExtras {
  /** contents of the sibling package-lock.json, when present */
  lockText?: string | null;
  /** installed version lookup from node_modules (fallback when no lockfile) */
  readInstalled?: (name: string) => string | undefined;
}

/** Throws on invalid JSON (caller marks the file unparsed). */
export function extractPackageJson(ir: FileIR, text: string, extras: PackageExtras = {}): void {
  const pkg = JSON.parse(text) as Record<string, any>;
  let lock: any;
  if (extras.lockText) {
    try {
      lock = JSON.parse(extras.lockText);
    } catch {
      lock = undefined;
    }
  }
  const dir = ir.path.includes('/') ? ir.path.slice(0, ir.path.lastIndexOf('/')) : '';
  const installed = (name: string): string | undefined => {
    const v =
      lock?.packages?.[`node_modules/${name}`]?.version ?? lock?.dependencies?.[name]?.version;
    return v ?? extras.readInstalled?.(name);
  };
  const sections: [string, boolean][] = [
    ['dependencies', false],
    ['optionalDependencies', false],
    ['peerDependencies', false],
    ['devDependencies', true],
  ];
  const seen = new Set<string>();
  for (const [key, dev] of sections) {
    for (const [name, range] of Object.entries<string>(pkg[key] ?? {})) {
      if (seen.has(name)) continue;
      seen.add(name);
      const d: DepIR = { name, range: String(range), dev, pkgPath: ir.path };
      const inst = installed(name);
      if (inst) d.installed = inst;
      ir.deps.push(d);
    }
  }
  void dir;
}

export function extractTsconfig(ir: FileIR, text: string): void {
  const parsed = ts.parseConfigFileTextToJson(ir.path, text);
  if (parsed.error)
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  const co = (parsed.config?.compilerOptions ?? {}) as {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
  if (co.baseUrl || co.paths) ir.tsconfig = { baseUrl: co.baseUrl, paths: co.paths ?? {} };
}

/** `.env*` files: keep key names + masked values only. Example/sample files don't raise secrets. */
export function extractEnvFile(ir: FileIR, text: string): void {
  const isExample = /(example|sample|template|dist)/i.test(ir.path);
  const keys: NonNullable<FileIR['envFile']>['keys'] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    const name = m[1]!;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    const kind = classifySecret(name, v);
    const secretLike = !!v && (!!kind || (SECRET_NAME_RE.test(name) && v.length >= 6));
    keys.push({ name, preview: v ? maskPreview(v) : '', len: v.length, secretLike });
    if (secretLike && !isExample) {
      const loc: Loc = { file: ir.path, line: i + 1, col: 1 };
      ir.secrets.push({ ...toSecret('env-file-secret', name, v, loc), entropy: entropy(v) });
    }
  });
  ir.envFile = { keys };
}
