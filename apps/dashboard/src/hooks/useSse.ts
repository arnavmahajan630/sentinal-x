import { useEffect, useRef, useState } from 'react';
import type { AgentStep } from '@/lib/api';

/**
 * Hook to stream real-time global events via SSE
 */
export function useGlobalEvents(projectId?: string) {
  const [events, setEvents] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const url = projectId ? `/api/stream/events?projectId=${encodeURIComponent(projectId)}` : '/api/stream/events';
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'connected') return;
        setEvents((prev) => [data, ...prev].slice(0, 50));
      } catch {
        // Drop unparseable message
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [projectId]);

  return { events, isConnected };
}

/**
 * Hook to stream real-time agent steps for a specific runId via SSE
 */
export function useAgentStream(runId?: string) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId || typeof EventSource === 'undefined') {
      setSteps([]);
      setIsConnected(false);
      setIsFinished(false);
      return;
    }

    const es = new EventSource(`/api/stream/agent/${encodeURIComponent(runId)}`);
    esRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'connected') return;
        setSteps((prev) => {
          // Deduplicate by seq
          if (prev.some((s) => s.seq === data.seq)) return prev;
          return [...prev, data].sort((a, b) => a.seq - b.seq);
        });
        if (data.kind === 'run.finished' || data.kind === 'error') {
          setIsFinished(true);
        }
      } catch {
        // Drop unparseable message
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId]);

  return { steps, isConnected, isFinished, isStreaming: isConnected && !isFinished };
}
