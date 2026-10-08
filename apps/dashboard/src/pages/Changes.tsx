import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  GitCommit,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchChanges, toggleWatch } from '@/lib/api';
import type { ChangeSet } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Changes() {
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);

  const { data: changesData, isLoading } = useQuery({
    queryKey: ['changes', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchChanges(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
    refetchInterval: 5000,
  });

  const allChanges: ChangeSet[] = changesData?.changeSets || [];
  const isWatching = Boolean(changesData?.isWatching);

  const selectedChange =
    (selectedChangeId && allChanges.find((c) => c.id === selectedChangeId)) ||
    allChanges[0] ||
    null;

  // Toggle watcher mutation
  const watchMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop') => {
      if (!activeProject) throw new Error('No project');
      return toggleWatch(activeProject.projectId, action);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changes'] });
    },
  });

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Changes</h1>
          <p className="mt-1 text-sm text-muted">
            Code changes, their security impact, and how findings transition over time.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <GitBranch className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Select or load a project repository to track code mutations, git diff impact, and vulnerability transitions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Changes</h1>
          <p className="mt-1 text-sm text-muted">
            Code changes, their security impact, and how findings transition over time.
          </p>
        </div>

        {/* Watcher Toggle Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border bg-surface-alt px-2.5 py-1 text-xs">
            <span
              className={cn(
                'size-2 rounded-full',
                isWatching ? 'bg-emerald-400 animate-pulse' : 'bg-muted',
              )}
            />
            <span className={cn('font-medium', isWatching ? 'text-emerald-400' : 'text-muted')}>
              {isWatching ? 'WATCHER ACTIVE' : 'WATCHER IDLE'}
            </span>
          </div>

          <button
            type="button"
            disabled={watchMutation.isPending}
            onClick={() => watchMutation.mutate('start')}
            className="flex items-center gap-1.5 rounded-lg border bg-surface-alt px-3 py-1.5 text-xs font-semibold text-fg hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            <Eye className="size-3.5 text-emerald-400" /> Start
          </button>
          <button
            type="button"
            disabled={watchMutation.isPending}
            onClick={() => watchMutation.mutate('stop')}
            className="flex items-center gap-1.5 rounded-lg border bg-surface-alt px-3 py-1.5 text-xs font-semibold text-fg hover:border-rose-500/50 transition-colors disabled:opacity-50"
          >
            <EyeOff className="size-3.5 text-rose-400" /> Stop
          </button>
        </div>
      </div>

      {/* Main Split: Changes Timeline | Change Impact Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Change Sets List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
            <span>DETECTED CHANGE SETS ({allChanges.length})</span>
            <span>GIT HEAD: {activeProject.gitHead?.slice(0, 7) || 'HEAD'}</span>
          </div>

          {isLoading ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              Loading change history...
            </div>
          ) : allChanges.length === 0 ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              No code changes detected yet. File edits or new commits will appear here automatically.
            </div>
          ) : (
            allChanges.map((change) => {
              const isSelected = selectedChange?.id === change.id;
              const transitionsCount = change.transitions?.length || 0;

              return (
                <div
                  key={change.id}
                  onClick={() => setSelectedChangeId(change.id)}
                  className={cn(
                    'group cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/50 hover:bg-surface-alt/40',
                    isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 bg-surface/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GitCommit className="size-4 text-primary" />
                      <span className="font-mono text-xs font-bold text-fg">
                        {change.gitHead?.slice(0, 8) || 'commit-diff'}
                      </span>
                    </div>

                    <span className="rounded-full bg-surface-alt border px-2 py-0.5 text-[10px] font-bold text-muted uppercase">
                      {change.status}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-muted">
                    <span>
                      {(change.changedFiles || []).length} file{(change.changedFiles || []).length !== 1 ? 's' : ''} modified
                    </span>
                    {(change.impactedRoutes || []).length > 0 && (
                      <span className="ml-2 font-medium text-amber-400">
                        • {change.impactedRoutes.length} route{change.impactedRoutes.length > 1 ? 's' : ''} impacted
                      </span>
                    )}
                  </div>

                  {transitionsCount > 0 && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                      <ShieldCheck className="size-3.5" />
                      <span>{transitionsCount} finding state transition{transitionsCount > 1 ? 's' : ''}</span>
                    </div>
                  )}

                  <div className="mt-2 text-[10.5px] text-muted font-mono">
                    {new Date(change.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Detailed Impact Inspector (7 cols) */}
        <div className="lg:col-span-7">
          {selectedChange ? (
            <div className="sticky top-6 rounded-2xl border bg-surface/90 p-5 shadow-lg space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs text-fg">
                    <GitBranch className="size-4 text-primary" />
                    <span className="font-bold">Diff Analysis for Commit</span>
                    <span className="rounded bg-surface-alt px-1.5 py-0.5 font-bold">
                      {selectedChange.gitHead || 'HEAD'}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(selectedChange.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Incremental Re-index Metrics */}
              {selectedChange.reindexStats && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                    Incremental AST & Graph Re-Index Stats
                  </div>
                  <div className="grid grid-cols-4 gap-2.5 rounded-xl border bg-surface-alt/40 p-3 text-center text-xs">
                    <div>
                      <div className="text-muted text-[10.5px]">Files Indexed</div>
                      <div className="font-bold text-fg mt-0.5">{selectedChange.reindexStats.filesIndexed}</div>
                    </div>
                    <div>
                      <div className="text-muted text-[10.5px]">Nodes Changed</div>
                      <div className="font-bold text-fg mt-0.5">{selectedChange.reindexStats.nodesChanged}</div>
                    </div>
                    <div>
                      <div className="text-muted text-[10.5px]">Edges Changed</div>
                      <div className="font-bold text-fg mt-0.5">{selectedChange.reindexStats.edgesChanged}</div>
                    </div>
                    <div>
                      <div className="text-muted text-[10.5px]">Duration</div>
                      <div className="font-bold text-primary mt-0.5">{selectedChange.reindexStats.durationMs}ms</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modified Files */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Modified Files ({(selectedChange.changedFiles || []).length})
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(selectedChange.changedFiles || []).map((file) => (
                    <div
                      key={file}
                      className="flex items-center gap-2 rounded-lg border bg-surface-alt/30 px-3 py-1.5 font-mono text-xs text-fg"
                    >
                      <FileCode className="size-3.5 text-primary shrink-0" />
                      <span className="truncate">{file}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Finding Lifecycle Transitions */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Vulnerability State Transitions ({(selectedChange.transitions || []).length})
                </div>

                {!selectedChange.transitions || selectedChange.transitions.length === 0 ? (
                  <div className="rounded-xl border bg-surface-alt/30 p-3 text-xs text-muted text-center">
                    No finding lifecycle state transitions triggered by this change set.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedChange.transitions.map((t, idx) => {
                      const isResolved = t.toStatus === 'resolved';
                      const isRegressed = t.toStatus === 'regressed';

                      return (
                        <div
                          key={idx}
                          className={cn(
                            'rounded-xl border p-3 text-xs',
                            isResolved && 'border-emerald-500/30 bg-emerald-500/5',
                            isRegressed && 'border-danger/30 bg-danger/5',
                            !isResolved && !isRegressed && 'border-border bg-surface-alt/40',
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isResolved ? (
                                <CheckCircle2 className="size-4 text-emerald-400" />
                              ) : isRegressed ? (
                                <AlertTriangle className="size-4 text-danger" />
                              ) : (
                                <ShieldCheck className="size-4 text-primary" />
                              )}
                              <span className="font-bold uppercase text-[11px]">
                                {t.type}
                              </span>
                            </div>

                            <span className="font-mono text-[11px] font-semibold">
                              {t.fromStatus} ➔ <span className="uppercase">{t.toStatus}</span>
                            </span>
                          </div>

                          <div className="mt-1 text-muted text-[11.5px]">
                            {t.reason || 'Transition evaluated during code change re-verification.'}
                          </div>

                          {t.verificationResult && (
                            <div className="mt-1 font-mono text-[10px] text-muted">
                              Verification Outcome: {t.verificationResult}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface/40 p-12 text-center text-muted">
              Select a change set from the timeline to inspect its security impact and affected routes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
