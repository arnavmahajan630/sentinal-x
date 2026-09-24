import { describe, expect, it, vi } from 'vitest';
import { EventBus, agentChannel } from '../src/bus';

describe('EventBus', () => {
  it('delivers to subscribers of the matching channel only', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(agentChannel('run1'), a);
    bus.subscribe('events', b);
    bus.publish(agentChannel('run1'), { kind: 'step' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    expect(a.mock.calls[0]![0]).toMatchObject({ channel: 'agent:run1', data: { kind: 'step' } });
  });

  it('unsubscribes', () => {
    const bus = new EventBus();
    const h = vi.fn();
    const off = bus.subscribe('events', h);
    off();
    bus.publish('events', { x: 1 });
    expect(h).not.toHaveBeenCalled();
    expect(bus.listenerCount('events')).toBe(0);
  });

  it('messages are JSON round-trippable', () => {
    const bus = new EventBus();
    const msg = bus.publish('events', { a: [1, 2], b: 'x' });
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('rejects non-serializable payloads', () => {
    const bus = new EventBus();
    const cyclic: any = {};
    cyclic.self = cyclic;
    expect(() => bus.publish('events', cyclic)).toThrow();
  });
});
