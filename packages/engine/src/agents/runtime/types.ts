import type { Playbook, SectionName, Severity, VerificationKind } from '../../knowledge/types';

// ─── budget ──────────────────────────────────────────────────────────────────
export interface Budget {
  /** LLM turns */
  maxSteps: number;
  /** cumulative input + output tokens */
  maxTokens: number;
  maxToolCalls: number;
  /** whole run */
  timeoutMs: number;
  /** one LLM call */
  llmTimeoutMs: number;
}
export const DEFAULT_BUDGET: Budget = {
  maxSteps: 12,
  maxTokens: 60_000,
  maxToolCalls: 40,
  timeoutMs: 300_000,
  llmTimeoutMs: 90_000,
};

// ─── tool names (type-level guarantee: no way to create/confirm a finding) ────
export type FactToolName =
  | 'getRoutes'
  | 'getRoute'
  | 'getMiddlewareChain'
  | 'getCallGraph'
  | 'getDataflow'
  | 'getModelAccess'
  | 'getDependency'
  | 'getSensitiveAssets'
  | 'getUnprotectedRoutes'
  | 'getRoutesTouchingModel'
  | 'getAuthorizationGaps'
  | 'getJwtUsage'
  | 'getSecrets'
  | 'getExposure';
export type KnowledgeToolName =
  'getPlaybook' | 'getPlaybooksForSignals' | 'listPlaybooks' | 'getSignalCatalog';
export const EMIT_TOOL_NAMES = [
  'recordObservation',
  'proposeHypothesis',
  'requestVerification',
  'requestInvestigation',
  'finish',
] as const;
export type EmitToolName = (typeof EMIT_TOOL_NAMES)[number];
/** Every tool an agent can call. There is intentionally no `createFinding` / `confirm…` member. */
export type AgentToolName = FactToolName | KnowledgeToolName | EmitToolName;

// ─── run state / records ─────────────────────────────────────────────────────
export type AgentName = 'auth' | 'dataflow' | 'attack-path' | 'demo' | (string & {});
export type RunStatus = 'running' | 'completed' | 'inconclusive' | 'failed' | 'cancelled';

export type StepKind =
  | 'run.started'
  | 'llm'
  | 'tool.call'
  | 'tool.result'
  | 'observation'
  | 'hypothesis'
  | 'hypothesis.rejected'
  | 'verification.requested'
  | 'investigation.requested'
  | 'nudge'
  | 'budget.exhausted'
  | 'error'
  | 'run.finished';

/** UI-ready event: what is persisted in `agent_steps` and published on bus `agent:<runId>` */
export interface AgentStep {
  runId: string;
  seq: number;
  kind: StepKind;
  title: string;
  detail: unknown;
  ts: string;
}

export type HypothesisSubject =
  | { kind: 'route'; route: string }
  | { kind: 'jwt'; fn: string; line?: number }
  | { kind: 'secret'; id: string };

export interface Observation {
  id: string;
  runId: string;
  projectId: string;
  agent: string;
  kind: 'fact' | 'safe' | 'note';
  text: string;
  /** tool-call numbers cited */
  evidence: number[];
  ts: string;
}

export interface VerificationRequest {
  id: string;
  runId: string;
  hypothesisId: string;
  template: string;
  subject: HypothesisSubject;
  affectedNodes: string[];
  requestedAt: string;
}
export interface InvestigationRequest {
  id: string;
  runId: string;
  from: string;
  target: string;
  question: string;
  refs: string[];
  requestedAt: string;
}

export interface Hypothesis {
  id: string;
  runId: string;
  projectId: string;
  agent: string;
  /** playbook type, e.g. 'idor' */
  type: string;
  subject: HypothesisSubject;
  title: string;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  /** tool-call numbers of THIS run that ground it */
  evidence: number[];
  /** graph node ids filled by the runtime (never by the model) */
  affectedNodes: string[];
  signals: string[];
  /** `type@version` of the playbook that guided it */
  playbook: string;
  verifierTemplate: string | null;
  verification: VerificationKind;
  severityHint: Severity;
  status: 'proposed' | 'verification-requested';
  verificationRequest?: VerificationRequest;
  ts: string;
}

export interface ToolCallRecord {
  runId: string;
  /** per-run tool-call number (what the model cites as evidence) */
  seq: number;
  callId: string;
  tool: string;
  args: unknown;
  ok: boolean;
  output: unknown;
  durationMs: number;
  ts: string;
}

export interface RunUsage {
  inTok: number;
  outTok: number;
  llmCalls: number;
  toolCalls: number;
}

// ─── agent definition + result ───────────────────────────────────────────────
export interface AgentSpec {
  name: AgentName;
  /** role/behaviour prompt (C6/C8 supply this) */
  systemPrompt: string;
  /** playbook types to inject (else pass `playbooks` to runAgent) */
  playbooks?: string[];
  /** which playbook sections to inject (default: Investigation strategy, False-positive rules, Verification strategy, Evidence requirements) */
  sections?: SectionName[];
  /** playbook types this agent may propose hypotheses for (default: vulnerability playbooks whose agent matches) */
  hypothesisTypes?: string[];
  /** agents this one may ask via requestInvestigation */
  investigationTargets?: string[];
  budget?: Partial<Budget>;
}

export interface AgentRunResult {
  runId: string;
  projectId: string;
  agent: string;
  status: Exclude<RunStatus, 'running'>;
  /** why the run ended when not `completed` (budget:steps|tokens|toolCalls|timeout, no_tool_use, cancelled, error) */
  reason?: string;
  summary: string;
  outcome?: 'findings' | 'none' | 'inconclusive';
  observations: Observation[];
  hypotheses: Hypothesis[];
  verificationRequests: VerificationRequest[];
  investigationRequests: InvestigationRequest[];
  usage: RunUsage;
  steps: number;
  playbooks: string[];
  durationMs: number;
  error?: string;
}

export interface RunRecord {
  runId: string;
  projectId: string;
  agent: string;
  goal: string;
  status: RunStatus;
  budget: Budget;
  usage: RunUsage;
  stepCount: number;
  playbooks: string[];
  summary?: string;
  reason?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export const DEFAULT_SECTIONS: SectionName[] = [
  'Investigation strategy',
  'False-positive rules',
  'Verification strategy',
  'Evidence requirements',
];
export type { Playbook };
