import type { Node } from '../graph/types';
import { suggest } from '../tools/suggest';
import { FactError } from './errors';

export { suggest };

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ALL', 'OPTIONS', 'HEAD']);

function pick(kind: string, input: string, keys: string[], matches: Node[]): Node {
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1)
    throw new FactError(
      'ambiguous',
      `${kind} "${input}" is ambiguous`,
      matches.map((m) => m.key).slice(0, 10),
    );
  throw new FactError('not_found', `No ${kind} "${input}"`, suggest(input, keys));
}

/** `PUT /api/orders/:id` | `Route:PUT …` | `put /api/orders/:id` | bare `/api/orders/:id` (if unique) */
export function resolveRoute(routes: Node[], raw: string): Node {
  const input = raw
    .trim()
    .replace(/^Route:/, '')
    .replace(/\s+/g, ' ');
  const keys = routes.map((r) => r.key);
  const [first, ...rest] = input.split(' ');
  if (rest.length && METHODS.has(first!.toUpperCase())) {
    const want = `${first!.toUpperCase()} ${rest.join(' ')}`;
    const exact = routes.filter((r) => r.key === want);
    return pick(
      'route',
      raw,
      keys,
      exact.length ? exact : routes.filter((r) => r.key.replace(/#\d+$/, '') === want),
    );
  }
  const p = input.startsWith('/') ? input : `/${input}`;
  return pick(
    'route',
    raw,
    keys,
    routes.filter((r) => r.props.fullPath === p),
  );
}

/** `server/x.js#name` | `Function:…` | bare `name` if unique */
export function resolveFn(fns: Node[], raw: string): Node {
  const input = raw.trim().replace(/^(Function|Middleware):/, '');
  const keys = fns.map((f) => f.key);
  const exact = fns.filter((f) => f.key === input);
  if (exact.length) return pick('function', raw, keys, exact);
  if (!input.includes('#'))
    return pick(
      'function',
      raw,
      keys,
      fns.filter((f) => f.props.name === input),
    );
  return pick('function', raw, keys, []);
}

export function resolveByName(kind: string, nodes: Node[], raw: string, prefix: string): Node {
  const input = raw.trim().replace(new RegExp(`^${prefix}:`), '');
  const keys = nodes.map((n) => n.key);
  return pick(
    kind,
    raw,
    keys,
    nodes.filter((n) => n.key.toLowerCase() === input.toLowerCase()),
  );
}
