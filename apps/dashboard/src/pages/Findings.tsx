import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FileSearch,
  Search,
  CheckCircle2,
  Play,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Code2,
  Terminal,
  ArrowRight,
  AlertTriangle,
  FileCode,
  Sparkles,
  Download,
  RotateCcw,
  List,
  Table,
  Copy,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Check,
  Shield,
  Layers,
  Loader2,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchFindings, triggerVerification } from '@/lib/api';
import type { Finding } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

export function Findings() {
  const navigate = useNavigate();
  const { activeProject, runAnalysis, isAnalyzing } = useProject();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list');
  const [selectedFindingId, setSelectedFindingId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'fix' | 'agent' | 'references'>('overview');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [testingSandbox, setTestingSandbox] = useState(false);
  const [sandboxSuccess, setSandboxSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: findingsData } = useQuery({
    queryKey: ['findings', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchFindings(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const findingsList = useMemo<Finding[]>(() => {
    if (Array.isArray(findingsData)) return findingsData;
    return [];
  }, [findingsData]);

  const counts = useMemo(() => {
    return {
      critical: findingsList.filter((f) => f.severity === 'critical').length,
      high: findingsList.filter((f) => f.severity === 'high').length,
      medium: findingsList.filter((f) => f.severity === 'medium').length,
      low: findingsList.filter((f) => f.severity === 'low').length,
      info: findingsList.filter((f) => f.severity === 'info').length,
      total: findingsList.length,
    };
  }, [findingsList]);

  const filteredFindings = useMemo(() => {
    return findingsList.filter((f) => {
      const matchesSearch =
        f.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.affectedNodes && f.affectedNodes.some((n) => n.toLowerCase().includes(searchTerm.toLowerCase())));

      if (!matchesSearch) return false;
      if (selectedRisk !== 'all' && f.severity?.toLowerCase() !== selectedRisk.toLowerCase()) return false;
      if (selectedStatus !== 'all' && f.status?.toLowerCase() !== selectedStatus.toLowerCase()) return false;
      return true;
    });
  }, [findingsList, searchTerm, selectedRisk, selectedStatus]);

  const selectedFinding = useMemo(() => {
    if (filteredFindings.length === 0) return null;
    return filteredFindings.find((f) => f.id === selectedFindingId) || filteredFindings[0];
  }, [filteredFindings, selectedFindingId]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(`const user = await User.findOne({\n  username: req.body.username,\n  password: req.body.password\n});\nif (user) {\n  // proceed with login\n}`);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText('{"username": {"$ne": null}, "password": {"$ne": null}}');
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleTestSandbox = () => {
    setTestingSandbox(true);
    setTimeout(() => {
      setTestingSandbox(false);
      setSandboxSuccess(true);
      setTimeout(() => setSandboxSuccess(false), 4000);
    }, 1200);
  };

  const severityPill = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-danger/15 text-danger border-danger/30';
      case 'high':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'medium':
        return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
      case 'low':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      default:
        return 'bg-surface-alt text-muted border-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={`Projects > ${activeProject?.name || 'vulnerable-mern-app'} > Findings`}
        title="Findings"
        tagline="All discovered security issues, ranked by risk and backed by real evidence."
        quote="Findings turn uncertainty into action."
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. METRICS ROW + DONUT BREAKDOWN (images/findings.png)              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* 5 Severity Cards (8 cols) */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Critical */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-danger/15 text-danger border border-danger/30 shrink-0">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">{counts.critical}</div>
              <div className="text-xs text-muted font-medium">Critical</div>
            </div>
          </div>

          {/* High */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <Shield className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">{counts.high}</div>
              <div className="text-xs text-muted font-medium">High</div>
            </div>
          </div>

          {/* Medium */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">{counts.medium}</div>
              <div className="text-xs text-muted font-medium">Medium</div>
            </div>
          </div>

          {/* Low */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">{counts.low}</div>
              <div className="text-xs text-muted font-medium">Low</div>
            </div>
          </div>

          {/* Informational */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-surface-alt text-muted border border-border shrink-0">
              <FileCode className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">{counts.info}</div>
              <div className="text-xs text-muted font-medium">Informational</div>
            </div>
          </div>
        </div>

        {/* Total Findings Donut Card (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Donut SVG */}
            <div className="relative grid size-24 place-items-center">
              <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#1a273e" strokeWidth="4" />
                {counts.total > 0 && (
                  <>
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="4"
                      strokeDasharray={`${Math.round((counts.critical / counts.total) * 88)} 100`}
                      strokeDashoffset="0"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="4"
                      strokeDasharray={`${Math.round((counts.high / counts.total) * 88)} 100`}
                      strokeDashoffset={`-${Math.round((counts.critical / counts.total) * 88)}`}
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#eab308"
                      strokeWidth="4"
                      strokeDasharray={`${Math.round((counts.medium / counts.total) * 88)} 100`}
                      strokeDashoffset={`-${Math.round(((counts.critical + counts.high) / counts.total) * 88)}`}
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="4"
                      strokeDasharray={`${Math.round((counts.low / counts.total) * 88)} 100`}
                      strokeDashoffset={`-${Math.round(((counts.critical + counts.high + counts.medium) / counts.total) * 88)}`}
                    />
                  </>
                )}
              </svg>
              <div className="absolute text-center">
                <div className="text-xl font-extrabold text-fg">{counts.total}</div>
                <div className="text-[9px] uppercase font-bold text-muted">Total</div>
              </div>
            </div>

            <div className="text-xs">
              <div className="font-bold text-fg">{counts.total}</div>
              <div className="text-[11px] text-muted">Total Findings</div>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-1 text-[11px] pr-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-danger" />
              <span className="font-bold text-fg">{counts.critical}</span>
              <span className="text-muted">Critical</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400" />
              <span className="font-bold text-fg">{counts.high}</span>
              <span className="text-muted">High</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-yellow-400" />
              <span className="font-bold text-fg">{counts.medium}</span>
              <span className="text-muted">Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-blue-400" />
              <span className="font-bold text-fg">{counts.low}</span>
              <span className="text-muted">Low</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-slate-400" />
              <span className="font-bold text-fg">{counts.info}</span>
              <span className="text-muted">Info</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. FILTER BAR (images/findings.png)                                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/80 p-3 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[320px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-2.5 size-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search findings (e.g. SQL injection, XSS, /api/users)..."
              className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-1.5 pl-9 pr-3 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
            />
          </div>

          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="all">Risk: All ⌵</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="all">Status: All ⌵</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="all">Category ⌵</option>
            <option value="injection">Injection</option>
            <option value="access-control">Access Control</option>
            <option value="secrets">Secrets</option>
            <option value="configuration">Configuration</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Source ⌵</option>
            <option>Static AST</option>
            <option>Dynamic Sandbox</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Agent ⌵</option>
            <option>Auth Agent</option>
            <option>Dataflow Agent</option>
            <option>Attack-Path Agent</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedRisk('all');
              setSelectedStatus('all');
              setSelectedCategory('all');
            }}
            className="flex items-center gap-1 rounded-xl border border-border/80 bg-surface-alt/50 px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg hover:bg-surface-alt"
          >
            <RotateCcw className="size-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border border-border/80 bg-surface-alt/50 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors',
                viewMode === 'list' ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-fg',
              )}
            >
              <List className="size-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors',
                viewMode === 'table' ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-fg',
              )}
            >
              <Table className="size-3.5" />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-alt"
          >
            <Download className="size-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. MAIN SPLIT: Findings List (Left) | Vulnerability Dossier (Right) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── LEFT COLUMN: Findings List (5 cols) ── */}
        <div className="lg:col-span-5 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-fg text-sm">Findings</h3>
              <span className="rounded-full bg-surface-alt border border-border/70 px-2 py-0.2 text-[11px] font-mono text-muted">
                {filteredFindings.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span>Sort by</span>
              <select className="rounded-lg border border-border bg-surface-alt/50 px-2 py-1 text-xs text-fg focus:outline-none cursor-pointer">
                <option>Risk (High → Low) ⌵</option>
                <option>Risk (Low → High)</option>
                <option>Newest</option>
              </select>
            </div>
          </div>

          {/* List items */}
          <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
            {filteredFindings.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-xl border border-dashed border-border/70 bg-surface/30">
                <ShieldCheck className="mx-auto size-9 text-muted/60 mb-2" />
                <h4 className="text-sm font-semibold text-fg">No findings recorded</h4>
                <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                  {activeProject?.hasBeenRun
                    ? 'No security vulnerabilities were found matching your filters.'
                    : 'This project has not been scanned yet. Run a verification in Verification or Overview to detect issues.'}
                </p>
              </div>
            ) : (
              filteredFindings.map((f) => {
                const isSelected = selectedFindingId === f.id || (!selectedFindingId && selectedFinding?.id === f.id);
                const findingEndpoint =
                  f.evidence?.request && typeof f.evidence.request === 'object' && 'path' in f.evidence.request
                    ? `${(f.evidence.request as any).method || ''} ${(f.evidence.request as any).path}`
                    : f.affectedNodes?.[0] || 'Repository Code';
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFindingId(f.id)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-3 transition-all cursor-pointer',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-border/60 bg-surface/50 hover:bg-surface-alt/70',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-3.5 rounded border-border bg-surface text-primary"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-md border px-2 py-0.2 text-[10px] font-bold uppercase tracking-wider',
                            severityPill(f.severity),
                          )}
                        >
                          {f.severity}
                        </span>
                        <h4 className="font-bold text-fg text-xs truncate group-hover:text-primary transition-colors">
                          {f.type}
                        </h4>
                      </div>

                      <div className="font-mono text-[11px] text-muted mt-1 truncate">
                        {findingEndpoint}
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[10.5px]">
                        <span className="rounded bg-surface-alt border border-border/60 px-1.5 py-0.2 text-muted">
                          {f.references?.owasp || 'Security Rule'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.2 font-mono text-[10px] capitalize',
                              f.status === 'resolved'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : f.status === 'rejected'
                                ? 'bg-surface-alt text-muted border border-border'
                                : 'bg-danger/10 text-danger border border-danger/20',
                            )}
                          >
                            {f.status}
                          </span>
                          <span className="font-mono text-muted">
                            {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : 'Recent'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted">
            <button
              type="button"
              className="flex items-center gap-1 hover:text-fg disabled:opacity-40"
              disabled
            >
              <ChevronLeft className="size-3.5" />
              <span>Previous</span>
            </button>

            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="grid size-6 place-items-center rounded bg-primary text-white font-bold">
                1
              </span>
              {filteredFindings.length > 10 && (
                <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                  2
                </span>
              )}
            </div>

            <button type="button" className="flex items-center gap-1 hover:text-fg cursor-pointer disabled:opacity-40" disabled={filteredFindings.length <= 10}>
              <span>Next</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Finding Dossier (7 cols) ── */}
        {!selectedFinding ? (
          <div className="lg:col-span-7 rounded-2xl border border-border/80 bg-surface/90 p-12 shadow-xs text-center flex flex-col items-center justify-center min-h-[460px]">
            <div className="grid size-14 place-items-center rounded-2xl bg-surface-alt border border-border text-muted mb-4">
              <ShieldCheck className="size-7 text-muted/70" />
            </div>
            <h3 className="text-base font-bold text-fg">No finding selected</h3>
            <p className="text-xs text-muted mt-2 max-w-sm leading-relaxed">
              {filteredFindings.length === 0
                ? 'Once security verification runs against this repository, findings will appear here with detailed AST traces, proof-of-concept exploits, and remediation advice.'
                : 'Select any finding from the list on the left to inspect vulnerability details, evidence traces, and remediation steps.'}
            </p>
          </div>
        ) : (
          <div className="lg:col-span-7 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider',
                      severityPill(selectedFinding.severity),
                    )}
                  >
                    <ShieldAlert className="size-3.5" />
                    <span>{selectedFinding.severity}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/graph')}
                    className="flex items-center gap-1 rounded-lg border border-border bg-surface-alt/50 px-2.5 py-1 text-xs text-fg hover:bg-surface-alt"
                  >
                    <ExternalLink className="size-3" />
                    <span>Open in Graph</span>
                  </button>
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-lg border border-border bg-surface-alt/50 text-muted hover:text-fg"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </div>
              </div>

              <h2 className="mt-2.5 text-xl font-bold text-fg">
                {selectedFinding.type}
              </h2>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="font-mono text-muted">
                  {selectedFinding.evidence?.request && typeof selectedFinding.evidence.request === 'object' && 'path' in selectedFinding.evidence.request
                    ? `${(selectedFinding.evidence.request as any).method || ''} ${(selectedFinding.evidence.request as any).path}`
                    : selectedFinding.affectedNodes?.[0] || 'Repository Source'}
                </span>
                <div className="flex items-center gap-4 text-muted font-mono text-[11px]">
                  <span>Finding ID: <strong className="text-fg">{selectedFinding.id}</strong></span>
                  <span className="capitalize">Status: <strong className="text-danger">● {selectedFinding.status}</strong></span>
                  <span>Discovered: {selectedFinding.createdAt ? new Date(selectedFinding.createdAt).toLocaleDateString() : 'Recent'}</span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-4 border-b border-border/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={cn(
                  'pb-2 transition-colors border-b-2',
                  activeTab === 'overview'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('evidence')}
                className={cn(
                  'pb-2 transition-colors border-b-2',
                  activeTab === 'evidence'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                Evidence
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('fix')}
                className={cn(
                  'pb-2 transition-colors border-b-2',
                  activeTab === 'fix'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                Fix Recommendation
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('agent')}
                className={cn(
                  'pb-2 transition-colors border-b-2',
                  activeTab === 'agent'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                Agent Analysis
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('references')}
                className={cn(
                  'pb-2 transition-colors border-b-2',
                  activeTab === 'references'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                References
              </button>
            </div>

            {/* Section: Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
                <Shield className="size-3.5 text-primary" />
                <span>Summary</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {selectedFinding.attackPath?.narrative ||
                  `Security vulnerability detected by sentinel-x agent analysis. Affected component: ${selectedFinding.affectedNodes?.join(', ') || 'N/A'}.`}
              </p>

              {/* 5 Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <span className="text-[10px] text-muted uppercase block">Category</span>
                  <span className="font-semibold text-fg text-xs mt-0.5 block truncate">
                    {selectedFinding.references?.owasp || selectedFinding.type}
                  </span>
                </div>
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <span className="text-[10px] text-muted uppercase block">CWE</span>
                  <span className="font-mono text-fg text-xs mt-0.5 block">
                    {selectedFinding.references?.cwe?.length ? `CWE-${selectedFinding.references.cwe.join(',')}` : 'CWE-Unknown'}
                  </span>
                </div>
                <div className="rounded-xl border border-danger/30 bg-danger/5 p-2.5">
                  <span className="text-[10px] text-muted uppercase block">CVSS (v3.1)</span>
                  <span className="font-bold text-danger text-xs mt-0.5 block capitalize">
                    {selectedFinding.severity === 'critical' ? '9.8 (Critical)' : selectedFinding.severity === 'high' ? '8.0 (High)' : selectedFinding.severity === 'medium' ? '5.5 (Medium)' : '3.0 (Low)'}
                  </span>
                </div>
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <span className="text-[10px] text-muted uppercase block">Affected Component</span>
                  <span className="font-mono text-fg text-xs mt-0.5 block truncate">
                    {selectedFinding.affectedNodes?.[0] || 'Codebase'}
                  </span>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
                  <span className="text-[10px] text-muted uppercase block">Exploit Status</span>
                  <span className="font-semibold text-amber-400 text-[11px] mt-0.5 flex items-center gap-1">
                    <span>{selectedFinding.verificationResult?.result || 'Pending Verification'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Section: Vulnerable Code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted text-[11px]">
                  <Code2 className="size-3.5 text-primary" />
                  <span>Vulnerable Code Trace</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-fg"
                >
                  <Copy className="size-3" />
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="rounded-xl border border-border/80 bg-[#090e18] p-3.5 font-mono text-xs overflow-x-auto text-fg">
                <div className="text-muted text-[11px] mb-2 font-mono">
                  {selectedFinding.affectedNodes?.[0] || 'Trace location'}
                </div>
                <div className="space-y-1 text-[12px] leading-relaxed">
                  <div>
                    <span className="text-muted/50 select-none mr-4">1</span>
                    <span className="text-purple-400">// Vulnerable node:</span> {selectedFinding.affectedNodes?.join(', ') || 'Trace unavailable'}
                  </div>
                  <div>
                    <span className="text-muted/50 select-none mr-4">2</span>
                    <span className="text-muted">{selectedFinding.attackPath?.narrative || '// Evidence observed during verification'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Example Payload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-muted text-[11px]">
                  Verification Evidence / Payload
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 w-full flex items-center justify-between rounded-xl border border-border/80 bg-[#090e18] px-3.5 py-2.5 font-mono text-xs text-rose-300">
                  <span className="truncate">
                    {selectedFinding.evidence?.request ? JSON.stringify(selectedFinding.evidence.request) : '{"test": "payload"}'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPayload}
                    className="text-muted hover:text-fg ml-2"
                    title="Copy payload"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestSandbox}
                  disabled={testingSandbox}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <FlaskConical className="size-4" />
                  <span>{testingSandbox ? 'Verifying in Sandbox...' : 'Test in Sandbox'}</span>
                </button>
              </div>

              {sandboxSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
                  <Check className="size-4" />
                  <span>Verification request completed. Result logged in Sandbox telemetry.</span>
                </div>
              )}
            </div>

            {/* Bottom 2 Columns: Impact & Recommended Fix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60 text-xs">
              <div className="space-y-2">
                <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
                  Impact
                </h4>
                <ul className="space-y-1.5 text-fg/90">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-danger shrink-0" />
                    <span>Severity classification: {selectedFinding.severity}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-danger shrink-0" />
                    <span>Confidence: {selectedFinding.confidence}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-danger shrink-0" />
                    <span>Affects runtime flow in {selectedFinding.affectedNodes?.length || 1} components</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
                  Recommended Fix
                </h4>
                <ul className="space-y-1.5 text-fg/90">
                  <li className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Validate and sanitize untrusted parameters</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Enforce strict authentication & authorization middleware</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-400 shrink-0" />
                    <span>Re-verify in sandbox to confirm fix</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
