import mongoose from 'mongoose';
import type { Config } from '../config';
import { models } from '../db/collections';
import type { FactEngine } from '../facts/engine';
import type {
  Hypothesis,
  HypothesisSubject,
  InvestigationRequest,
  VerificationRequest,
} from '../agents/runtime/types';
import type { Finding } from '../findings/model';
import { verify } from '../verification/engine';
import type { VerificationRun } from '../verification/engine';
import { buildFinding } from '../findings/build';

/** Helper to convert a HypothesisSubject into a stable string key for deduplication */
export function subjectKey(subject: HypothesisSubject): string {
  switch (subject.kind) {
    case 'route':
      return `route:${subject.route}`;
    case 'jwt':
      return `jwt:${subject.fn}:${subject.line ?? ''}`;
    case 'secret':
      return `secret:${subject.id}`;
    case 'chain':
      return `chain:${[...subject.findingIds].sort().join(',')}`;
    default:
      return JSON.stringify(subject);
  }
}

/** Deterministic deduplication key for a verification request */
export function verificationKey(req: VerificationRequest): string {
  return `${req.template}::${req.subject.kind}::${subjectKey(req.subject)}`;
}

export interface VerificationDrainResult {
  runs: VerificationRun[];
  findings: Finding[];
}

/**
 * Deduplicates and executes verification requests against the sandbox.
 * Confirmed runs are turned into Findings with idempotency checks against existing open findings.
 */
export async function drainVerificationRequests(
  cfg: Config,
  projectId: string,
  engine: FactEngine,
  hypotheses: Hypothesis[],
  options: { enableVerification?: boolean } = {},
): Promise<VerificationDrainResult> {
  const isEnabled = options.enableVerification ?? cfg.sandbox.verificationEnabled;
  const runs: VerificationRun[] = [];
  const findings: Finding[] = [];

  // Group hypotheses by verificationKey
  const byKey = new Map<string, { request: VerificationRequest; hypothesis: Hypothesis }>();

  for (const h of hypotheses) {
    if (!h.verificationRequest || h.status !== 'verification-requested') continue;
    const key = verificationKey(h.verificationRequest);
    if (!byKey.has(key)) {
      byKey.set(key, { request: h.verificationRequest, hypothesis: h });
    }
  }

  for (const item of byKey.values()) {
    const { request, hypothesis } = item;

    // Check if verification is disabled or target not configured
    if (!isEnabled || !cfg.sandbox.targetUrl) {
      const skippedRun: VerificationRun = {
        id: request.id,
        projectId,
        runId: request.runId,
        hypothesisId: hypothesis.id,
        template: request.template,
        result: 'INCONCLUSIVE',
        evidence: {
          request: {},
          response: {},
          expected: 'sandbox target reachable and verification enabled',
          actual: !cfg.sandbox.targetUrl ? 'no SANDBOX_TARGET_URL configured' : 'verification disabled',
        },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      runs.push(skippedRun);
      continue;
    }

    // Execute verification
    const run = await verify(cfg, projectId, request);
    runs.push(run);

    if (run.result === 'CONFIRMED') {
      // Idempotency check: see if an open finding already exists for this (projectId, type, affectedNodes)
      const sortedNodes = [...hypothesis.affectedNodes].sort();
      let existingFinding: Finding | null = null;

      if (mongoose.connection.readyState === 1) {
        try {
          const doc = await models.findings
            .findOne({
              projectId,
              type: hypothesis.type,
              status: 'open',
              affectedNodes: { $all: sortedNodes, $size: sortedNodes.length },
            })
            .lean();
          if (doc) existingFinding = doc as unknown as Finding;
        } catch {
          existingFinding = null;
        }
      }

      if (existingFinding && mongoose.connection.readyState === 1) {
        // Update existing finding's evidence, verificationResult, and updatedAt
        try {
          const updated = await models.findings
            .findOneAndUpdate(
              { id: existingFinding.id },
              {
                $set: {
                  evidence: run.evidence,
                  verificationResult: { runId: run.id, result: 'CONFIRMED', verifiedAt: run.finishedAt },
                  agentRun: hypothesis.runId,
                  updatedAt: new Date().toISOString(),
                },
              },
              { new: true },
            )
            .lean();
          if (updated) {
            findings.push(updated as unknown as Finding);
          } else {
            findings.push(existingFinding);
          }
        } catch {
          findings.push(existingFinding);
        }
      } else {
        // Mint new finding
        const finding = await buildFinding(cfg, engine, hypothesis, run);
        if (finding) findings.push(finding);
      }
    }
  }

  return { runs, findings };
}

/**
 * Filter and deduplicate investigation requests.
 */
export function deduplicateInvestigationRequests(
  requests: InvestigationRequest[],
  allowedTargets: string[] = ['auth', 'dataflow', 'attack-path'],
): InvestigationRequest[] {
  const seen = new Set<string>();
  const valid: InvestigationRequest[] = [];

  for (const req of requests) {
    if (!allowedTargets.includes(req.target)) continue;
    const key = `${req.target}::${req.question.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      valid.push(req);
    }
  }

  return valid;
}
