import { describe, expect, it } from 'vitest';
import { resolveByName, resolveFn, resolveRoute, suggest } from '../../src/facts/resolve';
import type { Node } from '../../src/graph/types';

const n = (type: any, key: string, props: any = {}): Node => ({
  id: `${type}:${key}`,
  projectId: 'p',
  type,
  key,
  props,
});
const routes = [
  n('Route', 'GET /a/:id', { fullPath: '/a/:id' }),
  n('Route', 'PUT /a/:id', { fullPath: '/a/:id' }),
  n('Route', 'GET /b', { fullPath: '/b' }),
  n('Route', 'GET /b#2', { fullPath: '/b' }),
];

describe('resolve', () => {
  it('routes: exact, node-id form, case, whitespace, dup suffix', () => {
    expect(resolveRoute(routes, 'get   /a/:id').key).toBe('GET /a/:id');
    expect(resolveRoute(routes, 'Route:PUT /a/:id').key).toBe('PUT /a/:id');
    expect(resolveRoute(routes, 'GET /b').key).toBe('GET /b'); // exact wins over '#2'
  });
  it('bare path: ambiguous lists candidates; unknown suggests closest', () => {
    expect(() => resolveRoute(routes, '/a/:id')).toThrowError(
      expect.objectContaining({ code: 'ambiguous', suggestions: ['GET /a/:id', 'PUT /a/:id'] }),
    );
    expect(() => resolveRoute(routes, 'GET /a/:idd')).toThrowError(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
  it('functions: full key, node id, unique bare name, ambiguous name', () => {
    const fns = [
      n('Function', 'x.js#foo', { name: 'foo' }),
      n('Function', 'y.js#foo', { name: 'foo' }),
      n('Function', 'y.js#bar', { name: 'bar' }),
    ];
    expect(resolveFn(fns, 'y.js#bar').key).toBe('y.js#bar');
    expect(resolveFn(fns, 'Function:x.js#foo').key).toBe('x.js#foo');
    expect(resolveFn(fns, 'bar').key).toBe('y.js#bar');
    expect(() => resolveFn(fns, 'foo')).toThrowError(
      expect.objectContaining({ code: 'ambiguous' }),
    );
  });
  it('by name is case-insensitive', () => {
    expect(resolveByName('model', [n('Model', 'Order')], 'order', 'Model').key).toBe('Order');
    expect(() => resolveByName('model', [n('Model', 'Order')], 'nope', 'Model')).toThrowError(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
  it('suggest ranks by token overlap', () => {
    expect(
      suggest('GET /api/order/:id', ['POST /x', 'GET /api/orders/:id', 'GET /api/users/:id'])[0],
    ).toBe('GET /api/orders/:id'); // 'order' ~ 'orders' (stemmed)
  });
});
