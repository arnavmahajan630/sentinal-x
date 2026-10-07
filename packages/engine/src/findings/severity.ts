import { SEVERITIES, SEVERITY_RANK } from '../knowledge/types';
import type { Severity } from '../knowledge/types';
import { TIER_WEIGHT } from '../graph/sensitivity';

export interface SeverityInput {
  /** playbook.severityBase for the hypothesis's type */
  base: Severity;
  /** max Asset-node weight among affectedNodes (0 if none) */
  assetWeight: number;
  /** the subject route's `protected` flag (true for non-route subjects — no escalation) */
  routeProtected: boolean;
}

/**
 * Only CONFIRMED verification runs ever reach this function, so verification status is
 * not a parameter here — it's implicit. Escalates `base` by one rank when the exploit
 * touches a financial-or-above-tier asset, or when the route itself required no
 * authentication at all (strictly worse than authenticated-but-unauthorized). Never
 * escalates past `critical`, never below `base`.
 */
export function computeSeverity(input: SeverityInput): Severity {
  let rank = SEVERITY_RANK[input.base];
  const maxRank = SEVERITY_RANK.critical;
  if (input.assetWeight >= TIER_WEIGHT.financial) rank += 1;
  if (!input.routeProtected) rank += 1;
  rank = Math.min(rank, maxRank);
  return SEVERITIES.find((s) => SEVERITY_RANK[s] === rank) ?? input.base;
}
