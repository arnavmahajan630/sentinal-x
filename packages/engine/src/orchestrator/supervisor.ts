import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Config } from '../config';
import { loadConfig } from '../config';
import { bus as defaultBus, EVENTS_CHANNEL } from '../bus';
import { models } from '../db/collections';
import { createFactEngine } from '../facts/engine';
import { getKnowledge } from '../knowledge/registry';
import {
  authAgent,
  dataflowAgent,
  attackPathAgent,
  demoAgent,
  runAgent,
  MemoryRunStore,
} from '../agents';
import type {
  AgentName,
  AgentRunResult,
  AgentSpec,
  Hypothesis,
} from '../agents/runtime/types';
import type { Finding } from '../findings/model';
import type { VerificationRun } from '../verification/engine';
import {
  deduplicateInvestigationRequests,
  drainVerificationRequests,
} from './requests';
import { shouldRunAttackPath } from './relevance';
import {
  DEFAULT_ORCHESTRATOR_BUDGET,
  type AgentRunSummary,
  type AssessmentMode,
  type AssessmentOptions,
  type AssessmentResult,
  type OrchestratorBudget,
  type OrchestratorStatus,
} from './types';

const KNOWN_AGENTS: Record<string, AgentSpec> = {
  auth: authAgent,
  dataflow: dataflowAgent,
  'attack-path': attackPathAgent,
  demo: demoAgent,
};

const DEFAULT_GOALS: Record<string, string> = {
  auth: 'For each route, determine whether access control (authentication, ownership, role) is enforced correctly; where it isn\'t, propose a hypothesis with evidence and the right verification template.',
  dataflow: 'Scan routes with mutates=true and responses with sensitive exposure for NoSQL injection, mass-assignment, data-exposure, and committed secrets. Propose evidence-backed hypotheses.',
  'attack-path': 'Compose confirmed open findings into multi-step attack paths via getAttackPath and attachAttackPath.',
  demo: 'List the unprotected routes and explain the security risk of each.',
};

export class Supervisor {
  private cfg: Config;

  constructor(cfg?: Config) {
    this.cfg = cfg ?? loadConfig();
  }

