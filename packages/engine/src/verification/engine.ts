import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import { models } from '../db/collections';
import type { VerificationRequest } from '../agents/runtime/types';
import { SandboxClient } from './client';
import { verifyIdor } from './templates/idor';
import { verifyMissingAuth } from './templates/missing-auth';
import { verifyBfla } from './templates/bfla';
import { verifyNosqlInjection } from './templates/nosql-injection';
import { verifyMassAssignment } from './templates/mass-assignment';
import { verifyDataExposure } from './templates/data-exposure';
import { inconclusive } from './templates/types';
import type { Template, TemplateResult } from './templates/types';

export interface VerificationRun {
  id: string;
  projectId: string;
  runId: string;
  hypothesisId: string;
  template: string;
  result: 'CONFIRMED' | 'REJECTED' | 'INCONCLUSIVE';
  evidence: TemplateResult['evidence'];
  startedAt: string;
  finishedAt: string;
}

const TEMPLATES: Record<string, Template> = {
  idor: verifyIdor,
  'missing-auth': verifyMissingAuth,
  bfla: verifyBfla,
  'nosql-injection': verifyNosqlInjection,
  'mass-assignment': verifyMassAssignment,
  'data-exposure': verifyDataExposure,
};

/**
 * Runs one VerificationRequest against the guarded sandbox. Never throws: an unimplemented
 * template name, a thrown template, or a network/guard refusal all synthesize an
 * INCONCLUSIVE run rather than crashing the caller.
 */
export async function verify(
  cfg: Config,
  projectId: string,
  request: VerificationRequest,
): Promise<VerificationRun> {
  const startedAt = new Date().toISOString();
  const template = TEMPLATES[request.template];
  let outcome: TemplateResult;
  if (!template) {
    outcome = inconclusive(`no verifier template implementation for "${request.template}"`);
  } else {
    try {
      const client = new SandboxClient(cfg, projectId);
      outcome = await template(client, request);
    } catch (err) {
      outcome = inconclusive(err instanceof Error ? err.message : String(err));
    }
  }

  const run: VerificationRun = {
    id: randomUUID(),
    projectId,
    runId: request.runId,
    hypothesisId: request.hypothesisId,
    template: request.template,
    result: outcome.result,
    evidence: outcome.evidence,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  await models.verification_runs.create(run);
  return run;
}
