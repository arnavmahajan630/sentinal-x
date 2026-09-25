import { builtinModules } from 'node:module';
import type { FileRow } from '../indexer/load';
import type {
  AuthzIR,
  FnIR,
  FnTraits,
  Loc,
  LinkedRoute,
  MongoOpIR,
  ValueSrc,
} from '../indexer/types';
import {
  dependencyNodeId,
  edgeId,
  fileNodeId,
  functionNodeId,
  middlewareNodeId,
  modelNodeId,
  nodeId,
  projectNodeId,
  routeNodeId,
} from './ids';
import { isFieldExposed, isIdLikePath, judgeMiddleware } from './policy';
import { SECRET_NAME_RE, classifyField } from './sensitivity';
import { serviceFor } from './services';
import type { EdgeDraft, EdgeType, GraphModel, NodeDraft, NodeId, NodeType } from './types';

export interface GraphBuildInput {
  projectId: string;
  project?: {
    name?: string;
    path?: string;
    gitHead?: string | null;
    gitBranch?: string | null;
    stats?: unknown;
  };
  files: FileRow[];
}

const BUILTINS = new Set(builtinModules.map((m) => m.split('/')[0]!));
const CAP = { ops: 60, calls: 20, responses: 10 };
/** ops whose result IS the document(s) (write-result / count / distinct / aggregate ops are not) */
const DOC_OPS =
  /^(find|findOne|findById|findByIdAnd\w+|findOneAnd\w+|findAndModify|create|insertOne|insertMany|new)$/;

