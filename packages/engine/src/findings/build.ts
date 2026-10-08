import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Config } from '../config';
import { models } from '../db/collections';
import { bus, EVENTS_CHANNEL } from '../bus';
import { getKnowledge } from '../knowledge';
import type { FactEngine } from '../facts/engine';
import type { Hypothesis } from '../agents/runtime/types';
import type { VerificationRun } from '../verification/engine';
import { computeSeverity } from './severity';
import type { Finding } from './model';

/**
 * CONFIRMED verification runs mint a Finding; REJECTED/INCONCLUSIVE do not — the
 * persisted VerificationRun is itself the record against the hypothesis, no separate
 * rejection write is needed.
 */
export async function buildFinding(
  cfg: Config,
  engine: FactEngine,
  hypothesis: Hypothesis,
  run: VerificationRun,
): Promise<Finding | null> {
  if (run.result !== 'CONFIRMED') return null;

  const registry = getKnowledge(cfg.playbooksDir);
  const playbook = registry.getPlaybook(hypothesis.type);

  const assets = await engine.getSensitiveAssets();
  const assetWeight = Math.max(
    0,
    ...assets.filter((a) => hypothesis.affectedNodes.includes(a.id)).map((a) => a.weight),
  );
  let routeProtected = true;
  if (hypothesis.subject.kind === 'route') {
    try {
      const route = await engine.getRoute(hypothesis.subject.route);
      routeProtected = route.protected;
    } catch {
      routeProtected = true;
    }
  }

  const severity = computeSeverity({ base: playbook.severityBase, assetWeight, routeProtected });
  const now = new Date().toISOString();
  const finding: Finding = {
    id: randomUUID(),
    projectId: hypothesis.projectId,
    type: hypothesis.type,
    severity,
    confidence: hypothesis.confidence,
    status: 'open',
    affectedNodes: hypothesis.affectedNodes,
    evidence: run.evidence,
    verificationResult: { runId: run.id, result: 'CONFIRMED', verifiedAt: run.finishedAt },
    agentRun: hypothesis.runId,
    references: {
      owasp: playbook.owasp,
      apiTop10: playbook.apiTop10,
      cwe: playbook.cwe,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (mongoose.connection.readyState === 1) {
    await models.findings.create(finding);
    await models.security_events.create({
      projectId: finding.projectId,
      ts: new Date(),
      type: 'finding.created',
      summary: `${finding.type} CONFIRMED (${finding.severity})`,
      findingId: finding.id,
    });
  }
  bus.publish(EVENTS_CHANNEL, {
    kind: 'finding.created',
    projectId: finding.projectId,
    findingId: finding.id,
    type: finding.type,
    severity: finding.severity,
  });
  return finding;
}
