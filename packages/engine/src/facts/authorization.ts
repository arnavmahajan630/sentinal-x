import type { Authorization, AuthEnforcement, AuthzEvidence } from './types';

export interface AuthzInput {
  /** an authLike, non-conditional middleware is in the chain */
  protected: boolean;
  authEnforcement: AuthEnforcement;
  /** handler/callee verifies the JWT itself */
  selfAuthenticated: boolean;
  evidence: AuthzEvidence[];
}

/**
 * none    = no login at all
 * present = a check that REALLY blocks (query scoped to the user; ownership/role check with a guard; guarded role middleware)
 * unknown = logged in, but no blocking evidence (unguarded compares, weak auth, name-only role guards, self-auth)
 */
export function deriveAuthorization(i: AuthzInput): Authorization {
  if (!i.protected) return i.selfAuthenticated ? 'unknown' : 'none';
  if (i.authEnforcement === 'weak') return 'unknown'; // auth not enforced → checks can't be trusted
  return i.evidence.some((e) => e.blocking) ? 'present' : 'unknown';
}

/** a signal blocks when it is a scoped query, or a compare/role-check whose failure ends the request */
export function isBlocking(kind: AuthzEvidence['kind'], guards?: AuthzEvidence['guards']): boolean {
  if (kind === 'user-scoped-query') return true;
  if (kind === 'role-guard-middleware') return false; // name-only; real signals are reported as role-check
  return !!guards;
}
