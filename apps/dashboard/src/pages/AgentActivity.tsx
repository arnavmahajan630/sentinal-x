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
  Sparkles,
  ShieldAlert,
  Flame,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useAgentStream } from '@/hooks/useSse';
import { triggerAssessment, fetchRuns } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

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
      return fetchRuns(activeProject.projectId);
    },
    enabled: Boolean(activeProject),
    refetchInterval: 6000,
  });

  const activeStreamRunId = selectedRunId || (recentRuns && recentRuns[0]?.runId) || null;
  const { steps: streamSteps, isStreaming } = useAgentStream(activeStreamRunId);
  const selectedRun = recentRuns?.find((r: any) => r.runId === activeStreamRunId);
  const runStatus = selectedRun?.status || (isStreaming ? 'running' : 'idle');

  // Trigger agent mutation
  const runAgentMutation = useMutation({
    mutationFn: async (specialist?: string) => {
      if (!activeProject) throw new Error('No active project');
      const targetSpecialist = specialist || (selectedSpecialist === 'all' ? undefined : selectedSpecialist);
      const res = await triggerAssessment(
        activeProject.projectId,
        targetSpecialist ? 'agent' : 'full',
        targetSpecialist,
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
        <PageHeader
          breadcrumb="Projects > Agent Activity"
          title="Agent Activity"
          tagline="Watch specialist agents investigate your application, reasoning live with tool execution traces."
          quote="Autonomous agents reason through complex attack graphs in real time."
        />
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

  const getStepColor = (kind?: string) => {
    switch ((kind || '').toLowerCase()) {
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
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={`Projects > ${activeProject?.name || 'vulnerable-mern-app'} > Agent Activity`}
        title="Agent Activity"
        tagline="Watch specialist agents investigate your application, reasoning live with tool execution traces."
        quote="Autonomous agents reason through complex attack graphs in real time."
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. TRIGGER CONTROL BAR                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/80 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Launch Specialist:</span>
          <select
            value={selectedSpecialist}
            onChange={(e) => setSelectedSpecialist(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/70 px-3 py-1.5 text-xs font-semibold text-fg focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">ALL SPECIALISTS</option>
            <option value="discovery">Discovery Agent</option>
            <option value="bola">BOLA / IDOR Specialist</option>
            <option value="auth">Auth & BFLA Specialist</option>
            <option value="injection">Injection Specialist</option>
            <option value="mass_assignment">Mass Assignment Specialist</option>
          </select>
        </div>

        <button
          type="button"
          disabled={runAgentMutation.isPending}
          onClick={() => runAgentMutation.mutate()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
        >
          {runAgentMutation.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Starting Agent...</span>
            </>
          ) : (
            <>
              <Play className="size-3.5 fill-current" />
              <span>Launch Specialist</span>
            </>
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. RUN SELECTOR & STREAM STATUS                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/60 p-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase text-muted tracking-wider">Active Run:</span>
          <select
            value={activeStreamRunId || ''}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/80 px-3 py-1.5 font-mono text-xs text-fg focus:border-primary focus:outline-none cursor-pointer"
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

        <div className="flex items-center gap-3 text-xs">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1',
              runStatus === 'failed'
                ? 'bg-danger/10 border-danger/30 text-danger'
                : runStatus === 'completed'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : isStreaming
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-surface-alt border-border/80 text-muted',
            )}
          >
            {runStatus === 'failed' ? (
              <AlertTriangle className="size-3 text-danger" />
            ) : runStatus === 'completed' ? (
              <Check className="size-3 text-emerald-400" />
            ) : (
              <Radio className={cn('size-3', isStreaming ? 'text-primary animate-pulse' : 'text-muted')} />
            )}
            <span className="font-semibold text-[11px] uppercase tracking-wide">
              {runStatus === 'failed'
                ? 'RUN FAILED'
                : runStatus === 'completed'
                ? 'RUN COMPLETED'
                : isStreaming
                ? 'STREAMING LIVE'
                : 'STREAM IDLE'}
            </span>
          </div>
          <span className="text-muted font-mono">{streamSteps.length} steps recorded</span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. RUN ERROR BANNER (IF FAILED)                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedRun?.status === 'failed' && selectedRun?.error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-xs text-danger space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-danger text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Agent Execution Failed</span>
          </div>
          <p className="font-mono text-fg/90 whitespace-pre-wrap break-all text-[12px] bg-surface/70 rounded-xl p-3 border border-danger/20">
            {selectedRun.error}
          </p>
          {selectedRun.error.includes('429') && (
            <div className="text-muted text-[11.5px] space-y-1 pt-1">
              <p className="font-semibold text-fg">Google Gemini Free-Tier Rate Limit Quota:</p>
              <p>
                The free-tier API key allows up to 5 requests per minute. The engine now automatically pauses and backs off, but if your quota was fully exhausted, please wait 30–60 seconds before triggering the next agent run.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. MAIN EXECUTION TRACE CONSOLE                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/80 bg-surface/80 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3 text-xs font-semibold text-muted uppercase">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <span className="text-fg font-bold">Multi-Agent Reasoning & Tool Execution Stream</span>
          </div>
          <span className="font-mono text-[11px] text-muted">REAL-TIME SSE PIPELINE</span>
        </div>

        {streamSteps.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted space-y-4">
            <BrainCircuit className="size-12 text-muted/40 animate-pulse" />
            <div>
              <h3 className="text-sm font-semibold text-fg">No Agent Steps in Buffer</h3>
              <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                Select an assessment agent below to start autonomous AST graph traversal and dynamic vulnerability probing.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => runAgentMutation.mutate('bola')}
                disabled={runAgentMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface-alt/70 px-3 py-1.5 text-xs font-medium text-fg hover:border-primary/50 hover:bg-surface-alt cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="size-3.5 text-primary" />
                <span>Launch BOLA / IDOR Specialist</span>
              </button>
              <button
                type="button"
                onClick={() => runAgentMutation.mutate('injection')}
                disabled={runAgentMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface-alt/70 px-3 py-1.5 text-xs font-medium text-fg hover:border-primary/50 hover:bg-surface-alt cursor-pointer disabled:opacity-50"
              >
                <Flame className="size-3.5 text-amber-400" />
                <span>Launch Injection Specialist</span>
              </button>
              <button
                type="button"
                onClick={() => runAgentMutation.mutate('discovery')}
                disabled={runAgentMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface-alt/70 px-3 py-1.5 text-xs font-medium text-fg hover:border-primary/50 hover:bg-surface-alt cursor-pointer disabled:opacity-50"
              >
                <Bot className="size-3.5 text-purple-400" />
                <span>Launch Discovery Agent</span>
              </button>
            </div>
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
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface border border-border/80 font-mono text-[11px] font-bold text-muted">
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
                    <div className="mt-3 rounded-lg border border-border/80 bg-[#070c14] p-3 font-mono text-xs text-fg/90 overflow-x-auto">
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
