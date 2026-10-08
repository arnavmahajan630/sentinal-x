import type { Hypothesis, AgentName } from '../agents/runtime/types';
import type { FactEngine } from '../facts/engine';
import type { Finding } from '../findings/model';
import type { LlmProvider } from '../llm/types';
import type { VerificationRun } from '../verification/engine';
import type { EventBus } from '../bus';
import type { RunStore } from '../agents/runtime/store';

export type OrchestratorStatus = 'idle' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type AssessmentMode = 'full' | 'agent' | 'change';

export interface OrchestratorBudget {
  /** Maximum cumulative LLM turns across all agents in the assessment */
  maxTotalSteps: number;
  /** Maximum cumulative tokens across all agents */
  maxTotalTokens: number;
  /** Overall timeout for the entire assessment pass in milliseconds */
  timeoutMs: number;
}

export const DEFAULT_ORCHESTRATOR_BUDGET: OrchestratorBudget = {
  maxTotalSteps: 80,
  maxTotalTokens: 150_000,
  timeoutMs: 600_000, // 10 minutes
};

export interface AssessmentOptions {
  projectId: string;
  provider?: LlmProvider;
  engine?: FactEngine;
  store?: RunStore;
  bus?: EventBus;
  signal?: AbortSignal;
  budget?: Partial<OrchestratorBudget>;
  enableVerification?: boolean;
  maxInvestigationDepth?: number;
  retryDelaysMs?: number[];
  playbooksDir?: string;
  goals?: Partial<Record<AgentName, string>>;
}

export interface AgentRunSummary {
  runId: string;
  agent: string;
  status: string;
  steps: number;
  tokens: number;
  durationMs: number;
  hypothesesCount: number;
  observationsCount: number;
  error?: string;
}

export interface AssessmentResult {
  assessmentId: string;
  projectId: string;
  mode: AssessmentMode;
  status: OrchestratorStatus;
  agents: Record<string, AgentRunSummary>;
  verificationRuns: VerificationRun[];
  findings: Finding[];
  hypotheses: Hypothesis[];
  durationMs: number;
  error?: string;
}

export interface ChangeSetInput {
  changedFiles: string[];
  changedNodeIds?: string[];
  affectedNodeTypes?: string[];
}
