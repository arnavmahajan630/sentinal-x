import { describe, expect, it } from 'vitest';
import { nodeId, edgeId, parseNodeId } from '../../src/graph/ids';
import { isFieldExposed, isIdLikePath, judgeMiddleware } from '../../src/graph/policy';
import { classifyField } from '../../src/graph/sensitivity';
import { serviceFor } from '../../src/graph/services';
import type { FnTraits } from '../../src/indexer/types';

const T = (o: Partial<FnTraits>): FnTraits => ({
  readsAuthHeader: false,
  callsJwtVerify: false,
  setsReqUser: false,
  sendsAuthError: false,
  callsNext: false,
  usesReqRes: true,
  ...o,
});

describe('ids', () => {
  it('round-trip', () => {
    expect(nodeId('Route', 'GET /a:b')).toBe('Route:GET /a:b');
    expect(parseNodeId('Route:GET /a:b')).toEqual({ type: 'Route', key: 'GET /a:b' });
    expect(edgeId('CALLS', 'A:1', 'B:2')).toBe('CALLS|A:1|B:2');
  });
});

describe('judgeMiddleware', () => {
  it('credential-checking middleware that rejects = auth + enforcing', () => {
    expect(
      judgeMiddleware({
        name: 'authenticate',
        external: false,
        traits: T({ callsJwtVerify: true, sendsAuthError: true }),
      }),
    ).toMatchObject({ authLike: true, enforcing: true, kind: 'auth' });
  });
  it('optionalAuth (verifies token but never rejects) = auth-like but weak', () => {
    expect(
      judgeMiddleware({
        name: 'optionalAuth',
        external: false,
        traits: T({ callsJwtVerify: true, setsReqUser: true }),
      }),
    ).toMatchObject({ authLike: true, enforcing: false, kind: 'auth' });
  });
  it('name-only strong auth name without traits is auth-like but not enforcing', () => {
    expect(judgeMiddleware({ name: 'requireAuth', external: false })).toMatchObject({
      authLike: true,
      enforcing: false,
    });
  });
  it('a middleware merely NAMED "auth"-ish but doing nothing auth-related is not auth-like when name is weak', () => {
    expect(judgeMiddleware({ name: 'authorLogger', external: false, traits: T({}) }).authLike).toBe(
      false,
    );
  });
  it('role guards, validation, known external libs', () => {
    expect(
      judgeMiddleware({
        name: 'requireRole',
        external: false,
        authz: [{ fnId: 'x', kind: 'role-check', expr: '', loc: { file: 'f', line: 1, col: 1 } }],
      }),
    ).toMatchObject({ kind: 'role', roleGuard: true, authLike: false });
    expect(judgeMiddleware({ name: 'authorize', external: false })).toMatchObject({
      kind: 'role',
      authLike: false,
    });
    expect(judgeMiddleware({ name: 'validateBody', external: false })).toMatchObject({
      kind: 'validation',
    });
    expect(
      judgeMiddleware({
        name: 'passport.authenticate',
        external: true,
        factory: "passport.authenticate('jwt')",
      }),
    ).toMatchObject({ authLike: true, enforcing: true });
    expect(judgeMiddleware({ name: 'cors', external: true })).toMatchObject({
      authLike: false,
      kind: 'other',
    });
    expect(judgeMiddleware({ name: 'auth', external: true })).toMatchObject({ authLike: false }); // unknown external named auth: no evidence
  });
});

describe('sensitivity', () => {
  it.each([
    ['User', 'password', 'credential'],
    ['User', 'passwordHash', 'credential'],
    ['User', 'refresh_token', 'credential'],
    ['User', 'apiKey', 'credential'],
    ['Order', 'paymentDetails', 'financial'],
    ['Order', 'paymentDetails.cvv', 'financial'],
    ['Card', 'cardNumber', 'financial'],
    ['User', 'email', 'pii'],
    ['Order', 'customerId', 'pii'],
    ['User', 'ssn', 'pii'],
    ['User', 'lastName', 'pii-broad'],
    ['User', 'name', 'pii-broad'],
    ['Customer', 'ipAddress', 'pii-broad'],
  ])('%s.%s → %s', (model, field, tier) => {
    expect(classifyField(model, field)?.tier).toBe(tier);
  });
  it.each([
    ['Product', 'name'],
    ['Order', 'total'],
    ['User', 'username'],
    ['Post', 'title'],
    ['Order', 'items.sku'],
  ])('%s.%s is not sensitive', (model, field) => {
    expect(classifyField(model, field)).toBeNull();
  });
});

describe('services table', () => {
  it('maps packages (incl. scopes) to services', () => {
    expect(serviceFor('nodemailer')?.name).toBe('Nodemailer');
    expect(serviceFor('@aws-sdk/client-s3')?.name).toBe('AWS');
    expect(serviceFor('openai')).toMatchObject({ name: 'OpenAI', category: 'ai' });
    expect(serviceFor('axios')?.name).toBe('HTTP Client');
    expect(serviceFor('express')).toBeNull();
    expect(serviceFor('requests-not-a-pkg')).toBeNull();
  });
});

describe('isIdLikePath / isFieldExposed', () => {
  it('id-like paths', () => {
    for (const p of ['id', '_id', 'orderId', 'user_id', 'user', 'owner', 'a.b.userId'])
      expect(isIdLikePath(p)).toBe(true);
    for (const p of ['name', 'email', 'idea', 'body']) expect(isIdLikePath(p)).toBe(false);
  });
  it('select rules', () => {
    expect(isFieldExposed('password', undefined, false)).toBe(true);
    expect(isFieldExposed('password', ['-password'], false)).toBe(false);
    expect(isFieldExposed('paymentDetails.cvv', ['-paymentDetails'], false)).toBe(false);
    expect(isFieldExposed('apiKey', undefined, true)).toBe(false);
    expect(isFieldExposed('apiKey', ['+apiKey'], true)).toBe(true);
    expect(isFieldExposed('email', ['email', 'name'], false)).toBe(true);
    expect(isFieldExposed('password', ['email', 'name'], false)).toBe(false);
    expect(isFieldExposed('paymentDetails.cvv', ['paymentDetails'], false)).toBe(true);
  });
});
