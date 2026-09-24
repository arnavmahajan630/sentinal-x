/**
 * IR (intermediate representation) produced by the indexer (C1) and consumed by the graph builder (C2).
 *
 * Two layers:
 *  - `FileIR`  : RAW, a pure function of one file's content (cacheable by `hash`).
 *  - `LinkedFile`: RESOLVED view produced by `link()` over ALL files (route full paths, chains, refs).
 * Extractors emit FACTS only; policy ("is this middleware auth-like?") belongs to C2.
 */

export const IR_VERSION = 1;

export interface Loc {
  file: string; // posix, project-relative
  line: number; // 1-based
  col: number; // 1-based
  endLine?: number;
}

export type FileKind = 'server' | 'client' | 'shared' | 'config' | 'test';
export type FileStatus = 'indexed' | 'recorded' | 'unparsed' | 'skipped';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ALL' | 'OPTIONS' | 'HEAD';

// ─── value sources (what feeds an expression) ────────────────────────────────
export type InputSource = 'params' | 'query' | 'body' | 'headers' | 'cookies';

export type ValueSrc =
  | { kind: 'input'; source: InputSource; path: string } // req.params.id → path 'id'; whole body → ''
  | { kind: 'authctx'; path: string } // req.user.id → 'user.id'
  | { kind: 'var'; name: string }
  | { kind: 'literal'; value?: string | number | boolean | null }
  | { kind: 'object'; keys: Record<string, ValueSrc> }
  | { kind: 'spread'; of: ValueSrc }
  | { kind: 'call'; text: string; inputs?: string[] } // inputs reaching the call's args (possibly transformed)
  | { kind: 'other'; text: string; inputs?: string[] };

// ─── references to functions / middleware / routers ──────────────────────────
export interface RefIR {
  text: string; // source text (trimmed, ≤120 chars)
  kind: 'ident' | 'member' | 'inline' | 'call' | 'unknown';
  /** inline fn id, or (after link) the resolved fn id */
  fnId?: string;
  /** `authorize('admin')` → factory 'authorize', args ["'admin'"] (BFLA role evidence) */
  factory?: string;
  args?: string[];
  /** `asyncHandler(fn)` → wrapper 'asyncHandler' (handler unwrapped to fn) */
  wrapper?: string;
  loc: Loc;
}

// ─── per-file raw IR ─────────────────────────────────────────────────────────
export interface ImportIR {
  module: string;
  style: 'esm' | 'cjs';
  /** local names bound by this import */
  default?: string;
  namespace?: string;
  names: { imported: string; local: string }[];
  resolvedPath?: string; // project-relative posix, for relative/alias specifiers that resolve to a file
  loc: Loc;
}

export interface ExportIR {
  /** exported name; 'default' for `export default` / `module.exports = x` */
  name: string;
  /** local identifier / member text it exports (when simple) */
  local?: string;
  fnId?: string;
  /** export is directly `mongoose.model('X', …)` */
  modelName?: string;
  /** re-export: `export { a } from './m'` / `export * from './m'` (name '*') */
  from?: string;
  style: 'esm' | 'cjs';
  loc: Loc;
}

export interface FnTraits {
  readsAuthHeader: boolean;
  callsJwtVerify: boolean;
  setsReqUser: boolean;
  sendsAuthError: boolean; // res.status(401|403) / sendStatus
  callsNext: boolean;
  usesReqRes: boolean; // looks like (req,res[,next]) or (err,req,res,next)
}

export interface CallIR {
  callee: string; // source text of callee expression
  /** for member calls `a.b.c()` → object 'a.b', name 'c' */
  object?: string;
  name: string;
  loc: Loc;
}

export interface FnIR {
  id: string;
  name: string;
  /** enclosing function id for nested fns (factory → returned middleware) */
  parent?: string;
  params: string[];
  async: boolean;
  calls: CallIR[];
  traits: FnTraits;
  loc: Loc;
}

export interface RouteIR {
  method: HttpMethod;
  path: string; // local path as registered ('' when regex/dynamic)
  /** identifier the route was registered on (`app`, `router`, `orderRouter`) */
  router: string;
  handler: RefIR;
  middleware: RefIR[]; // route-level, order preserved
  order: number; // registration order within the file
  dynamic?: boolean;
  loc: Loc;
}

export interface MountIR {
  router: string; // receiver (`app` / `router`)
  path?: string; // undefined = applies to everything
  args: RefIR[]; // middleware and/or routers, order preserved
  order: number;
  dynamic?: boolean;
  loc: Loc;
}

export interface RouterDeclIR {
  name: string; // variable name
  kind: 'app' | 'router';
  /** referenced (e.g. an `app` parameter) but not created in this file → never counted as mounted */
  implicit?: boolean;
  loc: Loc;
}

export interface InputIR {
  id: string; // `${fnId}:req.params.id`
  fnId: string;
  source: InputSource;
  path: string;
  boundTo: string[]; // variables holding this value
  loc: Loc;
}

export interface MongoOpIR {
  fnId: string;
  receiver: string; // `Order`, `this.model`, `doc` (instance)
  op: string;
  instance?: boolean; // doc.save() etc.
  queryShape?: ValueSrc;
  args: ValueSrc[];
  argSources: string[]; // canonical input refs reaching args: 'req.params.id', 'req.body'
  select?: string[]; // from .select('-password') / projection
  chain: string[]; // chained calls: ['select','lean']
  resultVar?: string;
  loc: Loc;
}

