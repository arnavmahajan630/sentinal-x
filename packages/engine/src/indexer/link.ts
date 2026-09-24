import type {
  ChainEntry,
  ChainOrigin,
  FileIR,
  FnIR,
  LinkedCall,
  LinkedFile,
  LinkedRoute,
  LinkResult,
  MountIR,
  RefIR,
  ResolvedCall,
  RouteIR,
} from './types';

/**
 * Linker: a PURE function of all raw FileIR → resolved view (route full paths, ordered middleware chains,
 * handler/callee/model refs). Re-run over all stored IR whenever any file changes (cheap; C10 relies on this).
 */

type Target =
  | { kind: 'fn'; fnId: string }
  | { kind: 'router'; file: string; name: string }
  | { kind: 'model'; model: string }
  | { kind: 'ns'; file: string }
  | { kind: 'external'; module: string; name?: string };

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];
const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}
const joinPath = (...parts: (string | undefined)[]) => {
  const j = '/' + parts.filter(Boolean).join('/').split('/').filter(Boolean).join('/');
  return j;
};

function segMatch(path: string, prefix: string): boolean {
  const p = path.split('/').filter(Boolean);
  const q = prefix.split('/').filter(Boolean);
  if (q.length > p.length) return false;
  return q.every((seg, i) => seg === p[i] || seg.startsWith(':') || p[i]!.startsWith(':'));
}

interface UseEntry {
  ref: RefIR;
  fnId?: string;
  path?: string;
  dynamic?: boolean;
  order: number;
  origin: ChainOrigin;
}
interface Ancestor {
  absPrefix: string;
  usesBefore: UseEntry[];
  descend: ChainEntry[];
}
interface Inst {
  prefix: string;
  ancestors: Ancestor[];
  mounted: boolean;
}
interface RouterNode {
  key: string;
  file: string;
  name: string;
  kind: 'app' | 'router';
  implicit?: boolean;
  routes: RouteIR[];
  mounts: MountIR[];
}

