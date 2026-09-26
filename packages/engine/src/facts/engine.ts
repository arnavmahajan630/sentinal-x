import { MongoGraphStore } from '../graph/mongoStore';
import { serviceFor } from '../graph/services';
import type { GraphStore } from '../graph/store';
import type { Edge, Node } from '../graph/types';
import { deriveAuthorization, isBlocking } from './authorization';
import { FactError } from './errors';
import { resolveByName, resolveFn, resolveRoute } from './resolve';
import { AUTHZ_DEPTH, DATA_DEPTH, Snapshot } from './snapshot';
import type {
  AccessFact,
  AssetFact,
  AuthzEvidence,
  CallNode,
  DataflowFact,
  DbOpFact,
  DependencyFact,
  ExposureFact,
  GapFact,
  InputFact,
  JwtUsageFact,
  LocDTO,
  MiddlewareFact,
  Page,
  RouteFact,
  RouteFilter,
  RouteSummary,
  SecretFact,
} from './types';

export const WRITE_OP =
  /^(create|insertMany|insertOne|new|save|update\w*|delete\w*|remove|replaceOne|findByIdAnd(Update|Delete|Remove)|findOneAnd(Update|Delete|Remove|Replace)|findAndModify|bulkWrite)$/;
export const MASS_ASSIGN_OP =
  /^(create|insertMany|insertOne|new|update\w*|replaceOne|findByIdAndUpdate|findOneAndUpdate|findOneAndReplace|findAndModify)$/;
const MUTATING_METHOD = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_LIMIT = 100;
const MAX_CALL_NODES = 200;
const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface RouteEntry {
  fact: RouteFact;
  reasons: GapFact['reasons'];
}

/**
 * Typed, located, JSON-only facts over the security graph. One instance = one agent run:
 * it snapshots the project graph once (through the GraphStore) and memoizes results.
 * Create a NEW instance after a rebuild.
 */
export class FactEngine {
  private snapP?: Promise<Snapshot>;
  private memo = new Map<string, unknown>();

  constructor(private readonly store: GraphStore) {}

