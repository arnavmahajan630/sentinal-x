import type { FactEngine } from '../facts/engine';
import { isWriteOp } from '../facts/engine';
import type { JwtUsageFact, RouteFact, SecretFact } from '../facts/types';

export type SignalSource = 'route' | 'jwt' | 'secret';

/** Fixed vocabulary that links C3 facts to playbooks. Every signal is documented and used by ≥1 playbook. */
export const SIGNAL_CATALOG: Record<
  string,
  { source: SignalSource; description: string; informational?: boolean }
> = {
  'authorization:none': {
    source: 'route',
    description: 'No login required and no inline auth (route.authorization = none).',
  },
  'authorization:unknown': {
    source: 'route',
    description:
      'Logged in but no blocking authorization check found (route.authorization = unknown).',
  },
  'authorization:present': {
    source: 'route',
    informational: true,
    description: 'A blocking authorization check exists (route.authorization = present).',
  },
  unprotected: {
    source: 'route',
    informational: true,
    description: 'No authLike middleware in the chain (route.protected = false).',
  },
  'auth-weak': {
    source: 'route',
    description:
      'Auth middleware present but never rejects (authEnforcement = weak, e.g. optional auth).',
  },
  'user-controlled-id-flows-to-model-read': {
    source: 'route',
    description:
      'An id-like input (params/query/body) reaches a model operation in the handler (route.exposesUserId).',
  },
  'writes-data': {
    source: 'route',
    informational: true,
    description: 'The handler closure performs a write (create/update/delete/save/new).',
  },
  'mass-assignment': {
    source: 'route',
    description: 'The whole req.body is passed into create/update/new (route.massAssignment).',
  },
  'exposes-sensitive': {
    source: 'route',
    description: 'The handler returns fields classified sensitive (any tier).',
  },
  'exposes-credential': {
    source: 'route',
    description: 'The handler returns credential-tier fields (password/token/apiKey…).',
  },
  'query-built-from-input-object': {
    source: 'route',
    description:
      'A read/update/delete filter object is built from req.body/req.query values (operator-injection surface).',
  },
  'unprotected-touches-data': {
    source: 'route',
    description: 'A route with no auth middleware operates on a database model.',
  },
  'privileged-path-without-role-check': {
    source: 'route',
    description:
      'Path looks privileged (admin/staff/manager/internal…) but no role guard or role check was found.',
  },
  'jwt:hardcoded-secret': {
    source: 'jwt',
    description: 'A JWT is signed/verified with a secret literal in code.',
  },
  'jwt:literal-fallback': {
    source: 'jwt',
    description: 'JWT secret comes from env but falls back to a literal (`process.env.X || "…"`).',
  },
  'jwt:algorithm-none': { source: 'jwt', description: "JWT options allow algorithm 'none'." },
  'jwt:ignore-expiration': {
    source: 'jwt',
    description: 'jwt.verify is called with ignoreExpiration.',
  },
  'jwt:no-expiry': { source: 'jwt', description: 'jwt.sign issues tokens without expiresIn.' },
  'jwt:decode-only': {
    source: 'jwt',
    description: 'jwt.decode is used (no signature verification).',
  },
  'secret:hardcoded': {
    source: 'secret',
    description: 'A hardcoded secret/token/key literal exists in code.',
  },
  'secret:connection-string-credentials': {
    source: 'secret',
    description: 'A connection string with embedded credentials (code or env file).',
  },
  'secret:env-file-committed': {
    source: 'secret',
    description:
      'A non-example .env file with secrets is present in the repository tree (not gitignored).',
  },
};

const PRIVILEGED_PATH =
  /(^|\/)(admin|administrator|staff|manager|internal|superuser|root|backoffice)(\/|$)/i;
const NON_FILTER_OPS = /^(create|insertMany|insertOne|new)$/;

