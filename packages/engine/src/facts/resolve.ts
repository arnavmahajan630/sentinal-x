import type { Node } from '../graph/types';
import { FactError } from './errors';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ALL', 'OPTIONS', 'HEAD']);

const stem = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);

function lev(a: string, b: string): number {
  const dp = Array.from(
    { length: a.length + 1 },
    (_, i) => [i, ...Array(b.length).fill(0)] as number[],
  );
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/** closest candidates (stemmed token overlap, substring, edit distance), for `not_found` suggestions */
export function suggest(input: string, candidates: string[], n = 5): string[] {
  const t = new Set(tokens(input));
  const low = input.toLowerCase();
  return candidates
    .map((c) => {
      const ct = tokens(c);
      const overlap = ct.filter((x) => t.has(x)).length;
      const jac = overlap / Math.max(1, new Set([...ct, ...t]).size);
      const sub = c.toLowerCase().includes(low) || low.includes(c.toLowerCase()) ? 0.5 : 0;
      const l = c.toLowerCase();
      const sim = 1 - lev(low, l) / Math.max(low.length, l.length);
      return { c, score: Math.max(jac + sub, sim > 0.6 ? sim : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.c < b.c ? -1 : 1))
    .slice(0, n)
    .map((x) => x.c);
}

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
