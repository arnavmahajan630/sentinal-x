import { describe, expect, it } from 'vitest';
import { deriveAuthorization, isBlocking } from '../../src/facts/authorization';
import type { AuthzEvidence } from '../../src/facts/types';

const ev = (kind: AuthzEvidence['kind'], blocking: boolean): AuthzEvidence => ({
  kind,
  blocking,
  expr: 'x',
  fn: 'f#g',
  where: 'handler',
});
const base = {
  protected: true,
  authEnforcement: 'enforcing' as const,
  selfAuthenticated: false,
  evidence: [] as AuthzEvidence[],
};

describe('deriveAuthorization', () => {
  it.each([
    ['no auth at all', { ...base, protected: false, authEnforcement: 'none' as const }, 'none'],
    [
      'no auth chain but handler verifies JWT itself',
      { ...base, protected: false, authEnforcement: 'none' as const, selfAuthenticated: true },
      'unknown',
    ],
    ['logged in, no evidence (the IDOR shape)', base, 'unknown'],
    [
      'logged in + blocking ownership check',
      { ...base, evidence: [ev('ownership-compare', true)] },
      'present',
    ],
    [
      'logged in + user-scoped query',
      { ...base, evidence: [ev('user-scoped-query', true)] },
      'present',
    ],
    ['logged in + blocking role check', { ...base, evidence: [ev('role-check', true)] }, 'present'],
    [
      'non-blocking compare only (e.g. logging)',
      { ...base, evidence: [ev('ownership-compare', false)] },
      'unknown',
    ],
    [
      'name-only role guard middleware',
      { ...base, evidence: [ev('role-guard-middleware', false)] },
      'unknown',
    ],
    [
      'weak auth caps at unknown even with evidence',
      { ...base, authEnforcement: 'weak' as const, evidence: [ev('ownership-compare', true)] },
      'unknown',
    ],
  ])('%s → %s', (_n, input, want) => {
    expect(deriveAuthorization(input)).toBe(want);
  });

  it('isBlocking: needs a guard, except scoped queries', () => {
    expect(isBlocking('user-scoped-query')).toBe(true);
    expect(isBlocking('ownership-compare')).toBe(false);
    expect(isBlocking('ownership-compare', { status: 403, action: 'respond' })).toBe(true);
    expect(isBlocking('role-check', { action: 'throw' })).toBe(true);
    expect(isBlocking('role-guard-middleware', { action: 'throw' })).toBe(false);
  });
});
