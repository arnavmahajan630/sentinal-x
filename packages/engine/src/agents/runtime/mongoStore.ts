import { models } from '../../db/collections';
import type { RunStore } from './store';
import type { AgentStep, Hypothesis, Observation, RunRecord, ToolCallRecord } from './types';

/** drop Mongo bookkeeping fields */
const strip = <T>(d: any): T => {
  if (!d) return d;
  const rest = { ...d };
  for (const k of ['_id', '__v', 'createdAt', 'updatedAt']) delete rest[k];
  return rest as T;
};
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)); // no undefined → null surprises

export class MongoRunStore implements RunStore {
  async createRun(r: RunRecord) {
    await models.agent_runs.create(json(r));
  }
  async updateRun(runId: string, patch: Partial<RunRecord>) {
    await models.agent_runs.updateOne({ runId }, { $set: json(patch) });
  }
  async getRun(runId: string) {
    return strip<RunRecord>(await models.agent_runs.findOne({ runId }).lean());
  }
  async appendStep(s: AgentStep) {
    await models.agent_steps.create({ ...json(s), ts: new Date(s.ts) });
  }
  async getSteps(runId: string, afterSeq = 0) {
    const docs = await models.agent_steps
      .find({ runId, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .lean();
    return docs.map((d: any) => ({ ...strip<AgentStep>(d), ts: new Date(d.ts).toISOString() }));
  }
  async appendToolCall(c: ToolCallRecord) {
    await models.tool_calls.create(json(c));
  }
  async getToolCalls(runId: string) {
    return (await models.tool_calls.find({ runId }).sort({ seq: 1 }).lean()).map((d: any) =>
      strip<ToolCallRecord>(d),
    );
  }
  async saveObservation(o: Observation) {
    await models.observations.create(json(o));
  }
  async getObservations(runId: string) {
    return (await models.observations.find({ runId }).sort({ ts: 1 }).lean()).map((d: any) =>
      strip<Observation>(d),
    );
  }
  async saveHypothesis(h: Hypothesis) {
    await models.hypotheses.create(json(h));
  }
  async updateHypothesis(id: string, patch: Partial<Hypothesis>) {
    await models.hypotheses.updateOne({ id }, { $set: json(patch) });
  }
  async getHypotheses(runId: string) {
    return (await models.hypotheses.find({ runId }).sort({ ts: 1 }).lean()).map((d: any) =>
      strip<Hypothesis>(d),
    );
  }
}
