import { EventEmitter } from 'node:events';

/** Channels: per-run agent stream + global timeline. Payloads must stay JSON-serializable. */
export type Channel = `agent:${string}` | 'events';
export const EVENTS_CHANNEL = 'events' as const;
export const agentChannel = (runId: string): Channel => `agent:${runId}`;

export type BusPayload = Record<string, unknown>;
export interface BusMessage<T extends BusPayload = BusPayload> {
  channel: Channel;
  ts: string; // ISO-8601
  data: T;
}

export type Unsubscribe = () => void;

export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Many SSE clients may subscribe to the same channel.
    this.emitter.setMaxListeners(0);
  }

  publish<T extends BusPayload>(channel: Channel, data: T): BusMessage<T> {
    const msg: BusMessage<T> = { channel, ts: new Date().toISOString(), data };
    // Round-trip guard: fail fast on non-serializable payloads (agents/SSE rely on this).
    JSON.stringify(msg);
    this.emitter.emit(channel, msg);
    return msg;
  }

  subscribe<T extends BusPayload = BusPayload>(
    channel: Channel,
    handler: (msg: BusMessage<T>) => void,
  ): Unsubscribe {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  listenerCount(channel: Channel): number {
    return this.emitter.listenerCount(channel);
  }
}

/** Process-wide singleton used by engine + server. */
export const bus = new EventBus();
