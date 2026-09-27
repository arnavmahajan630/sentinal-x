import type { AgentStep, Hypothesis, Observation, RunRecord, ToolCallRecord } from './types';

/** Persistence for one agent run's trace (Mongo in production, memory in tests). */
export interface RunStore {
  createRun(r: RunRecord): Promise<void>;
  updateRun(runId: string, patch: Partial<RunRecord>): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  appendStep(s: AgentStep): Promise<void>;
  /** steps with seq > afterSeq, ascending (SSE replay) */
  getSteps(runId: string, afterSeq?: number): Promise<AgentStep[]>;
  appendToolCall(c: ToolCallRecord): Promise<void>;
  getToolCalls(runId: string): Promise<ToolCallRecord[]>;
  saveObservation(o: Observation): Promise<void>;
  getObservations(runId: string): Promise<Observation[]>;
  saveHypothesis(h: Hypothesis): Promise<void>;
  updateHypothesis(id: string, patch: Partial<Hypothesis>): Promise<void>;
  getHypotheses(runId: string): Promise<Hypothesis[]>;
}
