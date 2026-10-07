/**
 * Verifier templates that playbooks may name. C7/C8 own the implementations (in
 * `verification/templates/`); this list is the contract.
 *  implemented = a real template exists in verification/templates/
 * `jwt-security` / `secret-exposure` intentionally use NO template until the finding policy
 * for non-exploitable classes is decided (still open — see C7's plan).
 */
export const VERIFIER_TEMPLATES = {
  idor: 'implemented',
  'missing-auth': 'implemented',
  bfla: 'implemented',
  'nosql-injection': 'implemented',
  'mass-assignment': 'implemented',
  'data-exposure': 'implemented',
} as const;
export type VerifierTemplateName = keyof typeof VERIFIER_TEMPLATES;
export const isVerifierTemplate = (n: string): n is VerifierTemplateName => n in VERIFIER_TEMPLATES;
