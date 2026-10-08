import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Play,
  Terminal,
  ChevronRight,
  ChevronDown,
  Loader2,
  BrainCircuit,
  Radio,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useAgentStream } from '@/hooks/useSse';
import { triggerAssessment } from '@/lib/api';
import { cn } from '@/lib/utils';

export function AgentActivity() {
  const { activeProject, currentRunId } = useProject();
  const queryClient = useQueryClient();

  // Selected run ID for streaming
  const [selectedRunId, setSelectedRunId] = useState<string | null>(currentRunId);
  const [selectedSpecialist, setSelectedSpecialist] = useState<string>('all');
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  // Query recent runs
  const { data: recentRuns } = useQuery({
    queryKey: ['agent-runs', activeProject?.projectId],
    queryFn: async () => {
      if (!activeProject) return [];
      const res = await fetch(`/api/runs?projectId=${encodeURIComponent(activeProject.projectId)}`);
      return res.json();
    },
    enabled: Boolean(activeProject),
    refetchInterval: 6000,
  });

  const activeStreamRunId = selectedRunId || (recentRuns && recentRuns[0]?.runId) || null;
  const { steps: streamSteps, isStreaming } = useAgentStream(activeStreamRunId);

  // Trigger agent mutation
  const runAgentMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error('No active project');
      const res = await triggerAssessment(
        activeProject.projectId,
        'full',
        selectedSpecialist === 'all' ? undefined : selectedSpecialist,
      );
      if (res?.runId) {
        setSelectedRunId(res.runId);
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-runs'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const toggleStep = (seq: number) => {
    setExpandedSteps((prev) => ({ ...prev, [seq]: !prev[seq] }));
  };

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Agent Activity</h1>
          <p className="mt-1 text-sm text-muted">
            Watch specialist agents investigate your application, reasoning live with tool execution traces.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <Bot className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Select or load a project repository to monitor multi-agent security audits in real-time.
          </p>
        </div>
      </div>
    );
  }

  const getStepColor = (kind: string) => {
    switch (kind.toLowerCase()) {
      case 'hypothesis':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'tool_call':
      case 'tool':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'observation':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'finding':
      case 'finding_created':
        return 'text-danger bg-danger/10 border-danger/30';
      default:
        return 'text-primary bg-primary/10 border-primary/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Agent Activity</h1>
          <p className="mt-1 text-sm text-muted">
            Watch specialist agents investigate your application, reasoning live with tool execution traces.
          </p>
        </div>

        {/* Trigger Agent Control Bar */}
        <div className="flex items-center gap-2">
          <select
            value={selectedSpecialist}
            onChange={(e) => setSelectedSpecialist(e.target.value)}
            className="rounded-lg border bg-surface-alt/70 px-3 py-2 text-xs font-semibold text-fg/90 focus:border-primary focus:outline-none"
          >
            <option value="all">ALL SPECIALISTS</option>
            <option value="discovery">Discovery Agent</option>
            <option value="bola">BOLA / IDOR Specialist</option>
            <option value="auth">Auth & BFLA Specialist</option>
            <option value="injection">Injection Specialist</option>
            <option value="mass_assignment">Mass Assignment Specialist</option>
          </select>

          <button
            type="button"
            disabled={runAgentMutation.isPending}
            onClick={() => runAgentMutation.mutate()}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {runAgentMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Starting Agent...
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" /> Launch Specialist
              </>
            )}
          </button>
        </div>
      </div>

      {/* Runs Selector & Stream Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface/60 p-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase text-muted">Active Run:</span>
          <select
            value={activeStreamRunId || ''}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="rounded-lg border bg-surface-alt/80 px-3 py-1.5 font-mono text-xs text-fg focus:border-primary focus:outline-none"
          >
            {recentRuns && recentRuns.length > 0 ? (
              recentRuns.map((r: any) => (
                <option key={r.runId} value={r.runId}>
                  {r.runId.slice(0, 18)} — {r.mode || 'full'} ({r.status})
                </option>
              ))
            ) : (
              <option value="">No previous runs</option>
            )}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-full bg-surface-alt border px-2.5 py-1">
            <Radio className={cn('size-3', isStreaming ? 'text-primary animate-pulse' : 'text-muted')} />
            <span className={cn('font-medium', isStreaming ? 'text-primary' : 'text-muted')}>
              {isStreaming ? 'STREAMING LIVE' : 'STREAM IDLE'}
            </span>
          </div>
          <span className="text-muted font-mono">{streamSteps.length} steps recorded</span>
        </div>
      </div>

      {/* Main Execution Trace Console */}
      <div className="rounded-2xl border bg-surface/80 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3 text-xs font-semibold text-muted uppercase">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <span>Multi-Agent Reasoning & Tool Execution Stream</span>
          </div>
          <span>REAL-TIME SSE PIPELINE</span>
        </div>

        {streamSteps.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted">
            <BrainCircuit className="size-10 mb-3 text-muted/40 animate-pulse" />
            <span className="text-sm font-medium text-fg">No Agent Steps in Buffer</span>
            <span className="text-xs text-muted mt-1 max-w-sm">
              Click "Launch Specialist" above to start an autonomous security assessment and observe live thoughts.
            </span>
          </div>
        ) : (
          <div className="space-y-3 max-h-[620px] overflow-y-auto pr-2">
            {streamSteps.map((step) => {
              const isExpanded = Boolean(expandedSteps[step.seq]);
              const colorClass = getStepColor(step.kind);

              return (
                <div
                  key={step.seq}
                  className="rounded-xl border border-border/80 bg-surface-alt/40 p-3.5 transition-colors hover:border-primary/40"
                >
                  <div
                    onClick={() => toggleStep(step.seq)}
                    className="flex cursor-pointer items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface border font-mono text-[11px] font-bold text-muted">
                        #{step.seq}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase',
                              colorClass,
                            )}
                          >
                            {step.kind}
                          </span>
                          <span className="truncate text-xs font-semibold text-fg">
                            {step.title}
                          </span>
                        </div>

                        {/* Collapsed snippet */}
                        {!isExpanded && step.detail && (
                          <p className="mt-1 text-[11.5px] text-muted line-clamp-1">
                            {typeof step.detail === 'string'
                              ? step.detail
                              : step.detail.message || JSON.stringify(step.detail)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10.5px] text-muted">
                        {step.ts ? new Date(step.ts).toLocaleTimeString() : ''}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted" />
                      ) : (
                        <ChevronRight className="size-4 text-muted" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail Payload */}
                  {isExpanded && step.detail && (
                    <div className="mt-3 rounded-lg border bg-black/60 p-3 font-mono text-xs text-fg/90 overflow-x-auto">
                      <pre className="whitespace-pre-wrap break-all text-[11.5px]">
                        {typeof step.detail === 'string'
                          ? step.detail
                          : JSON.stringify(step.detail, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