const stripArgs = (s: string) => s.replace(/\(.*$/s, '');
const leafName = (fnId: string) =>
  (fnId.split('#')[1] ?? fnId)
    .split('.')
    .pop()!
    .replace(/@\d+:\d+$/, '');
const isModuleFn = (fnId: string) => fnId.endsWith('#<module>');
const loc = (l?: Loc) =>
  l
    ? { file: l.file, line: l.line, col: l.col, ...(l.endLine ? { endLine: l.endLine } : {}) }
    : undefined;

/** package name of an import specifier; builtins flagged */
export function packageOf(spec: string): { name: string; builtin: boolean } {
  if (spec.startsWith('node:')) return { name: spec.slice(5).split('/')[0]!, builtin: true };
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
  return { name, builtin: BUILTINS.has(name) };
}

class Builder {
  nodes = new Map<NodeId, NodeDraft>();
  edges = new Map<string, EdgeDraft>();

  node(
    type: NodeType,
    key: string,
    props: Record<string, any>,
    l?: Loc,
    merge?: (a: Record<string, any>, b: Record<string, any>) => Record<string, any>,
  ): NodeId {
    const id = nodeId(type, key);
    const ex = this.nodes.get(id);
    if (!ex) this.nodes.set(id, { id, type, key, props, ...(l ? { loc: loc(l) } : {}) });
    else if (merge) ex.props = merge(ex.props, props);
    return id;
  }

  has(id: NodeId) {
    return this.nodes.has(id);
  }

  edge(
    type: EdgeType,
    from: NodeId,
    to: NodeId,
    props?: Record<string, any>,
    merge?: (a: Record<string, any>, b: Record<string, any>) => Record<string, any>,
  ) {
    const id = edgeId(type, from, to);
    const ex = this.edges.get(id);
    if (!ex) this.edges.set(id, { id, type, from, to, ...(props ? { props } : {}) });
    else if (merge && props) ex.props = merge(ex.props ?? {}, props);
  }
}

const union = <T>(a: T[] = [], b: T[] = []) => [...new Set([...a, ...b])];
const pushCap = <T>(a: T[] = [], b: T[] = [], cap: number) => [...a, ...b].slice(0, cap);

function unionTraits(fns: FnIR[]): FnTraits {
  const t: FnTraits = {
    readsAuthHeader: false,
    callsJwtVerify: false,
    setsReqUser: false,
    sendsAuthError: false,
    callsNext: false,
    usesReqRes: false,
  };
  for (const f of fns) for (const k of Object.keys(t) as (keyof FnTraits)[]) t[k] ||= f.traits[k];
  return t;
}

function varsIn(v: ValueSrc | undefined, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (!v || depth > 2) return out;
  if (v.kind === 'var' && /^[A-Za-z_$][\w$]*$/.test(v.name)) out.add(v.name);
  else if (v.kind === 'spread') varsIn(v.of, out, depth + 1);
  else if (v.kind === 'object') for (const x of Object.values(v.keys)) varsIn(x, out, depth + 1);
  return out;
}

const compactAuthz = (a: AuthzIR) => ({
  kind: a.kind,
  expr: a.expr,
  ...(a.operands ? { operands: a.operands } : {}),
  ...(a.guards ? { guards: a.guards } : {}),
  line: a.loc.line,
});

/** Pure: project IR → complete desired graph (deterministic ids/order). */
export function buildGraphModel(input: GraphBuildInput): GraphModel {
  const b = new Builder();
  const rows = input.files.filter((r) => r.kind !== 'test' && r.status !== 'skipped');
  const indexed = rows.filter((r) => r.ir);
  const pid = projectNodeId(input.projectId);

  // ── P1 project + files ─────────────────────────────────────────────────────
  b.node('Project', input.projectId, {
    name: input.project?.name,
    path: input.project?.path,
    gitHead: input.project?.gitHead ?? null,
    gitBranch: input.project?.gitBranch ?? null,
    stats: input.project?.stats,
  });
  for (const r of rows) {
    const ir = r.ir;
    const props: Record<string, any> = {
      path: r.path,
      kind: r.kind,
      lang: ir?.lang,
      status: r.status,
    };
    if (r.status === 'unparsed') props.unparsed = true;
    if (ir?.flags.length) props.flags = ir.flags;
    if (ir?.envFile)
      props.envKeys = ir.envFile.keys.map((k) => ({ name: k.name, secretLike: k.secretLike }));
    const fid = b.node('File', r.path, props);
    b.edge('CONTAINS', pid, fid);
  }
  const fileHas = (path: string) => b.has(fileNodeId(path));

  // ── indexes over IR ────────────────────────────────────────────────────────
  const fnMap = new Map<string, { fn: FnIR; file: string }>();
  const children = new Map<string, string[]>();
  for (const r of indexed) {
    for (const fn of r.ir!.functions) {
      fnMap.set(fn.id, { fn, file: r.path });
      if (fn.parent) children.set(fn.parent, [...(children.get(fn.parent) ?? []), fn.id]);
    }
  }
  const subtree = (fnId: string): FnIR[] => {
    const out: FnIR[] = [];
    const walk = (id: string) => {
      const f = fnMap.get(id);
      if (!f) return;
      out.push(f.fn);
      for (const c of children.get(id) ?? []) walk(c);
    };
    walk(fnId);
    return out;
  };
  const authzByFn = new Map<string, AuthzIR[]>();
  for (const r of indexed)
    for (const a of r.ir!.authz) authzByFn.set(a.fnId, [...(authzByFn.get(a.fnId) ?? []), a]);

  const routes: LinkedRoute[] = indexed.flatMap((r) => r.linked?.routes ?? []);
  const handlerSet = new Set(
    routes.map((x) => x.handlerFnId).filter((x): x is string => !!x && fnMap.has(x)),
  );
  const mwFnSet = new Set(
    routes.flatMap((x) =>
      x.chain.map((c) => c.fnId).filter((x): x is string => !!x && fnMap.has(x)),
    ),
  );

  // owner node for something attributed to a fnId (module-level code → its File)
  const owner = (fnId: string, file: string): NodeId | null => {
    if (isModuleFn(fnId)) return fileHas(file) ? fileNodeId(file) : null;
    return fnMap.has(fnId) ? functionNodeId(fnId) : null;
  };

  // ── P2 functions ───────────────────────────────────────────────────────────
  for (const r of indexed) {
    const ir = r.ir!;
    for (const fn of ir.functions) {
      const props: Record<string, any> = {
        name: fn.name,
        file: r.path,
        params: fn.params,
        async: fn.async,
        traits: fn.traits,
        isHandler: handlerSet.has(fn.id),
        isMiddleware: mwFnSet.has(fn.id),
      };
      if (fn.parent) props.parent = fn.parent;
      const az = (authzByFn.get(fn.id) ?? []).map(compactAuthz);
      if (az.length) props.authz = az;
      const rs = ir.responses
        .filter((x) => x.fnId === fn.id)
        .map((x) => ({ method: x.method, status: x.status, args: x.args, line: x.loc.line }));
      if (rs.length) props.responses = rs;
      const jw = ir.jwtOps
        .filter((x) => x.fnId === fn.id)
        .map((x) => ({
          op: x.op,
          secretSource: x.secretSource,
          algorithms: x.algorithms,
          expiresIn: x.expiresIn,
          flags: x.flags,
          line: x.loc.line,
        }));
      if (jw.length) props.jwtOps = jw;
      const ev = ir.envReads.filter((x) => x.fnId === fn.id).map((x) => x.name);
      if (ev.length) props.envReads = ev;
      const id = b.node('Function', fn.id, props, fn.loc);
      b.edge('CONTAINS', fileNodeId(r.path), id);
    }
  }

  // ── P3 models, assets, database ────────────────────────────────────────────
  const assetsByModel = new Map<string, { id: NodeId; field: string; selectFalse: boolean }[]>();
  for (const r of indexed) {
    for (const m of r.ir!.models) {
      const props = {
        name: m.name,
        schema: true,
        varName: m.varName,
        fields: m.fields,
        files: [r.path],
      };
      const id = b.node('Model', m.name, props, m.loc, (a, n) => ({
        ...a,
        files: union(a.files, n.files),
        fields: a.fields?.length ? a.fields : n.fields,
      }));
      b.edge('CONTAINS', fileNodeId(r.path), id);
      const assetFields = new Set<string>();
      for (const f of m.fields) {
        if (assetFields.has(f.name.split('.').slice(0, -1).join('.'))) continue; // parent already an asset → skip child
        const c = classifyField(m.name, f.name);
        if (!c) continue;
        assetFields.add(f.name);
        const aid = b.node('Asset', `${m.name}.${f.name}`, {
          model: m.name,
          field: f.name,
          tier: c.tier,
          weight: c.weight,
          type: f.type,
          selectFalse: f.select === false,
          ref: f.ref,
        });
        b.edge('CONTAINS', id, aid);
        assetsByModel.set(m.name, [
          ...(assetsByModel.get(m.name) ?? []),
          { id: aid, field: f.name, selectFalse: f.select === false },
        ]);
      }
    }
  }
  // models referenced by ops but without a schema in the indexed files
  for (const r of indexed) {
    for (const name of r.linked?.opModels ?? []) {
      if (name && !b.has(modelNodeId(name)))
        b.node('Model', name, {
          name,
          schema: false,
          raw: name.startsWith('collection:'),
          fields: [],
          files: [],
        });
    }
  }
  const hasMongoDep = indexed.some((r) =>
    r.ir!.deps.some((d) => d.name === 'mongoose' || d.name === 'mongodb'),
  );
  const models = [...b.nodes.values()].filter((n) => n.type === 'Model');
  let dbId: NodeId | null = null;
  if (models.length || hasMongoDep) {
    const envNames = union(
      indexed
        .flatMap((r) => r.ir!.envReads.map((e) => e.name))
        .filter((n) => /(mongo|database|db)_?(uri|url)/i.test(n)),
    ).sort();
    const credInUrl = indexed.some((r) =>
      r.ir!.secrets.some(
        (s) =>
          s.kind === 'connection-string' ||
          (s.kind === 'env-file-secret' && /(mongo|database|db)_?(uri|url)/i.test(s.name)),
      ),
    );
    dbId = b.node('Database', 'mongodb', {
      engine: 'mongodb',
      drivers: union(
        indexed.flatMap((r) =>
          r.ir!.deps.map((d) => d.name).filter((n) => n === 'mongoose' || n === 'mongodb'),
        ),
      ).sort(),
      connectionEnv: envNames,
      credentialsInUrl: credInUrl,
    });
    for (const m of models) b.edge('ACCESSES', m.id, dbId);
  }

  // ── P4 routes + middleware ─────────────────────────────────────────────────
  const mwNodes = new Map<
    NodeId,
    {
      authLike: boolean;
      enforcing: boolean;
      roleGuard: boolean;
      kind: string;
      name: string;
      args?: string[];
    }
  >();
  for (const rt of routes) {
    const rid = routeNodeId(rt.id);
    b.node(
      'Route',
      rt.id,
      {
        method: rt.method,
        path: rt.path,
        fullPath: rt.fullPath,
        file: rt.file,
        handler: rt.handlerFnId,
        mounted: rt.mounted,
        ...(rt.dynamic ? { dynamic: true } : {}),
      },
      rt.loc,
    );
    if (fileHas(rt.file)) b.edge('CONTAINS', fileNodeId(rt.file), rid);
    if (rt.mounted) b.edge('EXPOSES', pid, rid);
    if (rt.handlerFnId && fnMap.has(rt.handlerFnId))
      b.edge(
        'CALLS',
        rid,
        functionNodeId(rt.handlerFnId),
        rt.handler.wrapper ? { wrapper: rt.handler.wrapper } : undefined,
      );

    rt.chain.forEach((c, order) => {
      const internal = !!c.fnId && fnMap.has(c.fnId);
      const factoryArgs = c.ref.kind === 'call' && c.ref.args?.length ? c.ref.args : undefined;
      const key = internal
        ? factoryArgs
          ? `${c.fnId}(${factoryArgs.join(',')})`
          : c.fnId!
        : `ext:${stripArgs(c.ref.factory ?? c.ref.text)}`;
      const name = internal ? leafName(c.fnId!) : stripArgs(c.ref.factory ?? c.ref.text);
      const fns = internal ? subtree(c.fnId!) : [];
      const pol = judgeMiddleware({
        name,
        external: !internal,
        factory: c.ref.factory,
        traits: fns.length ? unionTraits(fns) : undefined,
        authz: fns.flatMap((f) => authzByFn.get(f.id) ?? []),
      });
      const mid = middlewareNodeId(key);
      b.node('Middleware', key, {
        name,
        external: !internal,
        ...(c.ref.factory ? { factory: c.ref.factory } : {}),
        ...(factoryArgs ? { args: factoryArgs } : {}),
        kind: pol.kind,
        authLike: pol.authLike,
        enforcing: pol.enforcing,
        roleGuard: pol.roleGuard,
        reason: pol.reason,
        ...(fns.length ? { traits: unionTraits(fns), fnId: c.fnId } : {}),
      });
      if (internal) b.edge('CALLS', mid, functionNodeId(c.fnId!), { role: 'implementation' });
      mwNodes.set(mid, { ...pol, name, args: factoryArgs });
      b.edge(
        'PROTECTED_BY',
        rid,
        mid,
        {
          order,
          orders: [order],
          origin: c.origin,
          ...(c.mountPath !== undefined ? { mountPath: c.mountPath } : {}),
          ...(c.conditional ? { conditional: true } : {}),
          authLike: pol.authLike,
          kind: pol.kind,
        },
        (a, n) => ({ ...a, orders: union(a.orders, n.orders) }),
      );
    });
  }

  // ── P5 inputs + FLOWS_TO (input → fn) ──────────────────────────────────────
  const inputCanon = new Map<string, string>(); // input node id -> canonical
  for (const r of indexed) {
    for (const i of r.ir!.inputs) {
      const own = owner(i.fnId, r.path);
      if (!own) continue;
      const canonical = `req.${i.source}${i.path ? '.' + i.path : ''}`;
      const iid = b.node(
        'Input',
        i.id,
        {
          fnId: i.fnId,
          source: i.source,
          path: i.path,
          canonical,
          boundTo: i.boundTo,
          userControlled: true,
        },
        i.loc,
      );
      inputCanon.set(iid, canonical);
      b.edge('FLOWS_TO', iid, own, { boundTo: i.boundTo });
    }
  }

  // ── P6 ops (ACCESSES / FLOWS_TO fn → model), calls, dependencies ───────────
  type OpRef = { op: MongoOpIR; model: string; file: string };
  const opsByFn = new Map<string, OpRef[]>();
  for (const r of indexed) {
    const models = r.linked?.opModels ?? [];
    r.ir!.mongoOps.forEach((op, i) => {
      const model = models[i];
      if (!model) return;
      const own = owner(op.fnId, r.path);
      if (!own || !b.has(modelNodeId(model))) return;
      opsByFn.set(op.fnId, [...(opsByFn.get(op.fnId) ?? []), { op, model, file: r.path }]);
      const compact = {
        op: op.op,
        ...(op.instance ? { instance: true } : {}),
        argSources: op.argSources,
        ...(op.queryShape ? { queryShape: op.queryShape } : {}),
        ...(op.select ? { select: op.select } : {}),
        ...(op.chain.length ? { chain: op.chain } : {}),
        ...(op.resultVar ? { resultVar: op.resultVar } : {}),
        line: op.loc.line,
        col: op.loc.col,
      };
      const merge = (a: Record<string, any>, n: Record<string, any>) => ({
        ...a,
        ops: pushCap(a.ops, n.ops, CAP.ops),
      });
      b.edge('ACCESSES', own, modelNodeId(model), { ops: [compact] }, merge);
      if (op.argSources.length)
        b.edge(
          'FLOWS_TO',
          own,
          modelNodeId(model),
          {
            ops: [
              {
                op: op.op,
                argSources: op.argSources,
                ...(op.queryShape ? { queryShape: op.queryShape } : {}),
                line: op.loc.line,
                col: op.loc.col,
              },
            ],
          },
          merge,
        );
    });
  }

  const declared = new Map<
    string,
    { pkgPath: string; range: string; installed?: string; dev: boolean }[]
  >();
  for (const r of indexed)
    for (const d of r.ir!.deps)
      declared.set(d.name, [
        ...(declared.get(d.name) ?? []),
        { pkgPath: d.pkgPath, range: d.range, installed: d.installed, dev: d.dev },
      ]);
  const ensureDep = (name: string, builtin = false) => {
    const decl = declared.get(name);
    return b.node('Dependency', name, {
      name,
      builtin,
      declared: !!decl,
      ...(decl
        ? {
            installed: decl.find((d) => d.installed)?.installed,
            range: decl[0]!.range,
            dev: decl.every((d) => d.dev),
            declaredIn: decl,
          }
        : {}),
    });
  };
  for (const name of [...declared.keys()].sort()) ensureDep(name);
  for (const r of indexed) {
    for (const d of r.ir!.deps)
      b.edge('DEPENDS_ON', fileNodeId(r.path), dependencyNodeId(d.name), {
        range: d.range,
        installed: d.installed,
        dev: d.dev,
        declared: true,
      });
  }
  const serviceUse = new Set<string>();
  for (const r of indexed) {
    const imports = r.linked?.imports ?? [];
    const firstLoc = new Map(r.ir!.imports.map((i) => [i.module, i.loc]));
    for (const imp of imports) {
      if (!imp.external) continue;
      const { name, builtin } = packageOf(imp.module);
      const did = ensureDep(name, builtin);
      b.edge(
        'DEPENDS_ON',
        fileNodeId(r.path),
        did,
        { modules: [imp.module], line: firstLoc.get(imp.module)?.line },
        (a, n) => ({ ...a, modules: union(a.modules, n.modules) }),
      );
      const svc = serviceFor(name);
      if (svc) {
        const sid = b.node(
          'ExternalService',
          svc.name,
          { name: svc.name, category: svc.category, packages: [name] },
          undefined,
          (a) => ({ ...a, packages: union(a.packages, [name]) }),
        );
        b.edge('USES', fileNodeId(r.path), sid, { package: name });
      }
    }
    for (const c of r.linked?.calls ?? []) {
      const from = owner(c.fnId, r.path);
      if (!from || c.fnId === '') continue;
      if (c.resolved.kind === 'fn') {
        const to = c.resolved.fnId;
        if (to !== c.fnId && fnMap.has(to))
          b.edge('CALLS', from, functionNodeId(to), { count: 1, line: c.loc.line }, (a) => ({
            ...a,
            count: (a.count ?? 1) + 1,
          }));
      } else if (c.resolved.kind === 'external') {
        const { name, builtin } = packageOf(c.resolved.module);
        const did = ensureDep(name, builtin);
        b.edge(
          'CALLS',
          from,
          did,
          { module: c.resolved.module, calls: [{ name: c.resolved.name, line: c.loc.line }] },
          (a, n) => ({ ...a, calls: pushCap(a.calls, n.calls, CAP.calls) }),
        );
        const svc = serviceFor(name);
        if (svc && !isModuleFn(c.fnId)) {
          const sid = b.node(
            'ExternalService',
            svc.name,
            { name: svc.name, category: svc.category, packages: [name] },
            undefined,
            (a) => ({ ...a, packages: union(a.packages, [name]) }),
          );
          const key = `${from}|${sid}`;
          if (!serviceUse.has(key)) {
            serviceUse.add(key);
            b.edge('USES', from, sid, { package: name });
          }
        }
      }
    }
  }

  // ── P7 secrets ─────────────────────────────────────────────────────────────
  const envDefault = new Map<string, boolean>();
  for (const r of indexed)
    for (const e of r.ir!.envReads)
      envDefault.set(e.name, (envDefault.get(e.name) ?? false) || e.hasDefault);
  const envSecret = (name: string, extra: Record<string, any> = {}) =>
    b.node('Secret', `env:${name}`, { name, source: 'env', ...extra }, undefined, (a, n) => ({
      ...a,
      ...n,
    }));
  for (const r of indexed) {
    for (const s of r.ir!.secrets) {
      if (s.kind === 'env-file-secret') {
        const sid = envSecret(s.name, {
          definedIn: s.loc.file,
          preview: s.preview,
          len: s.len,
          entropy: s.entropy,
          kind: s.kind,
        });
        if (fileHas(s.loc.file)) b.edge('CONTAINS', fileNodeId(s.loc.file), sid);
      } else {
        const sid = b.node(
          'Secret',
          `hardcoded:${s.loc.file}:${s.loc.line}`,
          {
            name: s.name,
            source: 'code',
            kind: s.kind,
            preview: s.preview,
            len: s.len,
            entropy: s.entropy,
            ...(envDefault.has(s.name) ? { fallbackFor: s.name } : {}),
            ...(s.name === 'jwt-secret' ? { usage: 'jwt' } : {}),
          },
          s.loc,
        );
        // smallest enclosing function by line range, else the file
        let best: FnIR | undefined;
        for (const fn of r.ir!.functions) {
          const end = fn.loc.endLine ?? fn.loc.line;
          if (
            fn.loc.line <= s.loc.line &&
            s.loc.line <= end &&
            (!best || end - fn.loc.line < (best.loc.endLine ?? best.loc.line) - best.loc.line)
          )
            best = fn;
        }
        if (best) b.edge('USES', functionNodeId(best.id), sid, { via: 'literal' });
        else if (fileHas(r.path)) b.edge('CONTAINS', fileNodeId(r.path), sid);
      }
    }
    for (const e of r.ir!.envReads) {
      if (!SECRET_NAME_RE.test(e.name)) continue;
      const sid = envSecret(e.name, { hasDefault: !!envDefault.get(e.name) });
      const from = owner(e.fnId ?? `${r.path}#<module>`, r.path);
      if (from)
        b.edge('USES', from, sid, { via: ['env'], hasDefault: e.hasDefault }, (a, n) => ({
          ...a,
          via: union(a.via, n.via),
          hasDefault: a.hasDefault || n.hasDefault,
        }));
    }
    for (const j of r.ir!.jwtOps) {
      if (j.secretSource.kind !== 'env') continue;
      const sid = envSecret(j.secretSource.name, {
        hasDefault: !!envDefault.get(j.secretSource.name),
      });
      const from = owner(j.fnId, r.path);
      if (from)
        b.edge('USES', from, sid, { via: [`jwt.${j.op}`] }, (a, n) => ({
          ...a,
          via: union(a.via, n.via),
        }));
    }
  }

  // ── P8 exposure: fn returns a var bound to a model op result ───────────────
  for (const r of indexed) {
    for (const resp of r.ir!.responses) {
      const from = owner(resp.fnId, r.path);
      if (!from) continue;
      const vars = new Set<string>();
      for (const a of resp.args) varsIn(a, vars);
      if (!vars.size) continue;
      for (const { op, model } of opsByFn.get(resp.fnId) ?? []) {
        if (!op.resultVar || !vars.has(op.resultVar) || !DOC_OPS.test(op.op)) continue;
        for (const a of assetsByModel.get(model) ?? []) {
          if (!isFieldExposed(a.field, op.select, a.selectFalse)) continue;
          b.edge(
            'EXPOSES',
            from,
            a.id,
            {
              via: resp.method,
              model,
              var: op.resultVar,
              confidence: 'direct',
              ...(op.select ? { select: op.select } : {}),
              opLine: op.loc.line,
              responses: [{ method: resp.method, status: resp.status, line: resp.loc.line }],
            },
            (x, n) => ({ ...x, responses: pushCap(x.responses, n.responses, CAP.responses) }),
          );
        }
      }
    }
  }

  // ── P9 route roll-up ───────────────────────────────────────────────────────
  const outEdges = new Map<NodeId, EdgeDraft[]>();
  for (const e of b.edges.values()) outEdges.set(e.from, [...(outEdges.get(e.from) ?? []), e]);
  for (const rt of routes) {
    const rid = routeNodeId(rt.id);
    const node = b.nodes.get(rid)!;
    const entries = rt.chain.map((c, order) => {
      const internal = !!c.fnId && fnMap.has(c.fnId);
      const factoryArgs = c.ref.kind === 'call' && c.ref.args?.length ? c.ref.args : undefined;
      const key = internal
        ? factoryArgs
          ? `${c.fnId}(${factoryArgs.join(',')})`
          : c.fnId!
        : `ext:${stripArgs(c.ref.factory ?? c.ref.text)}`;
      return { c, order, m: mwNodes.get(middlewareNodeId(key))! };
    });
    const solid = entries.filter((e) => e.m.authLike && !e.c.conditional);
    const authEnforcement = !solid.length
      ? 'none'
      : solid.some((e) => e.m.enforcing)
        ? 'enforcing'
        : 'weak';
    const roleGuards = entries
      .filter((e) => e.m.roleGuard && !e.c.conditional)
      .map((e) => ({ name: e.m.name, ...(e.m.args ? { args: e.m.args } : {}) }));

    const h = rt.handlerFnId && fnMap.has(rt.handlerFnId) ? functionNodeId(rt.handlerFnId) : null;
    const hOut = h ? (outEdges.get(h) ?? []) : [];
    const inputs = h
      ? [...b.nodes.values()]
          .filter((n) => n.type === 'Input' && n.props.fnId === rt.handlerFnId)
          .map((n) => n.props.canonical as string)
          .sort()
      : [];
    const flowsToModel = new Set<string>();
    for (const e of hOut)
      if (e.type === 'FLOWS_TO' && e.to.startsWith('Model:'))
        for (const o of e.props?.ops ?? []) for (const s of o.argSources ?? []) flowsToModel.add(s);
    const exposesUserId = [...flowsToModel].some((s) => {
      const m = /^req\.(params|query|body)\.?(.*)$/.exec(s);
      return !!m && !!m[2] && isIdLikePath(m[2]);
    });
    const exposesSensitive = hOut
      .filter((e) => e.type === 'EXPOSES' && e.to.startsWith('Asset:'))
      .map((e) => e.to)
      .sort();

    Object.assign(node.props, {
      protected: solid.length > 0,
      authEnforcement,
      authMiddleware: union(solid.map((e) => e.m.name)),
      roleGuards,
      exposesUserId,
      exposesSensitive,
      inputs,
    });
  }

  // ── done: deterministic order + consistency ────────────────────────────────
  const model: GraphModel = {
    nodes: [...b.nodes.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
    edges: [...b.edges.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
  };
  assertConsistent(model);
  return model;
}

/** every edge endpoint must exist — a violation is a builder bug, never persisted */
export function assertConsistent(model: GraphModel): void {
  const ids = new Set(model.nodes.map((n) => n.id));
  const bad = model.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  if (bad.length)
    throw new Error(`graph inconsistent: ${bad.length} dangling edge(s), e.g. ${bad[0]!.id}`);
}
