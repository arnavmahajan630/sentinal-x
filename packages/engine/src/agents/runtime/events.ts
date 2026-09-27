import { EVENTS_CHANNEL, agentChannel, bus as defaultBus } from '../../bus';
import type { EventBus } from '../../bus';
import type { RunStore } from './store';
import type { AgentStep, StepKind } from './types';

/**
 * Sequenced event emitter for one run: every step is persisted AND published on `agent:<runId>` as
 * `{runId, seq, kind, title, detail, ts}` (UI-ready, JSON-safe). `seq` is contiguous from 1.
 */
export class RunEmitter {
  private seq = 0;
  constructor(
    readonly runId: string,
    private readonly store: RunStore,
    private readonly bus: EventBus = defaultBus,
  ) {}

  get count(): number {
    return this.seq;
  }

  async step(kind: StepKind, title: string, detail: unknown = {}): Promise<AgentStep> {
    const step: AgentStep = {
      runId: this.runId,
      seq: ++this.seq,
      kind,
      title: title.length > 140 ? `${title.slice(0, 139)}…` : title,
      detail: JSON.parse(JSON.stringify(detail ?? {})),
      ts: new Date().toISOString(),
    };
    await this.store.appendStep(step);
    this.bus.publish(agentChannel(this.runId), { ...step });
    return step;
  }

  /** global timeline (`events` channel) */
  global(kind: string, data: Record<string, unknown>): void {
    this.bus.publish(EVENTS_CHANNEL, { kind, runId: this.runId, ...data });
  }
}
