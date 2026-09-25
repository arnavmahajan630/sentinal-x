import { createHash } from 'node:crypto';

/** JSON with sorted object keys → stable across insertion order */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      );
    }
    return val;
  });
}

export const hashOf = (v: unknown): string =>
  createHash('sha1').update(stableStringify(v)).digest('hex');