function inputFromBodyOrQuery(shape: any, depth = 0): boolean {
  if (!shape || depth > 2) return false;
  if (shape.kind === 'input') return shape.source === 'body' || shape.source === 'query';
  if (shape.kind === 'object')
    return Object.values<any>(shape.keys ?? {}).some((v) => inputFromBodyOrQuery(v, depth + 1));
  if (shape.kind === 'spread') return inputFromBodyOrQuery(shape.of, depth + 1);
  return false;
}

export function signalsFromRoute(r: RouteFact): string[] {
  const s = new Set<string>();
  s.add(`authorization:${r.authorization}`);
  if (!r.protected) s.add('unprotected');
  if (r.authEnforcement === 'weak') s.add('auth-weak');
  if (r.exposesUserId) s.add('user-controlled-id-flows-to-model-read');
  if (r.dbOps.some((o) => isWriteOp(o.op))) s.add('writes-data');
  if (r.massAssignment) s.add('mass-assignment');
  if (r.exposesSensitive.length) s.add('exposes-sensitive');
  if (r.exposedSensitive.some((e) => e.tier === 'credential')) s.add('exposes-credential');
  if (r.dbOps.some((o) => !NON_FILTER_OPS.test(o.op) && inputFromBodyOrQuery(o.queryShape)))
    s.add('query-built-from-input-object');
  if (!r.protected && r.models.length > 0) s.add('unprotected-touches-data');
  if (
    PRIVILEGED_PATH.test(r.fullPath) &&
    r.roleGuards.length === 0 &&
    !r.authzEvidence.some((e) => e.kind === 'role-check')
  ) {
    s.add('privileged-path-without-role-check');
  }
  return [...s].sort();
}

export function signalsFromJwtUsage(u: JwtUsageFact): string[] {
  const s = new Set<string>();
  const f = new Set(u.flags);
  if (f.has('hardcoded-secret')) s.add('jwt:hardcoded-secret');
  if (f.has('literal-fallback')) s.add('jwt:literal-fallback');
  if (f.has('algorithm-none')) s.add('jwt:algorithm-none');
  if (f.has('ignoreExpiration')) s.add('jwt:ignore-expiration');
  if (f.has('decode-only')) s.add('jwt:decode-only');
  if (u.op === 'sign' && u.expiresIn === null) s.add('jwt:no-expiry');
  return [...s].sort();
}

export function signalsFromSecrets(secrets: SecretFact[]): string[] {
  const s = new Set<string>();
  for (const x of secrets) {
    if (x.source === 'code' && (x.kind === 'hardcoded-secret' || x.kind === 'known-token'))
      s.add('secret:hardcoded');
    if (
      x.kind === 'connection-string' ||
      (x.source === 'env' && x.definedIn && /(uri|url|dsn|connection)/i.test(x.name))
    )
      s.add('secret:connection-string-credentials');
    if (x.source === 'env' && x.definedIn) s.add('secret:env-file-committed');
  }
  return [...s].sort();
}

export interface ProjectSignals {
  /** route id → signals */
  routes: Record<string, string[]>;
  jwt: { fn: string; op: string; line: number; signals: string[] }[];
  secrets: string[];
  /** union of everything (what a project-wide `getPlaybooksForSignals` would use) */
  all: string[];
}

/** run the signal rules over every mounted route + jwt usage + secrets of a project */
export async function collectSignals(engine: FactEngine): Promise<ProjectSignals> {
  const routes: Record<string, string[]> = {};
  let offset = 0;
  for (;;) {
    const page = await engine.getRoutes({ limit: 200, offset });
    for (const summary of page.items)
      routes[summary.id] = signalsFromRoute(await engine.getRoute(summary.id));
    offset += page.items.length;
    if (!page.truncated || !page.items.length) break;
  }
  const jwt = (await engine.getJwtUsage()).map((u) => ({
    fn: u.fn,
    op: u.op,
    line: u.line,
    signals: signalsFromJwtUsage(u),
  }));
  const secrets = signalsFromSecrets(await engine.getSecrets());
  const all = [
    ...new Set([...Object.values(routes).flat(), ...jwt.flatMap((j) => j.signals), ...secrets]),
  ].sort();
  return { routes, jwt, secrets, all };
}
