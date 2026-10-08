import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, NavLink } from 'react-router-dom';
import {
  FileSearch,
  Search,
  CheckCircle2,
  HelpCircle,
  Play,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchFindings, triggerVerification } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Findings() {
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialFindingId = searchParams.get('id') || null;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'regressed' | 'all'>('open');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(initialFindingId);

  const { data: findings, isLoading } = useQuery({
    queryKey: ['findings', activeProject?.projectId, statusFilter, severityFilter],
    queryFn: () => {
      if (!activeProject) return [];
      const st = statusFilter === 'all' ? undefined : statusFilter;
      const sv = severityFilter === 'all' ? undefined : severityFilter;
      return fetchFindings(activeProject.projectId, st, sv);
    },
    enabled: Boolean(activeProject),
  });

  const allFindings = useMemo(() => findings || [], [findings]);

  // Summary counts
  const summary = useMemo(() => {
    return {
      critical: allFindings.filter((f) => f.severity === 'critical').length,
      high: allFindings.filter((f) => f.severity === 'high').length,
      medium: allFindings.filter((f) => f.severity === 'medium').length,
      low: allFindings.filter((f) => f.severity === 'low').length,
      verified: allFindings.filter((f) => f.verificationResult?.result === 'CONFIRMED').length,
    };
  }, [allFindings]);

  const filteredFindings = useMemo(() => {
    return allFindings.filter((f) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        f.type.toLowerCase().includes(term) ||
        (f.attackPath?.narrative && f.attackPath.narrative.toLowerCase().includes(term)) ||
        (f.references?.owasp && f.references.owasp.toLowerCase().includes(term)) ||
        f.affectedNodes?.some((node) => node.toLowerCase().includes(term))
      );
    });
  }, [allFindings, searchTerm]);

  const selectedFinding = useMemo(() => {
    if (!filteredFindings.length) return null;
    if (selectedFindingId) {
      return allFindings.find((f) => f.id === selectedFindingId) || filteredFindings[0];
    }
    return filteredFindings[0];
  }, [filteredFindings, allFindings, selectedFindingId]);

  // Live trigger verification mutation
  const verifyMutation = useMutation({
    mutationFn: async (findingId: string) => {
      if (!activeProject) throw new Error('No active project');
      return triggerVerification({
        projectId: activeProject.projectId,
        findingId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['verifications'] });
    },
  });

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Findings</h1>
          <p className="mt-1 text-sm text-muted">
            All discovered security issues, ranked by risk and backed by real evidence.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <FileSearch className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Select or load a project repository to inspect security findings and verified vulnerabilities.
          </p>
        </div>
      </div>
    );
  }

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-danger/15 text-danger border-danger/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'low':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      default:
        return 'bg-surface-alt text-muted border-border';
    }
  };

  const verificationBadge = (res?: string) => {
    if (!res) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
          <HelpCircle className="size-3" /> Unverified
        </span>
      );
    }
    if (res === 'CONFIRMED') {
      return (
        <span className="flex items-center gap-1 rounded-full bg-danger/15 border border-danger/30 px-2 py-0.5 text-[10.5px] font-bold text-danger">
          <CheckCircle2 className="size-3" /> Confirmed Exploit
        </span>
      );
    }
    if (res === 'REJECTED') {
      return (
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-bold text-emerald-400">
          <CheckCircle2 className="size-3" /> Benign / Rejected
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10.5px] font-bold text-amber-400">
        <HelpCircle className="size-3" /> Inconclusive
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Findings</h1>
        <p className="mt-1 text-sm text-muted">
          All discovered security issues, ranked by risk and backed by real evidence.
        </p>
      </div>

      {/* Severity Summary Counters Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div
          onClick={() => {
            setSeverityFilter('critical');
            setStatusFilter('open');
          }}
          className="cursor-pointer rounded-xl border border-danger/30 bg-danger/5 p-3.5 hover:bg-danger/10 transition-colors"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-danger">Critical</div>
          <div className="mt-1 text-2xl font-extrabold text-danger">{summary.critical}</div>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('high');
            setStatusFilter('open');
          }}
          className="cursor-pointer rounded-xl border border-orange-500/30 bg-orange-500/5 p-3.5 hover:bg-orange-500/10 transition-colors"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-orange-400">High</div>
          <div className="mt-1 text-2xl font-extrabold text-orange-400">{summary.high}</div>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('medium');
            setStatusFilter('open');
          }}
          className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 hover:bg-amber-500/10 transition-colors"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Medium</div>
          <div className="mt-1 text-2xl font-extrabold text-amber-400">{summary.medium}</div>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('low');
            setStatusFilter('open');
          }}
          className="cursor-pointer rounded-xl border border-blue-500/30 bg-blue-500/5 p-3.5 hover:bg-blue-500/10 transition-colors"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Low</div>
          <div className="mt-1 text-2xl font-extrabold text-blue-400">{summary.low}</div>
        </div>

        <div
          onClick={() => {
            setSeverityFilter('all');
            setStatusFilter('all');
          }}
          className="cursor-pointer rounded-xl border border-border bg-surface p-3.5 hover:bg-surface-alt transition-colors"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Confirmed Exploits</div>
          <div className="mt-1 text-2xl font-extrabold text-fg">{summary.verified}</div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface/60 p-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search findings by title, CWE, OWASP, route..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border bg-surface-alt/70 py-1.5 pl-9 pr-3 text-sm text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Severity Selector */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border bg-surface-alt/70 px-3 py-1.5 text-xs font-semibold text-fg/90 focus:border-primary focus:outline-none"
        >
          <option value="all">ALL SEVERITIES</option>
          <option value="critical">CRITICAL ONLY</option>
          <option value="high">HIGH ONLY</option>
          <option value="medium">MEDIUM ONLY</option>
          <option value="low">LOW ONLY</option>
        </select>

        {/* Status Pills */}
        <div className="flex items-center gap-1 text-xs">
          {(['open', 'resolved', 'regressed', 'all'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium uppercase text-[11px] transition-colors',
                statusFilter === st ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
              )}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout: Findings List | Finding Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Findings List (6 cols) */}
        <div className="lg:col-span-6 space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
            <span>SHOWING {filteredFindings.length} FINDINGS</span>
            <span>STATUS: {statusFilter.toUpperCase()}</span>
          </div>

          {isLoading ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              Loading security findings...
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              No findings found matching filters.
            </div>
          ) : (
            filteredFindings.map((finding) => {
              const isSelected = selectedFinding?.id === finding.id;

              return (
                <div
                  key={finding.id}
                  onClick={() => setSelectedFindingId(finding.id)}
                  className={cn(
                    'group cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/50 hover:bg-surface-alt/40',
                    isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 bg-surface/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider',
                          severityBadge(finding.severity),
                        )}
                      >
                        {finding.severity}
                      </span>
                      <span className="font-semibold text-sm text-fg group-hover:text-primary transition-colors">
                        {finding.type}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {verificationBadge(finding.verificationResult?.result)}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-muted line-clamp-2">
                    {finding.attackPath?.narrative || 'Vulnerability detected during static and dynamic evaluation.'}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted border-t border-border/40 pt-2">
                    <div className="flex items-center gap-2 truncate max-w-[240px]">
                      {finding.affectedNodes?.[0] && (
                        <span className="truncate font-mono text-[10.5px] bg-surface-alt px-1.5 py-0.5 rounded">
                          {finding.affectedNodes[0]}
                        </span>
                      )}
                      {finding.references?.owasp && (
                        <span className="text-muted/80">{finding.references.owasp}</span>
                      )}
                    </div>

                    <span className="font-medium capitalize text-fg/70">
                      {finding.confidence} confidence
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Finding Drill-Down Details (6 cols) */}
        <div className="lg:col-span-6">
          {selectedFinding ? (
            <div className="sticky top-6 rounded-2xl border bg-surface/80 p-5 shadow-lg space-y-6">
              {/* Finding Title & Badges */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
                        severityBadge(selectedFinding.severity),
                      )}
                    >
                      {selectedFinding.severity}
                    </span>
                    <span className="rounded-md border bg-surface-alt px-2 py-1 text-xs font-medium text-fg uppercase">
                      Status: {selectedFinding.status}
                    </span>
                  </div>

                  {verificationBadge(selectedFinding.verificationResult?.result)}
                </div>

                <h2 className="mt-3 text-lg font-bold text-fg">
                  {selectedFinding.type}
                </h2>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {selectedFinding.references?.owasp && (
                    <span className="rounded bg-surface-alt px-2 py-0.5 font-medium text-fg">
                      {selectedFinding.references.owasp}
                    </span>
                  )}
                  {selectedFinding.references?.cwe && (
                    <span className="rounded bg-surface-alt px-2 py-0.5 font-mono text-muted">
                      CWE-{selectedFinding.references.cwe.join(', ')}
                    </span>
                  )}
                  <span className="text-muted">Discovered: {new Date(selectedFinding.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action Banner: Verify Exploit Button */}
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                <div>
                  <div className="text-xs font-bold text-fg">Sandbox Verification Engine</div>
                  <div className="text-[11.5px] text-muted">
                    Execute isolated exploit in Docker sandbox to confirm vulnerability.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={verifyMutation.isPending}
                  onClick={() => verifyMutation.mutate(selectedFinding.id)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {verifyMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 fill-current" /> Run Verification
                    </>
                  )}
                </button>
              </div>

              {/* Affected Graph Nodes */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Affected Target Components
                </div>
                <div className="space-y-1.5">
                  {selectedFinding.affectedNodes?.map((nodeId) => (
                    <div
                      key={nodeId}
                      className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2 text-xs"
                    >
                      <span className="font-mono text-fg">{nodeId}</span>
                      <NavLink
                        to={`/graph?finding=${encodeURIComponent(selectedFinding.id)}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        Locate <ExternalLink className="size-3" />
                      </NavLink>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence & Exploit Payload */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Exploit Evidence & Payload
                </div>

                {selectedFinding.evidence?.request ? (
                  <div className="space-y-2">
                    <div className="rounded-xl border bg-black/60 p-3 font-mono text-xs text-emerald-400 overflow-x-auto">
                      <div className="text-[10px] text-muted uppercase mb-1">HTTP Request:</div>
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(selectedFinding.evidence.request, null, 2)}
                      </pre>
                    </div>

                    {selectedFinding.evidence?.response && (
                      <div className="rounded-xl border bg-black/60 p-3 font-mono text-xs text-blue-400 overflow-x-auto">
                        <div className="text-[10px] text-muted uppercase mb-1">Server Response:</div>
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(selectedFinding.evidence.response, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-surface-alt/30 p-3 text-xs text-muted">
                    No active HTTP request proof recorded yet. Click "Run Verification" to trigger proof-of-exploit generation.
                  </div>
                )}
              </div>

              {/* Attack Narrative */}
              {selectedFinding.attackPath?.narrative && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                    Attack Path Narrative
                  </div>
                  <div className="rounded-xl border bg-surface-alt/30 p-3.5 text-xs text-fg leading-relaxed">
                    {selectedFinding.attackPath.narrative}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface/40 p-12 text-center text-muted">
              Select a finding to inspect vulnerability details, evidence, and verification status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
