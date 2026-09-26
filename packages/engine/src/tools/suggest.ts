// Shared by facts + knowledge tool layers: nearest-name suggestions for not_found errors.
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
