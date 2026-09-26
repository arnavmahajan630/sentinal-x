/**
 * Verifier templates that playbooks may name. C7 owns the implementations; this list is the contract.
 *  planned  = in the C7 plan (MVP set)
 *  proposed = new in C4; provable by a dynamic sandbox check; C7 must implement or rename
 * `jwt-security` / `secret-exposure` intentionally use NO template until the C7 finding policy is decided.
 */
export const VERIFIER_TEMPLATES = {
  idor: 'planned',
  'missing-auth': 'planned',
  bfla: 'planned',
  'nosql-injection': 'planned',
  'mass-assignment': 'proposed',
  'data-exposure': 'proposed',
} as const;
export type VerifierTemplateName = keyof typeof VERIFIER_TEMPLATES;
export const isVerifierTemplate = (n: string): n is VerifierTemplateName => n in VERIFIER_TEMPLATES;