  /**
   * Execute an assessment coordinating the specialist agents, inter-agent routing,
   * sandbox verification drain, and attack-path composition.
   */
  async execute(
    projectId: string,
    mode: AssessmentMode,
    targetAgentNames: AgentName[],
    options: Partial<AssessmentOptions> = {},
  ): Promise<AssessmentResult> {
    const startedAt = Date.now();
    const assessmentId = randomUUID();
    const bus = options.bus ?? defaultBus;
    const engine = options.engine ?? createFactEngine(projectId);
    const budget: OrchestratorBudget = {
      ...DEFAULT_ORCHESTRATOR_BUDGET,
      ...options.budget,
    };
    const maxInvestigationDepth = options.maxInvestigationDepth ?? 1;

    const store =
      options.store ??
      (mongoose.connection.readyState === 1 ? undefined : new MemoryRunStore());

    // Track status and resources
    let status: OrchestratorStatus = 'running';
    let cumulativeSteps = 0;
    let cumulativeTokens = 0;
    const agentSummaries: Record<string, AgentRunSummary> = {};
    const allHypotheses: Hypothesis[] = [];
    let verificationRuns: VerificationRun[] = [];
    let findings: Finding[] = [];
    let assessmentError: string | undefined;

    // Timeline start
    bus.publish(EVENTS_CHANNEL, {
      kind: 'assessment.started',
      assessmentId,
      projectId,
      mode,
      agents: targetAgentNames,
      ts: new Date().toISOString(),
    });

    if (mongoose.connection.readyState === 1) {
      try {
        await models.security_events.create({
          projectId,
          ts: new Date(),
          type: 'assessment.started',
          summary: `Security assessment started (mode: ${mode}, agents: ${targetAgentNames.join(', ')})`,
          assessmentId,
        });
      } catch {
        // In-memory or non-MongoDB test environments
      }
    }

    const checkBudgetOrCancelled = (): boolean => {
      if (options.signal?.aborted) {
        status = 'cancelled';
        return true;
      }
      if (
        cumulativeSteps >= budget.maxTotalSteps ||
        cumulativeTokens >= budget.maxTotalTokens ||
        Date.now() - startedAt >= budget.timeoutMs
      ) {
        status = 'partial';
        return true;
      }
      return false;
    };

    // Helper to run one specialist agent
    const executeAgent = async (
      name: AgentName,
      goal?: string,
      context?: string,
    ): Promise<AgentRunResult | null> => {
      const spec = KNOWN_AGENTS[name];
      if (!spec) {
        throw new Error(`Unknown agent: "${name}"`);
      }

      if (checkBudgetOrCancelled()) return null;

      const remainingSteps = Math.max(1, budget.maxTotalSteps - cumulativeSteps);
      const agentRun = await runAgent({
        projectId,
        agent: spec,
        goal: goal ?? options.goals?.[name] ?? DEFAULT_GOALS[name] ?? 'Investigate vulnerabilities',
        context,
        budget: { maxSteps: Math.min(spec.budget?.maxSteps ?? 24, remainingSteps) },
        provider: options.provider,
        engine,
        registry: options.playbooksDir ? getKnowledge(options.playbooksDir) : undefined,
        store,
        bus,
        signal: options.signal,
        retryDelaysMs: options.retryDelaysMs,
      });

      cumulativeSteps += agentRun.steps;
      cumulativeTokens += agentRun.usage.inTok + agentRun.usage.outTok;

      agentSummaries[agentRun.runId] = {
        runId: agentRun.runId,
        agent: name,
        status: agentRun.status,
        steps: agentRun.steps,
        tokens: agentRun.usage.inTok + agentRun.usage.outTok,
        durationMs: agentRun.durationMs,
        hypothesesCount: agentRun.hypotheses.length,
        observationsCount: agentRun.observations.length,
        error: agentRun.error,
      };

      allHypotheses.push(...agentRun.hypotheses);
      return agentRun;
    };

    try {
      // ───────────────────────────────────────────────────────────────────────
      // PHASE 1: Detection Agents (e.g. auth, dataflow)
      // ───────────────────────────────────────────────────────────────────────
      const detectionAgents = targetAgentNames.filter((a) => a !== 'attack-path');
      const primaryResults: AgentRunResult[] = [];

      for (const name of detectionAgents) {
        if (checkBudgetOrCancelled()) break;
        const result = await executeAgent(name);
        if (result) primaryResults.push(result);
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 2: Inter-Agent Investigation Routing (depth-bounded)
      // ───────────────────────────────────────────────────────────────────────
      if (maxInvestigationDepth > 0 && !checkBudgetOrCancelled()) {
        const queuedInvestigations = primaryResults.flatMap((r) => r.investigationRequests);
        const deduplicated = deduplicateInvestigationRequests(queuedInvestigations);

        for (const inv of deduplicated) {
          if (checkBudgetOrCancelled()) break;
          await executeAgent(
            inv.target as AgentName,
            inv.question,
            `Investigation requested by agent "${inv.from}". References: ${inv.refs.join(', ')}`,
          );
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 3 & 4: Sandbox Verification Drain & Finding Minting
      // ───────────────────────────────────────────────────────────────────────
      if (!options.signal?.aborted) {
        const drain = await drainVerificationRequests(
          this.cfg,
          projectId,
          engine,
          allHypotheses,
          { enableVerification: options.enableVerification },
        );
        verificationRuns = drain.runs;
        findings = drain.findings;
      }

      // ───────────────────────────────────────────────────────────────────────
      // PHASE 5: Attack-Path Composition
      // ───────────────────────────────────────────────────────────────────────
      const includeAttackPath =
        targetAgentNames.includes('attack-path') || shouldRunAttackPath(findings.length);

      if (includeAttackPath && !checkBudgetOrCancelled()) {
        await executeAgent(
          'attack-path',
          options.goals?.['attack-path'] ?? DEFAULT_GOALS['attack-path'],
          `Confirmed findings available to compose: ${findings.length}`,
        );
      }

      if (status === 'running') {
        status = 'completed';
      }
    } catch (err) {
      status = 'failed';
      assessmentError = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startedAt;

    // Timeline complete
    bus.publish(EVENTS_CHANNEL, {
      kind: 'assessment.finished',
      assessmentId,
      projectId,
      status,
      findingsCount: findings.length,
      verificationsCount: verificationRuns.length,
      durationMs,
      error: assessmentError,
      ts: new Date().toISOString(),
    });

    if (mongoose.connection.readyState === 1) {
      try {
        await models.security_events.create({
          projectId,
          ts: new Date(),
          type: 'assessment.finished',
          summary: `Security assessment finished with status ${status} (${findings.length} findings)`,
          assessmentId,
        });
      } catch {
        // In-memory or non-MongoDB test environments
      }
    }

    return {
      assessmentId,
      projectId,
      mode,
      status,
      agents: agentSummaries,
      verificationRuns,
      findings,
      hypotheses: allHypotheses,
      durationMs,
      error: assessmentError,
    };
  }
}
