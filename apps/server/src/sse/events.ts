import type { Response } from 'express';
import { bus, EVENTS_CHANNEL, models } from '@sentinelx/engine';

interface SseClient {
  id: string;
  res: Response;
  projectId?: string;
  runId?: string;
}

class SseManager {
  private clients: Map<string, SseClient> = new Map();
  private initialized = false;

  constructor() {
    this.initBusListener();
  }

  private initBusListener() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen to global timeline events
    bus.subscribe(EVENTS_CHANNEL, (msg) => {
      this.broadcastEvent(msg.data);
    });
  }

  /**
   * Register a client listening to global timeline events
   */
  registerEventsClient(id: string, res: Response, projectId?: string) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`);

    this.clients.set(id, { id, res, projectId });

    res.on('close', () => {
      this.clients.delete(id);
    });
  }

  /**
   * Register a client listening to a specific agent run stream
   */
  async registerAgentClient(id: string, res: Response, runId: string) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'connected', runId, ts: new Date().toISOString() })}\n\n`);

    // Replay past steps for this run from MongoDB if available
    try {
      const pastSteps = await models.agent_steps
        .find({ runId })
        .sort({ seq: 1 })
        .lean();
      for (const step of pastSteps) {
        res.write(`data: ${JSON.stringify(step)}\n\n`);
      }
    } catch {
      // Ignore if DB not ready
    }

    const unsub = bus.subscribe(`agent:${runId}`, (msg) => {
      try {
        res.write(`data: ${JSON.stringify(msg.data)}\n\n`);
      } catch {
        // Drop on error
      }
    });

    res.on('close', () => {
      unsub();
      this.clients.delete(id);
    });

    this.clients.set(id, { id, res, runId });
  }

  /**
   * Broadcast an event to matching event-stream clients
   */
  private broadcastEvent(event: any) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients.values()) {
      if (!client.runId) {
        if (!client.projectId || !event.projectId || client.projectId === event.projectId) {
          try {
            client.res.write(payload);
          } catch {
            this.clients.delete(client.id);
          }
        }
      }
    }
  }
}

export const sseManager = new SseManager();
