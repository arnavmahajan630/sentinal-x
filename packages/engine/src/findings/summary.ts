import { models } from '../db/collections';
import { SEVERITIES } from '../knowledge/types';
import type { Severity } from '../knowledge/types';

export interface OpenFindingsSummary {
  projectId: string;
  open: number;
  resolved: number;
  regressed: number;
  bySeverity: Record<Severity, number>;
}

/**
 * Single source of truth for "how many open findings, by severity" — used by both
 * `/api/overview` and the scheduler's idle heartbeat so the two counts can never drift.
 */
export async function summarizeOpenFindings(projectId: string): Promise<OpenFindingsSummary> {
  const findings = await models.findings.find({ projectId }).lean<
    { severity: Severity; status: string }[]
  >();

  const bySeverity = Object.fromEntries(
    SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s && f.status === 'open').length]),
  ) as Record<Severity, number>;

  return {
    projectId,
    open: findings.filter((f) => f.status === 'open').length,
    resolved: findings.filter((f) => f.status === 'resolved').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    bySeverity,
  };
}
