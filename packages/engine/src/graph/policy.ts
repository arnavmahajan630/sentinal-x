import type { AuthzIR, FnTraits } from '../indexer/types';
import type { MiddlewareKind } from './types';

export interface MiddlewareEvidence {
  name: string;
  external: boolean;
  /** factory text for `requireRole('admin')` / `passport.authenticate('jwt')` */
  factory?: string;
  /** traits unioned over the fn and its nested fns (factory-returned middleware) */
  traits?: FnTraits;
  authz?: AuthzIR[];
}
export interface MiddlewarePolicy {
  authLike: boolean;
  enforcing: boolean;
  roleGuard: boolean;
  kind: MiddlewareKind;
  reason: string;
}

// strong authentication names. `authorize` is deliberately NOT here (usually a role guard).
const AUTH_NAME_RE =
  /^(auth|authenticate|authenticated|authmiddleware|authguard|protect|protected|requireauth\w*|requirelogin|requireuser|isauth\w*|isloggedin|ensureauth\w*|ensureloggedin|checkauth\w*|verifytoken|verifyjwt|verifyuser|validatetoken|jwtauth\w*|withauth|loginrequired)$/i;
const ROLE_NAME_RE =
  /(role|permission|admin|authorize|allow|guard|acl|rbac|scope|ownership|owner)/i;
const VALIDATION_NAME_RE = /(valid|schema|joi|zod|celebrate|sanitiz|yup)/i;
/** known external auth middleware (enforcing by design) */
const KNOWN_AUTH_LIB_RE =
  /^(passport\.(authenticate|session)|expressjwt|jwt|checkjwt|jwtcheck|clerkmiddleware|clerkexpress\w*|requiresauth|withauth|auth0\w*|firebaseauth\w*)$/i;

const stripArgs = (s: string) => s.replace(/\(.*$/s, '');
const leaf = (s: string) => stripArgs(s).split('.').pop() ?? s;

export function judgeMiddleware(e: MiddlewareEvidence): MiddlewarePolicy {
  const name = leaf(e.name);
  const full = stripArgs(e.factory ?? e.name);
  const t = e.traits;
  const traitAuth = !!t && (t.callsJwtVerify || (t.readsAuthHeader && t.setsReqUser));
  const knownLib = e.external && KNOWN_AUTH_LIB_RE.test(full);
  const nameAuth = AUTH_NAME_RE.test(name);
  const authLike = traitAuth || knownLib || (nameAuth && !e.external);
  const enforcing = knownLib || (authLike && !!t?.sendsAuthError);
  const roleSignals = (e.authz ?? []).some((a) => a.kind === 'role-check');
  const roleGuard = roleSignals || (!authLike && ROLE_NAME_RE.test(name) && !e.external);

  let kind: MiddlewareKind = 'other';
  let reason = 'other';
  if (authLike) {
    kind = 'auth';
    reason = traitAuth ? 'traits' : knownLib ? 'library' : 'name';
  } else if (roleGuard) {
    kind = 'role';
    reason = roleSignals ? 'role-check' : 'name';
  } else if (
    VALIDATION_NAME_RE.test(name) ||
    /^(body|check|param|query|validationResult)$/.test(name)
  ) {
    kind = 'validation';
    reason = 'name';
  }
  return { authLike, enforcing, roleGuard, kind, reason };
}

/** id-like input path: `id`, `_id`, `orderId`, `user_id`, `user`, `owner`, `account`, `uid` (last segment) */
const ID_LIKE_RE = /(^|\.)(_?id|ids|\w+Id|\w+_id|user|owner|account|uid)$/i;
export const isIdLikePath = (path: string): boolean => ID_LIKE_RE.test(path);

/** which of an asset's `select`-rules make it visible in a response? (`select` from `.select()`/projection) */
export function isFieldExposed(
  field: string,
  select: string[] | undefined,
  fieldSelectFalse: boolean,
): boolean {
  const sel = select ?? [];
  const under = (rule: string) => field === rule || field.startsWith(rule + '.');
  const covers = (rule: string) => under(rule) || rule.startsWith(field + '.'); // child selected ⇒ parent partly visible
  const minus = sel.filter((s) => s.startsWith('-')).map((s) => s.slice(1));
  const plus = sel.filter((s) => s.startsWith('+')).map((s) => s.slice(1));
  const include = sel.filter((s) => !s.startsWith('-') && !s.startsWith('+'));
  if (minus.some(under)) return false;
  if (include.length) return include.some(covers) || plus.some(covers);
  if (fieldSelectFalse) return plus.some(covers);
  return true;
}