  private snap(): Promise<Snapshot> {
    return (this.snapP ??= Snapshot.load(this.store));
  }
  clearCache(): void {
    this.snapP = undefined;
    this.memo.clear();
  }
  private cached<T>(key: string, fn: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, fn());
    return this.memo.get(key) as T;
  }

  // ─── internals ─────────────────────────────────────────────────────────────
  private routeEntries(s: Snapshot): Map<string, RouteEntry> {
    return this.cached('routes', () => {
      const m = new Map<string, RouteEntry>();
      for (const r of s.ofType('Route')) m.set(r.key, this.buildRoute(s, r));
      return m;
    });
  }

  private opsOf(s: Snapshot, fn: Node, via: 'handler' | 'callee'): DbOpFact[] {
    const out: DbOpFact[] = [];
    for (const e of s.out(fn.id, 'ACCESSES')) {
      if (!e.to.startsWith('Model:')) continue;
      for (const o of e.props?.ops ?? []) {
        out.push({
          model: e.to.slice('Model:'.length),
          op: o.op,
          fn: fn.key,
          via,
          argSources: o.argSources ?? [],
          ...(o.queryShape ? { queryShape: o.queryShape } : {}),
          ...(o.select ? { select: o.select } : {}),
          ...(o.resultVar ? { resultVar: o.resultVar } : {}),
          ...(o.instance ? { instance: true } : {}),
          loc: { file: s.fileOf(fn) ?? '', line: o.line, ...(o.col ? { col: o.col } : {}) },
        });
      }
    }
    return out;
  }

  private exposureOf(s: Snapshot, fn: Node): ExposureFact[] {
    const out: ExposureFact[] = [];
    for (const e of s.out(fn.id, 'EXPOSES')) {
      const a = s.get(e.to);
      if (!a || a.type !== 'Asset') continue;
      const p = e.props ?? {};
      out.push({
        fn: fn.key,
        asset: a.key,
        assetId: a.id,
        model: a.props.model,
        tier: a.props.tier,
        weight: a.props.weight,
        via: p.via,
        ...(p.responses?.[0]?.status !== undefined ? { status: p.responses[0].status } : {}),
        var: p.var,
        ...(p.select ? { select: p.select } : {}),
        confidence: p.confidence ?? 'direct',
        routes: s.routesReaching(fn.id).map((r) => r.key),
        ...(p.responses?.[0]?.line
          ? { loc: { file: s.fileOf(fn) ?? '', line: p.responses[0].line } }
          : {}),
      });
    }
    return out;
  }

  private authzSignals(s: Snapshot, fn: Node, where: AuthzEvidence['where']): AuthzEvidence[] {
    const out: AuthzEvidence[] = [];
    for (const a of fn.props.authz ?? []) {
      if (a.kind === 'auth-context-read') continue;
      out.push({
        kind: a.kind,
        blocking: isBlocking(a.kind, a.guards),
        expr: a.expr,
        fn: fn.key,
        where,
        ...(a.guards ? { guards: a.guards } : {}),
        loc: { file: s.fileOf(fn) ?? '', line: a.line },
      });
    }
    return out;
  }

  private buildRoute(s: Snapshot, route: Node): RouteEntry {
    const p = route.props;
    const handlerId = p.handler ? `Function:${p.handler}` : undefined;

    // ordered middleware chain
    const middleware: MiddlewareFact[] = [];
    for (const e of s.out(route.id, 'PROTECTED_BY')) {
      const mw = s.get(e.to);
      if (!mw) continue;
      const fnNode = mw.props.fnId ? s.get(`Function:${mw.props.fnId}`) : undefined;
      for (const order of e.props?.orders ?? [e.props?.order ?? 0]) {
        middleware.push({
          name: mw.props.name,
          kind: mw.props.kind,
          order,
          origin: e.props?.origin,
          external: !!mw.props.external,
          authLike: !!mw.props.authLike,
          enforcing: !!mw.props.enforcing,
          roleGuard: !!mw.props.roleGuard,
          ...(mw.props.args ? { args: mw.props.args } : {}),
          ...(e.props?.conditional ? { conditional: true } : {}),
          ...(mw.props.fnId ? { fn: mw.props.fnId } : {}),
          ...(fnNode ? { loc: s.loc(fnNode) } : {}),
        });
      }
    }
    middleware.sort((a, b) => a.order - b.order);

    const dataClosure = handlerId ? s.closure(handlerId, DATA_DEPTH) : [];
    const authClosure = dataClosure.filter((c) => c.depth <= AUTHZ_DEPTH);

    // inputs (read by the handler)
    const inputs: InputFact[] = [];
    if (handlerId) {
      for (const e of s.in(handlerId, 'FLOWS_TO')) {
        const n = s.get(e.from);
        if (n?.type === 'Input') inputs.push(this.inputFact(s, n));
      }
    }
    inputs.sort((a, b) => byStr(a.canonical, b.canonical));

    // db ops + models + assets
    const dbOps = dataClosure.flatMap((c) =>
      this.opsOf(s, c.node, c.depth === 0 ? 'handler' : 'callee'),
    );
    dbOps.sort((a, b) => byStr(a.fn, b.fn) || a.loc.line - b.loc.line);
    const models = [...new Set(dbOps.map((o) => o.model))].sort();
    const sensitiveFields = models
      .flatMap((m) =>
        s
          .out(`Model:${m}`, 'CONTAINS')
          .map((e) => s.get(e.to))
          .filter((n): n is Node => n?.type === 'Asset')
          .map((n) => n.key),
      )
      .sort();
    const exposedSensitive = dataClosure
      .flatMap((c) => this.exposureOf(s, c.node))
      .sort((a, b) => byStr(a.asset, b.asset));
    const exposesSensitive = [...new Set(exposedSensitive.map((x) => x.asset))].sort();

    // authorization evidence: handler + callees (depth ≤ 2) + chain middleware fns (incl. nested)
    const evidence: AuthzEvidence[] = authClosure.flatMap((c) =>
      this.authzSignals(s, c.node, c.depth === 0 ? 'handler' : 'callee'),
    );
    for (const m of middleware) {
      if (m.conditional || !m.fn) continue;
      const subtree = s.subtree(`Function:${m.fn}`);
      const sigs = subtree.flatMap((f) => this.authzSignals(s, f, 'middleware'));
      evidence.push(...sigs);
      if (m.roleGuard && !sigs.some((x) => x.kind === 'role-check')) {
        evidence.push({
          kind: 'role-guard-middleware',
          blocking: false,
          expr: `${m.name}${m.args ? `(${m.args.join(', ')})` : ''}`,
          fn: m.fn,
          where: 'middleware',
        });
      }
    }
    const seen = new Set<string>();
    const authzEvidence = evidence.filter((e) => {
      const k = `${e.kind}|${e.fn}|${e.expr}|${e.loc?.line}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });

    const selfAuthenticated = authClosure.some(
      (c) =>
        c.node.props.traits?.callsJwtVerify ||
        (c.node.props.traits?.readsAuthHeader && c.node.props.traits?.setsReqUser),
    );
    const authorization = deriveAuthorization({
      protected: !!p.protected,
      authEnforcement: p.authEnforcement,
      selfAuthenticated,
      evidence: authzEvidence,
    });

    const writeOps = dbOps.some((o) => WRITE_OP.test(o.op));
    const massAssignment = dbOps.some(
      (o) => MASS_ASSIGN_OP.test(o.op) && o.argSources.includes('req.body'),
    );
    const mutates = writeOps || MUTATING_METHOD.has(p.method);
    const exposesUserId = !!p.exposesUserId;

    const summary: RouteSummary = {
      id: route.key,
      method: p.method,
      path: p.path,
      fullPath: p.fullPath,
      ...(p.handler ? { handler: p.handler } : {}),
      protected: !!p.protected,
      authEnforcement: p.authEnforcement,
      authorization,
      exposesUserId,
      mutates,
      massAssignment,
      exposesSensitive,
      models,
    };
    const fact: RouteFact = {
      ...summary,
      authMiddleware: p.authMiddleware ?? [],
      roleGuards: p.roleGuards ?? [],
      middleware,
      inputs,
      dbOps,
      sensitiveFields,
      exposedSensitive,
      authzEvidence,
      selfAuthenticated,
      mounted: !!p.mounted,
      dynamic: !!p.dynamic,
      file: p.file,
      ...(s.loc(route) ? { loc: s.loc(route) } : {}),
    };

    const reasons: GapFact['reasons'] = [];
    if (exposesUserId) reasons.push('idParamReachesDb');
    if (writeOps) reasons.push('mutatesData');
    if (exposesSensitive.length) reasons.push('exposesSensitive');
    if (massAssignment) reasons.push('massAssignment');
    return { fact, reasons };
  }

  private inputFact(s: Snapshot, n: Node): InputFact {
    return {
      id: n.id,
      canonical: n.props.canonical,
      source: n.props.source,
      path: n.props.path,
      boundTo: n.props.boundTo ?? [],
      fn: n.props.fnId,
      ...(s.loc(n) ? { loc: s.loc(n) } : {}),
    };
  }

  private page<T>(all: T[], limit = DEFAULT_LIMIT, offset = 0): Page<T> {
    const items = all.slice(offset, offset + limit);
    return {
      total: all.length,
      offset,
      limit,
      truncated: offset + items.length < all.length,
      items,
    };
  }

  private summaryOf(f: RouteFact): RouteSummary {
    const {
      id,
      method,
      path,
      fullPath,
      handler,
      protected: prot,
      authEnforcement,
      authorization,
      exposesUserId,
      mutates,
      massAssignment,
      exposesSensitive,
      models,
    } = f;
    return {
      id,
      method,
      path,
      fullPath,
      ...(handler ? { handler } : {}),
      protected: prot,
      authEnforcement,
      authorization,
      exposesUserId,
      mutates,
      massAssignment,
      exposesSensitive,
      models,
    };
  }

  private route(s: Snapshot, ref: string): RouteEntry {
    const node = resolveRoute(s.ofType('Route'), ref);
    return this.routeEntries(s).get(node.key)!;
  }

  // ─── public facts ──────────────────────────────────────────────────────────
  async getRoutes(filter: RouteFilter = {}): Promise<Page<RouteSummary>> {
    const s = await this.snap();
    const model = filter.touchesModel
      ? resolveByName('model', s.ofType('Model'), filter.touchesModel, 'Model').key
      : undefined;
    const all = [...this.routeEntries(s).values()]
      .map((e) => e.fact)
      .filter(
        (f) =>
          (filter.includeUnmounted || f.mounted) &&
          (filter.protected === undefined || f.protected === filter.protected) &&
          (!filter.method || f.method === filter.method.toUpperCase()) &&
          (!filter.pathPrefix || f.fullPath.startsWith(filter.pathPrefix)) &&
          (!filter.authorization || f.authorization === filter.authorization) &&
          (!model || f.models.includes(model)) &&
          (filter.exposesSensitive === undefined ||
            f.exposesSensitive.length > 0 === filter.exposesSensitive) &&
          (filter.mutates === undefined || f.mutates === filter.mutates),
      )
      .map((f) => this.summaryOf(f))
      .sort((a, b) => byStr(a.id, b.id));
    return this.page(all, filter.limit, filter.offset);
  }

  async getRoute(route: string): Promise<RouteFact> {
    return this.route(await this.snap(), route).fact;
  }

  async getMiddlewareChain(route: string): Promise<MiddlewareFact[]> {
    return this.route(await this.snap(), route).fact.middleware;
  }

  async getUnprotectedRoutes(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Page<RouteSummary>> {
    return this.getRoutes({ protected: false, ...opts });
  }

  async getRoutesTouchingModel(
    model: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Page<RouteSummary>> {
    return this.getRoutes({ touchesModel: model, ...opts });
  }

  async getAuthorizationGaps(
    opts: { relevantOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<Page<GapFact>> {
    const s = await this.snap();
    const relevantOnly = opts.relevantOnly ?? true;
    const gaps: GapFact[] = [];
    for (const { fact, reasons } of this.routeEntries(s).values()) {
      if (!fact.mounted || !fact.protected || fact.authorization === 'present') continue;
      if (relevantOnly && !reasons.length) continue;
      gaps.push({ route: this.summaryOf(fact), reasons });
    }
    gaps.sort((a, b) => byStr(a.route.id, b.route.id));
    return this.page(gaps, opts.limit, opts.offset);
  }

  async getCallGraph(
    fn: string,
    opts: { depth?: number; direction?: 'out' | 'in' } = {},
  ): Promise<CallNode> {
    const s = await this.snap();
    const root = resolveFn(s.ofType('Function'), fn);
    const depth = Math.min(Math.max(opts.depth ?? 3, 1), 6);
    const dir = opts.direction ?? 'out';
    let count = 0;
    let truncated = false;

    const fnNode = (n: Node): CallNode => ({
      id: n.key,
      kind: 'function',
      name: n.props.name,
      file: s.fileOf(n),
      ...(s.loc(n) ? { loc: s.loc(n) } : {}),
    });
    const visit = (n: Node, d: number, path: Set<string>): CallNode => {
      const node = fnNode(n);
      count++;
      if (d === 0) return node;
      const kids: CallNode[] = [];
      const edges = dir === 'out' ? s.out(n.id) : s.in(n.id, 'CALLS');
      for (const e of edges) {
        if (count >= MAX_CALL_NODES) {
          truncated = true;
          break;
        }
        if (dir === 'out') {
          const t = s.get(e.to);
          if (!t) continue;
          if (e.type === 'CALLS' && t.type === 'Function') {
            if (path.has(t.id)) kids.push({ ...fnNode(t), cycle: true });
            else kids.push(visit(t, d - 1, new Set([...path, t.id])));
          } else if (e.type === 'CALLS' && t.type === 'Dependency') {
            count++;
            kids.push({
              id: t.key,
              kind: 'dependency',
              name: t.key,
              detail: (e.props?.calls ?? []).map((c: any) => c.name),
            });
          } else if (e.type === 'ACCESSES' && t.type === 'Model') {
            count++;
            kids.push({
              id: t.key,
              kind: 'model',
              name: t.key,
              detail: [...new Set<string>((e.props?.ops ?? []).map((o: any) => o.op))],
            });
          }
        } else {
          const f = s.get(e.from);
          if (!f) continue;
          if (f.type === 'Function') {
            if (path.has(f.id)) kids.push({ ...fnNode(f), cycle: true });
            else kids.push(visit(f, d - 1, new Set([...path, f.id])));
          } else if (f.type === 'Route') {
            count++;
            kids.push({ id: f.key, kind: 'route', name: f.key, file: f.props.file });
          } else if (f.type === 'Middleware') {
            count++;
            kids.push({ id: f.key, kind: 'middleware', name: f.props.name });
          }
        }
      }
      if (kids.length) node.calls = kids;
      return node;
    };
    const tree = visit(root, depth, new Set([root.id]));
    if (truncated) tree.truncated = true;
    return tree;
  }

  async getDataflow(args: {
    route?: string;
    input?: string;
    inputId?: string;
  }): Promise<DataflowFact[]> {
    const s = await this.snap();
    let inputs: InputFact[];
    if (args.inputId) {
      const n = s.get(args.inputId.startsWith('Input:') ? args.inputId : `Input:${args.inputId}`);
      if (!n || n.type !== 'Input') throw new FactError('not_found', `No input "${args.inputId}"`);
      inputs = [this.inputFact(s, n)];
    } else if (args.route) {
      const all = this.route(s, args.route).fact.inputs;
      const want = args.input?.replace(/^req\./, '');
      inputs = want
        ? all.filter(
            (i) => i.canonical === args.input || i.canonical === `req.${want}` || i.path === want,
          )
        : all;
      if (want && !inputs.length)
        throw new FactError(
          'not_found',
          `Route has no input "${args.input}"`,
          all.map((i) => i.canonical),
        );
    } else throw new FactError('invalid_argument', 'Provide route (optionally input) or inputId');

    return inputs.map((input) => {
      const steps: DataflowFact['steps'] = [];
      const sinks: DataflowFact['sinks'] = [];
      for (const e of s.out(input.id, 'FLOWS_TO')) {
        const fn = s.get(e.to);
        if (!fn) continue;
        const fname = `${fn.props.name}()`;
        steps.push({
          from: input.canonical,
          to: fname,
          via: input.boundTo.length ? `read (bound to ${input.boundTo.join(', ')})` : 'read',
          edgeType: 'FLOWS_TO',
          ...(input.loc ? { loc: input.loc } : {}),
        });
        for (const fe of s.out(fn.id, 'FLOWS_TO')) {
          if (!fe.to.startsWith('Model:')) continue;
          for (const o of fe.props?.ops ?? []) {
            if (!(o.argSources ?? []).includes(input.canonical)) continue;
            const keys = queryKeysFor(o.queryShape, input.canonical);
            const loc: LocDTO = {
              file: s.fileOf(fn) ?? '',
              line: o.line,
              ...(o.col ? { col: o.col } : {}),
            };
            steps.push({
              from: fname,
              to: fe.to.slice('Model:'.length),
              via: keys.length ? `${o.op}(${keys.join(', ')})` : o.op,
              edgeType: 'FLOWS_TO',
              loc,
            });
            sinks.push({
              model: fe.to.slice('Model:'.length),
              op: o.op,
              fn: fn.key,
              argSources: o.argSources,
              ...(o.queryShape ? { queryShape: o.queryShape } : {}),
              ...(o.select ? { select: o.select } : {}),
              loc,
            });
          }
        }
      }
      return { input, steps, sinks };
    });
  }

  async getModelAccess(model: string): Promise<AccessFact[]> {
    const s = await this.snap();
    const m = resolveByName('model', s.ofType('Model'), model, 'Model');
    const out: AccessFact[] = [];
    for (const e of s.in(m.id, 'ACCESSES')) {
      const from = s.get(e.from);
      if (!from || (from.type !== 'Function' && from.type !== 'File')) continue;
      const routes = from.type === 'Function' ? s.routesReaching(from.id).map((r) => r.key) : [];
      for (const o of e.props?.ops ?? []) {
        out.push({
          fn: from.key,
          op: o.op,
          model: m.key,
          argSources: o.argSources ?? [],
          ...(o.queryShape ? { queryShape: o.queryShape } : {}),
          ...(o.select ? { select: o.select } : {}),
          ...(o.resultVar ? { resultVar: o.resultVar } : {}),
          ...(o.instance ? { instance: true } : {}),
          inputCarrying: (o.argSources ?? []).length > 0,
          reachableFromRoutes: routes,
          loc: { file: s.fileOf(from) ?? '', line: o.line, ...(o.col ? { col: o.col } : {}) },
        });
      }
    }
    return out.sort((a, b) => byStr(a.fn, b.fn) || a.loc.line - b.loc.line);
  }

  async getDependency(name: string): Promise<DependencyFact> {
    const s = await this.snap();
    const d = resolveByName('dependency', s.ofType('Dependency'), name, 'Dependency');
    const p = d.props;
    const svc = serviceFor(d.key);
    const usedBy = s
      .in(d.id, 'DEPENDS_ON')
      .filter((e) => !e.props?.declared)
      .map((e) => s.get(e.from)?.key)
      .filter((x): x is string => !!x);
    const calledFrom = s
      .in(d.id, 'CALLS')
      .map((e) => ({
        fn: s.get(e.from)?.key ?? e.from,
        calls: (e.props?.calls ?? []).map((c: any) => ({ name: c.name, line: c.line })),
      }))
      .sort((a, b) => byStr(a.fn, b.fn));
    return {
      name: d.key,
      ...(p.installed || p.range ? { version: p.installed ?? p.range } : {}),
      ...(p.range ? { range: p.range } : {}),
      ...(p.installed ? { installed: p.installed } : {}),
      ...(p.dev !== undefined ? { dev: p.dev } : {}),
      declared: !!p.declared,
      builtin: !!p.builtin,
      ...(svc ? { service: svc } : {}),
      declaredIn: p.declaredIn ?? [],
      usedBy: usedBy.sort(),
      calledFrom,
    };
  }

  async getSensitiveAssets(opts: { tier?: string } = {}): Promise<AssetFact[]> {
    const s = await this.snap();
    const routes = [...this.routeEntries(s).values()].map((e) => e.fact).filter((f) => f.mounted);
    return s
      .ofType('Asset')
      .filter((a) => !opts.tier || a.props.tier === opts.tier)
      .map((a) => ({
        id: a.id,
        model: a.props.model,
        field: a.props.field,
        sensitive: true as const,
        tier: a.props.tier,
        weight: a.props.weight,
        selectFalse: !!a.props.selectFalse,
        touchedByRoutes: routes
          .filter((r) => r.models.includes(a.props.model))
          .map((r) => r.id)
          .sort(),
        exposedByRoutes: routes
          .filter((r) => r.exposesSensitive.includes(a.key))
          .map((r) => r.id)
          .sort(),
      }))
      .sort((a, b) => b.weight - a.weight || byStr(a.id, b.id));
  }

  async getJwtUsage(): Promise<JwtUsageFact[]> {
    const s = await this.snap();
    const mounted = (r: Node) => !!r.props.mounted;
    // middleware fn subtrees → which middleware nodes contain a given function
    const mwOf = new Map<string, Node[]>();
    for (const m of s.ofType('Middleware')) {
      if (!m.props.fnId) continue;
      for (const f of s.subtree(`Function:${m.props.fnId}`))
        mwOf.set(f.key, [...(mwOf.get(f.key) ?? []), m]);
    }
    const out: JwtUsageFact[] = [];
    for (const fn of s.ofType('Function')) {
      for (const j of fn.props.jwtOps ?? []) {
        const routes = new Map<string, Node>();
        for (const r of s.routesReaching(fn.id)) routes.set(r.id, r);
        for (const m of mwOf.get(fn.key) ?? []) {
          for (const e of s.in(m.id, 'PROTECTED_BY')) {
            const r = s.get(e.from);
            if (r && !e.props?.conditional) routes.set(r.id, r);
          }
        }
        out.push({
          fn: fn.key,
          file: s.fileOf(fn) ?? '',
          op: j.op,
          secretSource: j.secretSource,
          ...(j.algorithms ? { algorithms: j.algorithms } : {}),
          ...(j.expiresIn !== undefined ? { expiresIn: j.expiresIn } : {}),
          flags: j.flags ?? [],
          line: j.line,
          usedByRoutes: [...routes.values()]
            .filter(mounted)
            .map((r) => r.key)
            .sort(),
        });
      }
    }
    return out.sort((a, b) => byStr(a.file, b.file) || a.line - b.line);
  }

  async getSecrets(): Promise<SecretFact[]> {
    const s = await this.snap();
    return s
      .ofType('Secret')
      .map((n) => ({
        id: n.id,
        name: n.props.name,
        source: n.props.source,
        ...(n.props.kind ? { kind: n.props.kind } : {}),
        ...(n.props.preview !== undefined ? { preview: n.props.preview, len: n.props.len } : {}),
        ...(n.props.definedIn ? { definedIn: n.props.definedIn } : {}),
        ...(n.props.hasDefault !== undefined ? { hasDefault: !!n.props.hasDefault } : {}),
        ...(n.props.fallbackFor ? { fallbackFor: n.props.fallbackFor } : {}),
        ...(n.props.usage ? { usage: n.props.usage } : {}),
        usedBy: s
          .in(n.id, 'USES')
          .map((e: Edge) => ({
            node: s.get(e.from)?.key ?? e.from,
            via: (Array.isArray(e.props?.via)
              ? e.props?.via
              : [e.props?.via ?? 'literal']) as string[],
          }))
          .sort((a, b) => byStr(a.node, b.node)),
        ...(s.loc(n) ? { loc: s.loc(n) } : {}),
      }))
      .sort((a, b) => byStr(a.id, b.id));
  }

  async getExposure(opts: { route?: string; asset?: string } = {}): Promise<ExposureFact[]> {
    const s = await this.snap();
    let fnKeys: Set<string> | undefined;
    if (opts.route) {
      const r = resolveRoute(s.ofType('Route'), opts.route);
      fnKeys = new Set(
        r.props.handler
          ? s.closure(`Function:${r.props.handler}`, DATA_DEPTH).map((c) => c.node.key)
          : [],
      );
    }
    const asset = opts.asset
      ? resolveByName('asset', s.ofType('Asset'), opts.asset, 'Asset').key
      : undefined;
    const out: ExposureFact[] = [];
    for (const fn of s.ofType('Function')) {
      if (fnKeys && !fnKeys.has(fn.key)) continue;
      for (const x of this.exposureOf(s, fn)) if (!asset || x.asset === asset) out.push(x);
    }
    return out.sort((a, b) => byStr(a.asset, b.asset) || byStr(a.fn, b.fn));
  }
}

/** keys of a query object whose value is (exactly) this input, e.g. login → username/password */
function queryKeysFor(shape: any, canonical: string, depth = 0): string[] {
  if (!shape || depth > 2) return [];
  if (shape.kind === 'input')
    return `req.${shape.source}${shape.path ? '.' + shape.path : ''}` === canonical ? ['arg0'] : [];
  if (shape.kind === 'object') {
    const keys: string[] = [];
    for (const [k, v] of Object.entries<any>(shape.keys ?? {})) {
      const hit = queryKeysFor(v, canonical, depth + 1);
      if (hit.length) keys.push(k.startsWith('...') ? k : k);
    }
    return keys;
  }
  return [];
}

export function createFactEngine(projectId: string): FactEngine {
  return new FactEngine(new MongoGraphStore(projectId));
}

/** true for DB operations that write (create/update/delete/save/new …) */
export const isWriteOp = (op: string): boolean => WRITE_OP.test(op);