export function link(files: FileIR[]): LinkResult {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const fileSet = new Set(byPath.keys());

  // tsconfig aliases by directory
  const tsconfigs = files
    .filter((f) => f.tsconfig)
    .map((f) => ({ dir: dirname(f.path), cfg: f.tsconfig! }));

  const tryFile = (cand: string): string | undefined => {
    const c = normalize(cand);
    if (fileSet.has(c)) return c;
    const noJs = c.replace(/\.(m|c)?jsx?$/, '');
    for (const base of noJs !== c ? [c, noJs] : [c]) {
      for (const e of EXTS) if (fileSet.has(base + e)) return base + e;
      for (const e of EXTS) if (fileSet.has(`${base}/index${e}`)) return `${base}/index${e}`;
    }
    return undefined;
  };

  const resolveModule = (from: string, spec: string): string | undefined => {
    if (spec.startsWith('.')) return tryFile(`${dirname(from)}/${spec}`);
    // tsconfig / jsconfig aliases (nearest config up the tree)
    const cfgs = tsconfigs
      .filter((t) => t.dir === '' || from.startsWith(t.dir + '/'))
      .sort((a, b) => b.dir.length - a.dir.length);
    for (const { dir, cfg } of cfgs) {
      const base = normalize(`${dir}/${cfg.baseUrl ?? '.'}`);
      for (const [pattern, targets] of Object.entries(cfg.paths)) {
        const star = pattern.indexOf('*');
        const rest =
          star === -1
            ? spec === pattern
              ? ''
              : null
            : spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1))
              ? spec.slice(star, spec.length - (pattern.length - star - 1))
              : null;
        if (rest === null) continue;
        for (const t of targets) {
          const r = tryFile(`${base}/${t.replace('*', rest)}`);
          if (r) return r;
        }
      }
      if (cfg.baseUrl !== undefined) {
        const r = tryFile(`${base}/${spec}`);
        if (r) return r;
      }
    }
    return undefined;
  };

  // symbol tables
  const fnByName = new Map<string, Map<string, FnIR>>();
  const fnById = new Map<string, FnIR>();
  for (const f of files) {
    const m = new Map<string, FnIR>();
    for (const fn of f.functions) {
      m.set(fn.name, fn);
      fnById.set(fn.id, fn);
    }
    fnByName.set(f.path, m);
  }
  const allModelNames = new Set(files.flatMap((f) => f.models.map((m) => m.name)));

  const exportTarget = (
    file: string,
    name: string,
    seen = new Set<string>(),
  ): Target | undefined => {
    const key = `${file}#${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const f = byPath.get(file);
    if (!f) return undefined;
    for (const e of f.exports.filter((x) => x.name === name)) {
      if (e.from) {
        const rf = resolveModule(file, e.from);
        if (rf) {
          const t = exportTarget(rf, e.local ?? e.name, seen);
          if (t) return t;
        } else return { kind: 'external', module: e.from, name: e.local ?? e.name };
        continue;
      }
      if (e.modelName) return { kind: 'model', model: e.modelName };
      if (e.fnId) return { kind: 'fn', fnId: e.fnId };
      if (e.local) {
        const t = localTarget(file, e.local, seen);
        if (t) return t;
      }
    }
    for (const e of f.exports.filter((x) => x.name === '*' && x.from)) {
      const rf = resolveModule(file, e.from!);
      const t = rf ? exportTarget(rf, name, seen) : undefined;
      if (t) return t;
    }
    return undefined;
  };

  const localTarget = (
    file: string,
    ident: string,
    seen = new Set<string>(),
  ): Target | undefined => {
    const f = byPath.get(file);
    if (!f) return undefined;
    const fn = fnByName.get(file)?.get(ident);
    if (fn) return { kind: 'fn', fnId: fn.id };
    if (f.routers.some((r) => r.name === ident)) return { kind: 'router', file, name: ident };
    const model = f.models.find((m) => m.varName === ident);
    if (model) return { kind: 'model', model: model.name };
    for (const imp of f.imports) {
      const resolved = resolveModule(file, imp.module);
      const ext = (name?: string): Target => ({ kind: 'external', module: imp.module, name });
      if (imp.default === ident) {
        if (!resolved) return ext();
        const t = exportTarget(resolved, 'default', new Set(seen));
        if (t) return t;
        return { kind: 'ns', file: resolved };
      }
      if (imp.namespace === ident) return resolved ? { kind: 'ns', file: resolved } : ext();
      const n = imp.names.find((x) => x.local === ident);
      if (n) {
        if (!resolved) return ext(n.imported);
        return exportTarget(resolved, n.imported, new Set(seen)) ?? { kind: 'ns', file: resolved };
      }
    }
    return undefined;
  };

  const memberTarget = (t: Target | undefined, segs: string[]): Target | undefined => {
    let cur = t;
    for (const s of segs) {
      if (!cur) return undefined;
      if (cur.kind === 'ns') cur = exportTarget(cur.file, s);
      else if (cur.kind === 'external')
        cur = { kind: 'external', module: cur.module, name: cur.name ? `${cur.name}.${s}` : s };
      else return cur.kind === 'model' ? cur : undefined;
    }
    return cur;
  };

  const resolveText = (file: string, text: string): Target | undefined => {
    const parts = text.split('.');
    return memberTarget(localTarget(file, parts[0]!), parts.slice(1));
  };

  const resolveRef = (file: string, ref: RefIR): Target | undefined => {
    if (ref.kind === 'inline') return ref.fnId ? { kind: 'fn', fnId: ref.fnId } : undefined;
    if (ref.kind === 'ident' || ref.kind === 'member') return resolveText(file, ref.text);
    if (ref.kind === 'call' && ref.factory) {
      if (ref.factory === 'require') {
        const arg = ref.args?.[0]?.replace(/^['"`]|['"`]$/g, '');
        const rf = arg ? resolveModule(file, arg) : undefined;
        return rf ? (exportTarget(rf, 'default') ?? { kind: 'ns', file: rf }) : undefined;
      }
      return resolveText(file, ref.factory);
    }
    return undefined;
  };

  // routers
  const routers = new Map<string, RouterNode>();
  for (const f of files) {
    for (const r of f.routers) {
      const key = `${f.path}::${r.name}`;
      routers.set(key, {
        key,
        file: f.path,
        name: r.name,
        kind: r.kind,
        implicit: r.implicit,
        routes: f.routes.filter((x) => x.router === r.name),
        mounts: f.mounts.filter((x) => x.router === r.name),
      });
    }
  }

  interface Mounting {
    parent: RouterNode;
    stmt: MountIR;
    argIdx: number;
  }
  const mountings = new Map<string, Mounting[]>();
  const usesOf = new Map<string, UseEntry[]>();
  for (const r of routers.values()) {
    const uses: UseEntry[] = [];
    for (const m of r.mounts) {
      m.args.forEach((arg, i) => {
        const t = resolveRef(r.file, arg);
        if (t?.kind === 'router') {
          const key = `${t.file}::${t.name}`;
          if (!mountings.has(key)) mountings.set(key, []);
          mountings.get(key)!.push({ parent: r, stmt: m, argIdx: i });
        } else {
          uses.push({
            ref: arg,
            fnId: t?.kind === 'fn' ? t.fnId : undefined,
            path: m.path,
            dynamic: m.dynamic,
            order: m.order,
            origin: r.kind === 'app' ? 'app' : 'router',
          });
        }
      });
    }
    usesOf.set(r.key, uses);
  }

  const instCache = new Map<string, Inst[]>();
  const instances = (r: RouterNode, stack: string[] = []): Inst[] => {
    const cached = instCache.get(r.key);
    if (cached) return cached;
    if (stack.includes(r.key) || stack.length > 10) return [];
    const ms = mountings.get(r.key) ?? [];
    let out: Inst[];
    if (!ms.length) out = [{ prefix: '', ancestors: [], mounted: r.kind === 'app' && !r.implicit }];
    else {
      out = [];
      for (const m of ms) {
        for (const pi of instances(m.parent, [...stack, r.key])) {
          const descend: ChainEntry[] = [];
          m.stmt.args.slice(0, m.argIdx).forEach((arg) => {
            const t = resolveRef(m.parent.file, arg);
            if (t?.kind === 'router') return;
            descend.push({
              ref: arg,
              fnId: t?.kind === 'fn' ? t.fnId : undefined,
              origin: 'mount',
              mountPath: m.stmt.path,
              ...(m.stmt.dynamic ? { conditional: true } : {}),
            });
          });
          out.push({
            prefix: joinPath(pi.prefix, m.stmt.path),
            mounted: pi.mounted,
            ancestors: [
              ...pi.ancestors,
              {
                absPrefix: pi.prefix,
                usesBefore: (usesOf.get(m.parent.key) ?? []).filter((u) => u.order < m.stmt.order),
                descend,
              },
            ],
          });
        }
      }
    }
    instCache.set(r.key, out);
    return out;
  };

  const chainEntry = (u: UseEntry, conditional?: boolean): ChainEntry => ({
    ref: u.ref,
    fnId: u.fnId,
    origin: u.origin,
    ...(u.path !== undefined ? { mountPath: u.path } : {}),
    ...(conditional ? { conditional: true } : {}),
  });
  const applies = (
    u: UseEntry,
    absPath: string,
    base: string,
    routeDynamic?: boolean,
  ): false | 'yes' | 'cond' => {
    if (u.path === undefined) return 'yes';
    if (u.dynamic || routeDynamic) return 'cond';
    return segMatch(absPath, joinPath(base, u.path)) ? 'yes' : false;
  };

  // ─── link routes ───────────────────────────────────────────────────────────
  const linkedFiles: Record<string, LinkedFile> = {};
  const allRoutes: LinkedRoute[] = [];
  const usedIds = new Map<string, number>();
  for (const f of files) linkedFiles[f.path] = { imports: [], routes: [], calls: [], opModels: [] };

  for (const r of routers.values()) {
    for (const inst of instances(r)) {
      for (const rt of r.routes) {
        const fullPath = joinPath(inst.prefix, rt.path);
        const chain: ChainEntry[] = [];
        for (const anc of inst.ancestors) {
          for (const u of anc.usesBefore) {
            const a = applies(u, fullPath, anc.absPrefix, rt.dynamic);
            if (a) chain.push(chainEntry(u, a === 'cond'));
          }
          chain.push(...anc.descend);
        }
        for (const u of usesOf.get(r.key) ?? []) {
          if (u.order >= rt.order) continue;
          const a = applies(u, fullPath, inst.prefix, rt.dynamic);
          if (a) chain.push(chainEntry(u, a === 'cond'));
        }
        for (const mw of rt.middleware) {
          const t = resolveRef(r.file, mw);
          chain.push({ ref: mw, fnId: t?.kind === 'fn' ? t.fnId : undefined, origin: 'route' });
        }
        const ht = resolveRef(r.file, rt.handler);
        let id = `${rt.method} ${fullPath}`;
        const n = (usedIds.get(id) ?? 0) + 1;
        usedIds.set(id, n);
        if (n > 1) id = `${id}#${n}`;
        const lr: LinkedRoute = {
          id,
          method: rt.method,
          path: rt.path,
          fullPath,
          file: r.file,
          router: r.name,
          handlerFnId: ht?.kind === 'fn' ? ht.fnId : undefined,
          handler: rt.handler,
          chain,
          mounted: inst.mounted,
          ...(rt.dynamic ? { dynamic: true } : {}),
          loc: rt.loc,
        };
        linkedFiles[r.file]!.routes.push(lr);
        allRoutes.push(lr);
      }
    }
  }

  // ─── imports, calls, op models ─────────────────────────────────────────────
  for (const f of files) {
    const lf = linkedFiles[f.path]!;
    for (const imp of f.imports) {
      const rp = resolveModule(f.path, imp.module);
      lf.imports.push({
        module: imp.module,
        ...(rp ? { resolvedPath: rp } : {}),
        external: !rp && !imp.module.startsWith('.'),
      });
    }
    for (const fn of f.functions) {
      for (const c of fn.calls) {
        const resolved = resolveCall(f.path, c.object, c.name, c.callee.startsWith('new '));
        if (resolved.kind === 'unresolved') continue;
        const lc: LinkedCall = { ...c, fnId: fn.id, resolved };
        lf.calls.push(lc);
      }
    }
    const opModels: (string | null)[] = [];
    f.mongoOps.forEach((op) => {
      opModels.push(modelOfOp(f, op, opModels));
    });
    lf.opModels = opModels;
  }

  function resolveCall(
    file: string,
    object: string | undefined,
    name: string,
    isNew: boolean,
  ): ResolvedCall {
    let t: Target | undefined;
    if (!object) t = localTarget(file, name);
    else {
      const segs = object.split('.');
      if (segs[0] === 'this' || !/^[A-Za-z_$][\w$]*$/.test(segs[0]!)) return { kind: 'unresolved' };
      t = memberTarget(localTarget(file, segs[0]!), [...segs.slice(1), name]);
      if (t?.kind === 'model') return { kind: 'model', model: t.model };
    }
    void isNew;
    if (!t) return { kind: 'unresolved' };
    if (t.kind === 'fn') return { kind: 'fn', fnId: t.fnId };
    if (t.kind === 'model') return { kind: 'model', model: t.model };
    if (t.kind === 'external') return { kind: 'external', module: t.module, name: t.name ?? name };
    return { kind: 'unresolved' };
  }

  function modelOfOp(
    f: FileIR,
    op: FileIR['mongoOps'][number],
    done: (string | null)[],
  ): string | null {
    const r = op.receiver;
    if (r.startsWith('collection:')) return r;
    const m = /^mongoose\.model\((.+)\)$/.exec(r);
    if (m) return m[1]!;
    if (op.instance) {
      const idx = f.mongoOps.findIndex(
        (o, i) => i < done.length && o.fnId === op.fnId && o.resultVar === r,
      );
      return idx >= 0 ? (done[idx] ?? null) : null;
    }
    const base = r.split('.');
    const t = localTarget(f.path, base[0]!);
    const mt = memberTarget(t, base.slice(1));
    if (mt?.kind === 'model') return mt.model;
    const last = base[base.length - 1]!;
    const cap = last.replace(/[mM]odel$/, '');
    const guess = allModelNames.has(last)
      ? last
      : allModelNames.has(cap)
        ? cap
        : allModelNames.has(cap.charAt(0).toUpperCase() + cap.slice(1))
          ? cap.charAt(0).toUpperCase() + cap.slice(1)
          : null;
    return guess;
  }

  return { files: linkedFiles, routes: allRoutes };
}