export interface ModelFieldIR {
  name: string;
  type?: string;
  ref?: string;
  select?: boolean;
  required?: boolean;
  unique?: boolean;
}
export interface ModelIR {
  name: string; // mongoose.model('Order', ...)
  varName?: string; // `const Order = mongoose.model(...)`
  fields: ModelFieldIR[];
  loc: Loc;
}

export interface JwtOpIR {
  fnId: string;
  op: 'sign' | 'verify' | 'decode';
  secretSource:
    | { kind: 'env'; name: string }
    | { kind: 'literal'; preview: string; len: number }
    | { kind: 'var'; name: string }
    | { kind: 'none' };
  algorithms?: string[];
  expiresIn?: string | null;
  flags: string[]; // 'ignoreExpiration', 'algorithm-none', 'decode-only'
  loc: Loc;
}

export interface EnvIR {
  name: string;
  fnId?: string;
  hasDefault: boolean;
  loc: Loc;
}

export interface SecretIR {
  kind: 'hardcoded-secret' | 'connection-string' | 'known-token' | 'env-file-secret';
  name: string;
  preview: string; // never raw
  len: number;
  entropy: number;
  loc: Loc;
}

export interface DepIR {
  name: string;
  range: string;
  installed?: string;
  dev: boolean;
  pkgPath: string;
}

export interface AuthzIR {
  fnId: string;
  kind: 'ownership-compare' | 'role-check' | 'user-scoped-query' | 'auth-context-read';
  expr: string;
  /** ownership/role: which auth-context path is compared against what */
  operands?: { auth: string; other: ValueSrc };
  /** best-effort: does a failing check stop the request? */
  guards?: { status?: number; action: 'respond' | 'throw' | 'next' };
  loc: Loc;
}

export interface ResponseIR {
  fnId: string;
  method: string; // json | send | render | sendStatus | status.json …
  args: ValueSrc[];
  status?: number;
  loc: Loc;
}

export interface EnvFileIR {
  keys: { name: string; preview: string; len: number; secretLike: boolean }[];
}

export interface FileIR {
  path: string;
  kind: FileKind;
  lang: 'ts' | 'js' | 'json' | 'env' | 'other';
  imports: ImportIR[];
  exports: ExportIR[];
  routers: RouterDeclIR[];
  functions: FnIR[];
  routes: RouteIR[];
  mounts: MountIR[];
  inputs: InputIR[];
  mongoOps: MongoOpIR[];
  models: ModelIR[];
  jwtOps: JwtOpIR[];
  envReads: EnvIR[];
  secrets: SecretIR[];
  deps: DepIR[];
  authz: AuthzIR[];
  responses: ResponseIR[];
  envFile?: EnvFileIR;
  /** tsconfig/jsconfig path aliases (config files only) */
  tsconfig?: { baseUrl?: string; paths: Record<string, string[]> };
  /** file-level flags, e.g. 'dynamic-registration' */
  flags: string[];
}

export function emptyFileIR(path: string, kind: FileKind, lang: FileIR['lang']): FileIR {
  return {
    path,
    kind,
    lang,
    imports: [],
    exports: [],
    routers: [],
    functions: [],
    routes: [],
    mounts: [],
    inputs: [],
    mongoOps: [],
    models: [],
    jwtOps: [],
    envReads: [],
    secrets: [],
    deps: [],
    authz: [],
    responses: [],
    flags: [],
  };
}

// ─── linked view ─────────────────────────────────────────────────────────────
export type ChainOrigin = 'app' | 'mount' | 'router' | 'route';
export interface ChainEntry {
  ref: RefIR;
  fnId?: string;
  origin: ChainOrigin;
  mountPath?: string;
  /** the `use()` path was dynamic, so applicability to this route is uncertain */
  conditional?: boolean;
}

export interface LinkedRoute {
  id: string; // "GET /api/orders/:id"
  method: HttpMethod;
  path: string; // local path
  fullPath: string;
  file: string;
  router: string;
  handlerFnId?: string;
  handler: RefIR;
  chain: ChainEntry[]; // ordered, execution order (before the handler)
  mounted: boolean;
  dynamic?: boolean;
  loc: Loc;
}

export type ResolvedCall =
  | { kind: 'fn'; fnId: string }
  | { kind: 'model'; model: string }
  | { kind: 'external'; module: string; name: string }
  | { kind: 'unresolved' };

export interface LinkedCall extends CallIR {
  fnId: string; // caller
  resolved: ResolvedCall;
}

export interface LinkedImport {
  module: string;
  resolvedPath?: string; // project file, when the specifier resolves inside the project
  external: boolean;
}

export interface LinkedFile {
  imports: LinkedImport[];
  routes: LinkedRoute[];
  calls: LinkedCall[];
  /** model name resolved per mongoOps index */
  opModels: (string | null)[];
}

export interface LinkResult {
  files: Record<string, LinkedFile>;
  /** all linked routes, ids unique */
  routes: LinkedRoute[];
}

export interface IndexStats {
  files: number;
  indexed: number;
  recorded: number;
  unparsed: number;
  skipped: number;
  routes: number;
  functions: number;
  mongoOps: number;
  models: number;
  inputs: number;
  deps: number;
}
