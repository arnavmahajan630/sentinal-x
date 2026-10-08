import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Terminal,
  Copy,
  Check,
  RotateCw,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchVerifications, triggerVerification } from '@/lib/api';
import type { VerificationRun } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Verification() {
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const { data: runs, isLoading } = useQuery({
    queryKey: ['verifications', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchVerifications(activeProject.projectId) : []),
    enabled: Boolean(activeProject),
    refetchInterval: 5000,
  });

  const allRuns = useMemo<VerificationRun[]>(() => runs || [], [runs]);

  const selectedRun = useMemo(() => {
    if (!allRuns.length) return null;
    if (selectedRunId) {
      return allRuns.find((r) => r.id === selectedRunId || r.runId === selectedRunId) || allRuns[0];
    }
    return allRuns[0];
  }, [allRuns, selectedRunId]);

  const reVerifyMutation = useMutation({
    mutationFn: async (run: VerificationRun) => {
      if (!activeProject) throw new Error('No active project');
      return triggerVerification({
        projectId: activeProject.projectId,
        template: run.template,
        subject: { hypothesisId: run.hypothesisId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });

  // Generate a realistic copyable curl command from run evidence
  const curlCommand = useMemo(() => {
    if (!selectedRun?.evidence?.request) return 'curl -X GET http://localhost:4000/api/health';
    const req = selectedRun.evidence.request;
    const method = req.method || 'GET';
    const url = req.url || req.path || 'http://localhost:4000/api/endpoint';
    const headers = req.headers || {};
    let cmd = `curl -X ${method} "${url}"`;
    for (const [k, v] of Object.entries(headers)) {
      cmd += ` \\\n  -H "${k}: ${v}"`;
    }
    if (req.body) {
      cmd += ` \\\n  -d '${typeof req.body === 'string' ? req.body : JSON.stringify(req.body)}'`;
    }
    return cmd;
  }, [selectedRun]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Verification</h1>
          <p className="mt-1 text-sm text-muted">
            Automatically verify security findings with real exploits in a safe environment.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <FlaskConical className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Select or load a project repository to review automated sandbox exploit verifications.
          </p>
        </div>
      </div>
    );
  }

  // 5-step pipeline execution steps
  const pipelineSteps = [
    { title: 'Setup Sandbox Environment', subtitle: 'Docker container, network isolation' },
    { title: 'Reproduce Vulnerability State', subtitle: 'Seed tenant data & session fixtures' },
    { title: 'Execute Exploit Payload', subtitle: 'Send targeted attack vector' },
    { title: 'Validate Impact', subtitle: 'Assert unauthorized state change / leak' },
    { title: 'Generate Evidence', subtitle: 'Produce curl proof & forensic telemetry' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">Verification</h1>
            <p className="mt-1 text-sm text-muted">
              Automatically verify security findings with real exploits in an isolated sandbox.
            </p>
          </div>
          <div className="rounded-lg border bg-surface-alt/50 px-3 py-1.5 font-mono text-xs text-muted italic">
            "Don't just find vulnerabilities. Prove them."
          </div>
        </div>
      </div>

      {/* 5-Step Pipeline Overview Card (Matching verifcaiton.png) */}
      <div className="rounded-2xl border bg-surface/80 p-5 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-muted mb-4">
          Automated Exploit Verification Pipeline
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {pipelineSteps.map((step, idx) => {
            const isCompleted = selectedRun ? true : false;
            return (
              <div
                key={step.title}
                className={cn(
                  'relative rounded-xl border p-3.5 transition-colors',
                  isCompleted ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface-alt/30',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-white text-[11px] font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-[12px] font-bold text-fg truncate">{step.title}</span>
                </div>
                <p className="text-[11px] text-muted">{step.subtitle}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Split: Runs Table (6 cols) | Detail & Proof Inspector (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Runs List */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
            <span>VERIFICATION RUNS ({allRuns.length})</span>
            <span>AUTO-SYNC: ACTIVE</span>
          </div>

          {isLoading ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              Loading verification runs...
            </div>
          ) : allRuns.length === 0 ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              No verification runs recorded yet. Trigger verification from the Findings page.
            </div>
          ) : (
            allRuns.map((run) => {
              const isSelected = selectedRun?.id === run.id || selectedRun?.runId === run.runId;
              const isConfirmed = run.result === 'CONFIRMED';
              const isRejected = run.result === 'REJECTED';

              return (
                <div
                  key={run.id || run.runId}
                  onClick={() => setSelectedRunId(run.id || run.runId)}
                  className={cn(
                    'group cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/50 hover:bg-surface-alt/40',
                    isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 bg-surface/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="rounded-md border bg-surface-alt px-2 py-0.5 font-mono text-[11px] font-bold text-fg uppercase">
                        {run.template || 'EXPLOIT'}
                      </span>
                      <span className="truncate font-semibold text-sm text-fg">
                        Hypothesis: {run.hypothesisId?.slice(0, 16) || 'H-VULN'}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {isConfirmed ? (
                        <span className="flex items-center gap-1 rounded-full bg-danger/15 border border-danger/30 px-2 py-0.5 text-[10.5px] font-bold text-danger">
                          <CheckCircle2 className="size-3" /> CONFIRMED
                        </span>
                      ) : isRejected ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-bold text-emerald-400">
                          <XCircle className="size-3" /> REJECTED
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10.5px] font-bold text-amber-400">
                          <HelpCircle className="size-3" /> INCONCLUSIVE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-xs text-muted">
                    <span className="font-mono text-[11px]">
                      Run ID: {(run.runId || run.id).slice(0, 12)}
                    </span>
                    <span className="text-[11px]">
                      {run.finishedAt ? new Date(run.finishedAt).toLocaleTimeString() : 'Recent'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Exploit Proof Inspector */}
        <div className="lg:col-span-6">
          {selectedRun ? (
            <div className="sticky top-6 rounded-2xl border bg-surface/90 p-5 shadow-lg space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border bg-surface-alt px-2 py-0.5 font-mono text-xs font-bold text-fg">
                      {selectedRun.template}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase',
                        selectedRun.result === 'CONFIRMED'
                          ? 'bg-danger/15 text-danger border border-danger/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                      )}
                    >
                      {selectedRun.result}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-base text-fg">
                    Exploit Proof & Forensic Verification
                  </h3>
                </div>

                <button
                  type="button"
                  disabled={reVerifyMutation.isPending}
                  onClick={() => reVerifyMutation.mutate(selectedRun)}
                  className="flex items-center gap-1.5 rounded-lg border bg-surface-alt px-2.5 py-1.5 text-xs font-semibold text-fg hover:bg-surface hover:border-primary/50 transition-colors disabled:opacity-50"
                >
                  <RotateCw className={cn('size-3.5', reVerifyMutation.isPending && 'animate-spin')} />
                  Re-Verify
                </button>
              </div>

              {/* Live Curl Box */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                    <Terminal className="size-3.5 text-primary" />
                    <span>Proof of Concept Curl Command</span>
                  </div>
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    {copiedCurl ? (
                      <>
                        <Check className="size-3 text-emerald-400" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy Curl
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-xl border bg-black/80 p-3.5 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner">
                  <pre className="whitespace-pre-wrap">{curlCommand}</pre>
                </div>
              </div>

              {/* Request & Response Inspector Tabs */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Forensic HTTP Payload & Assertions
                </div>

                {/* Expected vs Actual */}
                {(selectedRun.evidence?.expected || selectedRun.evidence?.actual) && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                      <div className="font-bold text-blue-400 mb-1 text-[11px] uppercase">
                        Expected Secure Behavior
                      </div>
                      <div className="text-fg/90 font-mono text-[11.5px]">
                        {selectedRun.evidence.expected || 'HTTP 401 / 403 Access Denied'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-danger/30 bg-danger/5 p-3">
                      <div className="font-bold text-danger mb-1 text-[11px] uppercase">
                        Actual Observed Exploit
                      </div>
                      <div className="text-fg/90 font-mono text-[11.5px]">
                        {selectedRun.evidence.actual || 'HTTP 200 OK — Data Leaked'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Response payload body */}
                {selectedRun.evidence?.response && (
                  <div className="rounded-xl border bg-surface-alt/40 p-3 text-xs font-mono">
                    <div className="text-[10px] text-muted uppercase font-bold mb-1.5">
                      Response Data Payload
                    </div>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-[11px] text-fg/90">
                      {JSON.stringify(selectedRun.evidence.response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface/40 p-12 text-center text-muted">
              Select a verification run from the list to review the proof-of-concept curl command and HTTP trace.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
