import type { RunStore } from './store';
import type { AgentStep, Hypothesis, Observation, RunRecord, ToolCallRecord } from './types';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class MemoryRunStore implements RunStore {
  runs = new Map<string, RunRecord>();
  steps = new Map<string, AgentStep[]>();
  toolCalls = new Map<string, ToolCallRecord[]>();
  observations = new Map<string, Observation[]>();
  hypotheses = new Map<string, Hypothesis[]>();

  async createRun(r: RunRecord) {
    this.runs.set(r.runId, clone(r));
  }
  async updateRun(runId: string, patch: Partial<RunRecord>) {
    const r = this.runs.get(runId);
    if (r) this.runs.set(runId, { ...r, ...clone(patch) });
  }
  async getRun(runId: string) {
    const r = this.runs.get(runId);
    return r ? clone(r) : null;
  }
  async appendStep(s: AgentStep) {
    this.steps.set(s.runId, [...(this.steps.get(s.runId) ?? []), clone(s)]);
  }
  async getSteps(runId: string, afterSeq = 0) {
    return clone((this.steps.get(runId) ?? []).filter((s) => s.seq > afterSeq));
  }
  async appendToolCall(c: ToolCallRecord) {
    this.toolCalls.set(c.runId, [...(this.toolCalls.get(c.runId) ?? []), clone(c)]);
  }
  async getToolCalls(runId: string) {
    return clone(this.toolCalls.get(runId) ?? []);
  }
  async saveObservation(o: Observation) {
    this.observations.set(o.runId, [...(this.observations.get(o.runId) ?? []), clone(o)]);
  }
  async getObservations(runId: string) {
    return clone(this.observations.get(runId) ?? []);
  }
  async saveHypothesis(h: Hypothesis) {
    this.hypotheses.set(h.runId, [...(this.hypotheses.get(h.runId) ?? []), clone(h)]);
  }
  async updateHypothesis(id: string, patch: Partial<Hypothesis>) {
    for (const [runId, list] of this.hypotheses) {
      this.hypotheses.set(
        runId,
        list.map((h) => (h.id === id ? { ...h, ...clone(patch) } : h)),
      );
    }
  }
  async getHypotheses(runId: string) {
    return clone(this.hypotheses.get(runId) ?? []);
  }
}
