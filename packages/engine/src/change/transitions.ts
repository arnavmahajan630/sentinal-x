import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Config } from '../config';
import { models } from '../db/collections';
import { bus, EVENTS_CHANNEL } from '../bus';
import type { Finding } from '../findings/model';
import { verify } from '../verification/engine';
import type { VerificationRun } from '../verification/engine';
import type { VerificationRequest } from '../agents/runtime/types';
import type { FindingTransition } from './types';

export interface TransitionFindingsOptions {
  verifier?: (finding: Finding) => Promise<VerificationRun>;
  enableVerification?: boolean;
  candidateFindings?: Finding[];
}

/**
 * Determine whether a finding's affected nodes intersect with the set of changed/impacted nodes or files.
 */
export function isFindingAffected(finding: Finding, affectedNodeIds: Set<string>): boolean {
  for (const node of finding.affectedNodes) {
    if (affectedNodeIds.has(node)) return true;
    // Check if node starts with File: and matches
    if (node.startsWith('File:') && affectedNodeIds.has(node.slice(5))) return true;
  }
  return false;
}

/**
 * Build a VerificationRequest from an existing Finding.
 */
export async function buildVerificationRequestFromFinding(
  finding: Finding,
): Promise<VerificationRequest> {
  let template = finding.type;
  let hypothesisId = finding.agentRun;

  if (mongoose.connection.readyState === 1 && finding.verificationResult?.runId) {
    try {
      const prevRun = await models.verification_runs
        .findOne({ id: finding.verificationResult.runId })
        .lean();
      if (prevRun) {
        template = (prevRun as any).template ?? template;
        hypothesisId = (prevRun as any).hypothesisId ?? hypothesisId;
      }
    } catch {
      // Fallback
    }
  }

  // Derive route from affectedNodes
  const routeNode = finding.affectedNodes.find((n) => n.startsWith('Route:'));
  const routeStr = routeNode ? routeNode.slice(6) : '';

  return {
    id: randomUUID(),
    runId: `reverify-${randomUUID().slice(0, 8)}`,
    hypothesisId,
    template,
    subject: { kind: 'route', route: routeStr },
    affectedNodes: finding.affectedNodes,
    requestedAt: new Date().toISOString(),
  };
}

/**
 * Transition finding statuses across code changes.
 * For each finding whose `affectedNodes` intersect the change:
 * - CONFIRMED again → stays `open` (or if was `resolved`, transitions to `regressed`)
 * - REJECTED (fix worked) → transitions to `resolved`
 * - previously `resolved` and CONFIRMED again → `regressed`
 */
export async function transitionFindings(
  cfg: Config,
  projectId: string,
  affectedNodeIds: string[],
  options: TransitionFindingsOptions = {},
): Promise<FindingTransition[]> {
  const affectedSet = new Set(affectedNodeIds);
  const transitions: FindingTransition[] = [];

  let candidateFindings: Finding[] = options.candidateFindings ?? [];

  if (!options.candidateFindings && mongoose.connection.readyState === 1) {
    try {
      const docs = await models.findings
        .find({
          projectId,
          status: { $in: ['open', 'resolved', 'regressed'] },
        })
        .lean();
      candidateFindings = docs as unknown as Finding[];
    } catch {
      candidateFindings = [];
    }
  }

  for (const finding of candidateFindings) {
    if (!isFindingAffected(finding, affectedSet)) {
      continue;
    }

    let run: VerificationRun;
    if (options.verifier) {
      run = await options.verifier(finding);
    } else {
      const req = await buildVerificationRequestFromFinding(finding);
      run = await verify(cfg, projectId, req);
    }

    const fromStatus = finding.status;
    let toStatus = fromStatus;
    let reason = '';

    if (run.result === 'CONFIRMED') {
      if (fromStatus === 'resolved') {
        toStatus = 'regressed';
        reason = 'Previously resolved vulnerability was re-introduced and confirmed in sandbox.';
      } else {
        toStatus = 'open';
        reason = 'Vulnerability re-confirmed by exploit in sandbox; remains open.';
      }
    } else if (run.result === 'REJECTED') {
      if (fromStatus === 'open' || fromStatus === 'regressed') {
        toStatus = 'resolved';
        reason = 'Exploit rejected in sandbox after code change; vulnerability resolved.';
      } else {
        toStatus = 'resolved';
        reason = 'Exploit remains rejected in sandbox; fix verified.';
      }
    } else {
      // INCONCLUSIVE
      reason = 'Re-verification inconclusive; status retained.';
    }

    const statusChanged = toStatus !== fromStatus;

    if (statusChanged && mongoose.connection.readyState === 1) {
      await models.findings.updateOne(
        { id: finding.id },
        {
          $set: {
            status: toStatus,
            evidence: run.evidence,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      await models.security_events.create({
        projectId,
        ts: new Date(),
        type: `finding.${toStatus}`,
        summary: `Finding ${finding.type} (${finding.id}) transitioned: ${fromStatus} → ${toStatus} (${reason})`,
        findingId: finding.id,
      });

      bus.publish(EVENTS_CHANNEL, {
        kind: 'finding.status_changed',
        projectId,
        findingId: finding.id,
        type: finding.type,
        fromStatus,
        toStatus,
        reason,
        runId: run.id,
      });
    }

    transitions.push({
      findingId: finding.id,
      type: finding.type,
      fromStatus,
      toStatus,
      reason,
      verificationRunId: run.id,
      verificationResult: run.result,
      evidence: run.evidence,
      timestamp: new Date().toISOString(),
    });
  }

  return transitions;
}
