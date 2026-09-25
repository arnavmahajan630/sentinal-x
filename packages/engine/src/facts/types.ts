/** Fact DTOs: stable, JSON-serializable, located. Never source blobs. */
export interface LocDTO {
  file: string;
  line: number;
  col?: number;
  endLine?: number;
}

export interface Page<T> {
  total: number;
  offset: number;
  limit: number;
  truncated: boolean;
  items: T[];
}

export type Authorization = 'present' | 'unknown' | 'none';
export type AuthEnforcement = 'enforcing' | 'weak' | 'none';
export type MiddlewareKindFact = 'auth' | 'role' | 'validation' | 'other';

export interface InputFact {
  id: string; // Input node id
  canonical: string; // req.params.id
  source: string;
  path: string;
  boundTo: string[];
  fn: string;
  loc?: LocDTO;
}

export interface DbOpFact {
  model: string;
  op: string;
  fn: string;
  via: 'handler' | 'callee';
  argSources: string[];
  queryShape?: unknown;
  select?: string[];
  resultVar?: string;
  instance?: boolean;
  loc: LocDTO;
}

export interface AuthzEvidence {
  kind: 'ownership-compare' | 'user-scoped-query' | 'role-check' | 'role-guard-middleware';
  /** true only when the check really stops the request (query-scoped, or guarded compare/role check) */
  blocking: boolean;
  expr: string;
  fn: string;
  where: 'handler' | 'callee' | 'middleware';
  guards?: { status?: number; action: 'respond' | 'throw' | 'next' };
  loc?: LocDTO;
}

export interface MiddlewareFact {
  name: string;
  kind: MiddlewareKindFact;
  order: number;
  origin: string;
  external: boolean;
  authLike: boolean;
  enforcing: boolean;
  roleGuard: boolean;
  args?: string[];
  conditional?: boolean;
  fn?: string;
  loc?: LocDTO;
}

export interface ExposureFact {
  fn: string;
  asset: string; // User.password
  assetId: string;
  model: string;
  tier: string;
  weight: number;
  via: string; // res.json …
  status?: number;
  var: string;
  select?: string[];
  confidence: string;
  routes: string[]; // routes whose handler closure contains fn
  loc?: LocDTO;
}

export interface RouteSummary {
  id: string;
  method: string;
  path: string;
  fullPath: string;
  handler?: string;
  protected: boolean;
  authEnforcement: AuthEnforcement;
  authorization: Authorization;
  exposesUserId: boolean;
  mutates: boolean;
  massAssignment: boolean;
  exposesSensitive: string[]; // ['User.password']
  models: string[];
}

export interface RouteFact extends RouteSummary {
  authMiddleware: string[];
  roleGuards: { name: string; args?: string[] }[];
  middleware: MiddlewareFact[];
  inputs: InputFact[];
  dbOps: DbOpFact[];
  /** sensitive fields of models the route touches, e.g. Order.paymentDetails */
  sensitiveFields: string[];
  exposedSensitive: ExposureFact[];
  authzEvidence: AuthzEvidence[];
  /** the handler (or a callee) verifies the JWT itself even though no auth middleware is in the chain */
  selfAuthenticated: boolean;
  mounted: boolean;
  dynamic: boolean;
  file: string;
  loc?: LocDTO;
}

export interface CallNode {
  id: string;
  kind: 'function' | 'route' | 'middleware' | 'dependency' | 'model';
  name: string;
  file?: string;
  loc?: LocDTO;
  /** for model leaves: ops performed; for dependency leaves: called symbols */
  detail?: string[];
  cycle?: boolean;
  /** direction 'out': callees; direction 'in': callers */
  calls?: CallNode[];
  truncated?: boolean;
}

export interface DataflowStep {
  from: string;
  to: string;
  via: string;
  edgeType: string;
  loc?: LocDTO;
}
export interface DataflowSink {
  model: string;
  op: string;
  fn: string;
  argSources: string[];
  queryShape?: unknown;
  select?: string[];
  loc?: LocDTO;
}
export interface DataflowFact {
  input: InputFact;
  steps: DataflowStep[];
  sinks: DataflowSink[];
}

export interface AccessFact {
  fn: string;
  op: string;
  model: string;
  argSources: string[];
  queryShape?: unknown;
  select?: string[];
  resultVar?: string;
  instance?: boolean;
  /** true when user input reaches this op's arguments */
  inputCarrying: boolean;
  reachableFromRoutes: string[];
  loc: LocDTO;
}

export interface DependencyFact {
  name: string;
  version?: string; // installed ?? range
  range?: string;
  installed?: string;
  dev?: boolean;
  declared: boolean;
  builtin: boolean;
  service?: { name: string; category: string };
  declaredIn: { pkgPath: string; range: string; installed?: string; dev: boolean }[];
  usedBy: string[]; // files importing it
  calledFrom: { fn: string; calls: { name: string; line: number }[] }[];
}

export interface AssetFact {
  id: string;
  model: string;
  field: string;
  sensitive: true;
  tier: string;
  weight: number;
  selectFalse: boolean;
  touchedByRoutes: string[];
  exposedByRoutes: string[];
}

export interface JwtUsageFact {
  fn: string;
  file: string;
  op: 'sign' | 'verify' | 'decode';
  secretSource: unknown; // {kind:'env',name} | {kind:'literal',preview,len} | {kind:'var',name} | {kind:'none'}
  algorithms?: string[];
  expiresIn?: string | null;
  flags: string[];
  line: number;
  usedByRoutes: string[];
}

export interface SecretFact {
  id: string;
  name: string;
  source: 'env' | 'code';
  kind?: string;
  preview?: string;
  len?: number;
  definedIn?: string;
  hasDefault?: boolean;
  fallbackFor?: string;
  usage?: string;
  usedBy: { node: string; via: string[] }[];
  loc?: LocDTO;
}

export interface GapFact {
  route: RouteSummary;
  reasons: ('idParamReachesDb' | 'mutatesData' | 'exposesSensitive' | 'massAssignment')[];
}

export interface RouteFilter {
  protected?: boolean;
  method?: string;
  pathPrefix?: string;
  authorization?: Authorization;
  touchesModel?: string;
  exposesSensitive?: boolean;
  mutates?: boolean;
  includeUnmounted?: boolean;
  limit?: number;
  offset?: number;
}
