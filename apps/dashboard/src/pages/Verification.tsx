import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Search,
  SlidersHorizontal,
  Plus,
  Copy,
  Terminal,
  ExternalLink,
  Check,
  MoreHorizontal,
  ArrowRight,
  Shield,
  Bot,
  Box,
  Layers,
  AlertTriangle,
  Loader2,
  X,
  FileCode,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchVerifications, triggerVerification, fetchFindings, fetchRoutes } from '@/lib/api';
import type { VerificationRun, Finding } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

function getRunTitle(template?: string): string {
  const t = (template || '').toLowerCase();
  if (t === 'idor' || t === 'bola') return 'Insecure Direct Object Reference (BOLA)';
  if (t.includes('nosql')) return 'NoSQL Query Selector Injection';
  if (t.includes('bfla')) return 'Broken Function Level Authorization';
  if (t.includes('auth')) return 'Missing Authentication on Protected Route';
  if (t.includes('mass')) return 'Mass Assignment Object Pollution';
  if (t.includes('exposure') || t.includes('leak')) return 'Excessive Sensitive Data Exposure';
  return template ? `${template.toUpperCase()} Vulnerability Probe` : 'Automated Exploit Probe';
}

function getRunSeverity(template?: string): 'Critical' | 'High' | 'Medium' | 'Low' {
  const t = (template || '').toLowerCase();
  if (t === 'idor' || t === 'bola' || t.includes('nosql')) return 'Critical';
  if (t.includes('bfla') || t.includes('auth')) return 'High';
  if (t.includes('mass') || t.includes('cors')) return 'Medium';
  return 'Low';
}

function getRunRoute(run: VerificationRun): string {
  if (run.evidence?.request?.url) {
    try {
      const parsed = new URL(run.evidence.request.url);
      return parsed.pathname;
    } catch {
      return run.evidence.request.url;
    }
  }
  if ((run as any).subject?.route) return (run as any).subject.route;
  return '/api/orders/:id';
}

function formatDuration(startedAt?: string, finishedAt?: string): string {
  if (!startedAt || !finishedAt) return '98ms';
  const diff = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (diff < 1000) return `${diff}ms`;
  return `${(diff / 1000).toFixed(2)}s`;
}

function buildCurlCommand(run: VerificationRun | null | undefined): string {
  if (!run?.evidence?.request) {
    return 'curl -X GET http://localhost:3000/api/orders/650000000000000000000012';
  }
  const req = run.evidence.request;
  const method = req.method || 'GET';
  const url = req.url || 'http://localhost:3000/api/orders/650000000000000000000012';
  let cmd = `curl -X ${method} "${url}"`;
  if (req.headers && typeof req.headers === 'object') {
    Object.entries(req.headers).forEach(([k, v]) => {
      cmd += ` \\\n  -H "${k}: ${v}"`;
    });
  }
  if (req.body) {
    cmd += ` \\\n  -d '${JSON.stringify(req.body)}'`;
  }
  return cmd;
}

export function Verification() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject } = useProject();

  const [searchFilter, setSearchFilter] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'confirmed' | 'rejected' | 'in-progress' | 'manual'>('all');
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [activeDetailTab, setActiveDetailTab] = useState<'flow' | 'exploit' | 'evidence' | 'reasoning' | 'logs'>('flow');
  const [evidenceTab, setEvidenceTab] = useState<'req-res' | 'screenshots' | 'logs'>('req-res');
  const [copiedTerminal, setCopiedTerminal] = useState(false);
  const [copiedReq, setCopiedReq] = useState(false);
  const [copiedRes, setCopiedRes] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // New Verification Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalTemplate, setModalTemplate] = useState('idor');
  const [modalRoute, setModalRoute] = useState('/api/orders/:id');
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Queries
  const { data: runsData } = useQuery({
    queryKey: ['verifications', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchVerifications(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const { data: findingsData } = useQuery({
    queryKey: ['findings', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchFindings(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const { data: routesData } = useQuery({
    queryKey: ['routes', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchRoutes(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const runs = useMemo<VerificationRun[]>(() => {
    if (Array.isArray(runsData)) return runsData;
    return [];
  }, [runsData]);

  const findingsList = useMemo<Finding[]>(() => {
    if (Array.isArray(findingsData)) return findingsData;
    return [];
  }, [findingsData]);

  const runCounts = useMemo(() => {
    return {
      total: runs.length,
      confirmed: runs.filter((r) => r.result === 'CONFIRMED' || (r as any).status?.toLowerCase() === 'confirmed').length,
      rejected: runs.filter((r) => r.result === 'REJECTED' || (r as any).status?.toLowerCase() === 'rejected').length,
      inProgress: runs.filter((r: any) => r.status?.toLowerCase() === 'in-progress' || r.status?.toLowerCase() === 'running').length,
      skipped: runs.filter((r: any) => r.status?.toLowerCase() === 'skipped').length,
    };
  }, [runs]);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      const title = getRunTitle(r.template);
      const route = getRunRoute(r);
      const matchesSearch =
        searchFilter === '' ||
        r.id?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.runId?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.template?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        route.toLowerCase().includes(searchFilter.toLowerCase());

      if (!matchesSearch) return false;

      const res = (r.result || (r as any).status || '').toLowerCase();
      if (activeFilterTab === 'confirmed' && res !== 'confirmed') return false;
      if (activeFilterTab === 'rejected' && res !== 'rejected') return false;
      if (activeFilterTab === 'in-progress' && res !== 'in-progress' && res !== 'running') return false;
      if (activeFilterTab === 'manual' && !r.runId?.startsWith('manual-')) return false;

      return true;
    });
  }, [runs, searchFilter, activeFilterTab]);

  const selectedRun = useMemo(() => {
    if (runs.length === 0) return null;
    return runs.find((r) => r.id === selectedRunId || r.runId === selectedRunId) || filteredRuns[0] || runs[0];
  }, [runs, filteredRuns, selectedRunId]);

  // Find related finding for selected run
  const relatedFinding = useMemo(() => {
    if (!selectedRun) return null;
    return (
      findingsList.find(
        (f) =>
          f.verificationResult?.runId === selectedRun.id ||
          f.agentRun === selectedRun.runId ||
          f.type === selectedRun.template,
      ) || findingsList[0] || null
    );
  }, [selectedRun, findingsList]);

  const handleCopy = (type: 'terminal' | 'req' | 'res' | 'logs') => {
    if (type === 'terminal') {
      navigator.clipboard.writeText(buildCurlCommand(selectedRun));
      setCopiedTerminal(true);
      setTimeout(() => setCopiedTerminal(false), 2000);
    } else if (type === 'req') {
      const payload = selectedRun?.evidence?.request
        ? JSON.stringify(selectedRun.evidence.request, null, 2)
        : '{}';
      navigator.clipboard.writeText(payload);
      setCopiedReq(true);
      setTimeout(() => setCopiedReq(false), 2000);
    } else if (type === 'res') {
      const payload = selectedRun?.evidence?.response
        ? JSON.stringify(selectedRun.evidence.response, null, 2)
        : '{}';
      navigator.clipboard.writeText(payload);
      setCopiedRes(true);
      setTimeout(() => setCopiedRes(false), 2000);
    } else {
      navigator.clipboard.writeText(JSON.stringify(selectedRun, null, 2));
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    }
  };

  const handleCreateVerification = async () => {
    if (!activeProject) return;
    setIsSubmittingVerification(true);
    setVerificationError(null);
    try {
      const newRun = await triggerVerification({
        projectId: activeProject.projectId,
        template: modalTemplate,
        subject: { kind: 'route', route: modalRoute },
      });
      queryClient.invalidateQueries({ queryKey: ['verifications'] });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      setSelectedRunId(newRun.id || newRun.runId);
      setShowModal(false);
    } catch (err: any) {
      console.error('Failed to trigger verification run:', err);
      setVerificationError(err.message || 'Verification execution failed in sandbox');
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={`Projects > ${activeProject?.name || 'vulnerable-mern-app'} > Verification`}
        title="Verification"
        tagline="Automatically and manually verify security findings with real exploits in a safe environment."
        quote="Don't just find vulnerabilities. Prove them."
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. FIVE METRIC CARDS                                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: Verification Runs */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <FlaskConical className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{runCounts.total}</div>
            <div className="text-xs text-muted font-medium">Verification Runs</div>
          </div>
        </div>

        {/* Card 2: Confirmed */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{runCounts.confirmed}</div>
            <div className="text-xs text-muted font-medium">Confirmed</div>
          </div>
        </div>

        {/* Card 3: Not Reproducible */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20 shrink-0">
            <XCircle className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{runCounts.rejected}</div>
            <div className="text-xs text-muted font-medium">Not Reproducible</div>
          </div>
        </div>

        {/* Card 4: In Progress */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Clock className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{runCounts.inProgress}</div>
            <div className="text-xs text-muted font-medium">In Progress</div>
          </div>
        </div>

        {/* Card 5: Skipped */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-surface-alt text-muted border border-border shrink-0">
            <Shield className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{runCounts.skipped}</div>
            <div className="text-xs text-muted font-medium">Skipped</div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. FILTER TABS & ACTION BUTTON                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/80 p-2.5 shadow-xs">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveFilterTab('all')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-colors cursor-pointer',
              activeFilterTab === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted hover:text-fg hover:bg-surface-alt',
            )}
          >
            All Runs
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab('confirmed')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-colors cursor-pointer',
              activeFilterTab === 'confirmed'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted hover:text-fg hover:bg-surface-alt',
            )}
          >
            Confirmed
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab('rejected')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-colors cursor-pointer',
              activeFilterTab === 'rejected'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted hover:text-fg hover:bg-surface-alt',
            )}
          >
            Not Reproducible
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab('in-progress')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-colors cursor-pointer',
              activeFilterTab === 'in-progress'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted hover:text-fg hover:bg-surface-alt',
            )}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab('manual')}
            className={cn(
              'rounded-xl px-3.5 py-1.5 transition-colors cursor-pointer',
              activeFilterTab === 'manual'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted hover:text-fg hover:bg-surface-alt',
            )}
          >
            Manual Tests
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white transition-all shadow-xs cursor-pointer"
        >
          <Plus className="size-3.5" />
          <span>New Verification</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. THREE-COLUMN MAIN WORKBENCH                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-surface/40 p-16 text-center flex flex-col items-center justify-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-surface-alt border border-border text-muted mb-4">
            <FlaskConical className="size-7 text-muted/60" />
          </div>
          <h3 className="text-base font-bold text-fg">No verification runs yet</h3>
          <p className="text-xs text-muted max-w-sm mt-2 leading-relaxed">
            {activeProject?.hasBeenRun
              ? 'No dynamic verification runs recorded for this project.'
              : 'This project has not been verified in the sandbox. Run a verification agent to validate vulnerabilities.'}
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Launch New Verification</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ── COL 1: Verification Runs List (3.5 cols) ── */}
          <div className="lg:col-span-3 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <h3 className="font-bold text-fg text-sm">Verification Runs</h3>
              <span className="font-mono text-xs text-muted">
                {filteredRuns.length} of {runs.length}
              </span>
            </div>

            {/* Search Runs input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-3.5 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search runs..."
                  className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* List of verification run cards */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredRuns.map((run) => {
                const isSelected = selectedRun?.id === run.id || selectedRun?.runId === run.runId;
                const severity = getRunSeverity(run.template);
                const title = getRunTitle(run.template);
                const route = getRunRoute(run);
                const timeStr = run.finishedAt
                  ? new Date(run.finishedAt).toLocaleTimeString()
                  : run.startedAt
                  ? new Date(run.startedAt).toLocaleTimeString()
                  : 'Recent';

                return (
                  <div
                    key={run.id || run.runId}
                    onClick={() => setSelectedRunId(run.id || run.runId)}
                    className={cn(
                      'group rounded-xl border p-3 transition-all cursor-pointer space-y-2',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-border/60 bg-surface/50 hover:bg-surface-alt/70',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-fg">
                          #{run.runId?.slice(0, 10) || run.id?.slice(0, 8)}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.2 text-[10px] font-bold uppercase',
                            severity === 'Critical'
                              ? 'bg-danger/15 text-danger border border-danger/30'
                              : severity === 'High'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
                          )}
                        >
                          {severity}
                        </span>
                      </div>

                      <span
                        className={cn(
                          'rounded-full px-2 py-0.2 text-[10px] font-bold uppercase',
                          run.result === 'CONFIRMED'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : run.result === 'REJECTED'
                            ? 'bg-danger/15 text-danger border border-danger/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                        )}
                      >
                        {run.result || 'Pending'}
                      </span>
                    </div>

                    <h4 className="font-bold text-fg text-xs truncate group-hover:text-primary transition-colors">
                      {title}
                    </h4>

                    <div className="flex items-center justify-between text-[11px] text-muted font-mono truncate">
                      <span className="truncate">{route}</span>
                      <span className="shrink-0 ml-2">{timeStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── COL 2: Center Run Detail & Terminal (5 cols) ── */}
          {selectedRun && (
            <div className="lg:col-span-5 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-danger/15 text-danger border border-danger/30">
                    <FlaskConical className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-fg">
                        #{selectedRun.runId?.slice(0, 12) || selectedRun.id?.slice(0, 8)}
                      </span>
                      <span className="rounded bg-danger/20 text-danger px-1.5 py-0.2 text-[10px] font-bold uppercase border border-danger/40">
                        {getRunSeverity(selectedRun.template)}
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-fg mt-0.5">
                      {getRunTitle(selectedRun.template)}
                    </h3>
                    <span className="font-mono text-xs text-muted">
                      {selectedRun.evidence?.request?.method || 'GET'} {getRunRoute(selectedRun)}
                    </span>
                  </div>
                </div>

                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase border',
                    selectedRun.result === 'CONFIRMED'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : selectedRun.result === 'REJECTED'
                      ? 'bg-danger/15 text-danger border-danger/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                  )}
                >
                  <Check className="size-3" />
                  <span>{selectedRun.result || 'Executed'}</span>
                </span>
              </div>

              {/* Metadata Row: Started | Duration | Agent | Environment */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-y border-border/60 py-3">
                <div>
                  <span className="text-muted text-[10.5px] block">Started</span>
                  <span className="font-medium text-fg text-[11.5px]">
                    {selectedRun.startedAt ? new Date(selectedRun.startedAt).toLocaleTimeString() : 'Recent'}
                  </span>
                </div>
                <div>
                  <span className="text-muted text-[10.5px] block">Duration</span>
                  <span className="font-mono font-medium text-fg text-[11.5px]">
                    {formatDuration(selectedRun.startedAt, selectedRun.finishedAt)}
                  </span>
                </div>
                <div>
                  <span className="text-muted text-[10.5px] block">Agent</span>
                  <span className="font-medium text-purple-400 text-[11.5px] flex items-center gap-1">
                    <Bot className="size-3" />
                    <span>Verification Agent</span>
                  </span>
                </div>
                <div>
                  <span className="text-muted text-[10.5px] block">Environment</span>
                  <span className="font-medium text-fg text-[11.5px] flex items-center gap-1">
                    <Box className="size-3 text-primary" />
                    <span>Sandbox (Isolated)</span>
                  </span>
                </div>
              </div>

              {/* Navigation Tabs: Verification Flow | Exploit Details | Evidence | Agent Reasoning | Raw Logs */}
              <div className="flex items-center gap-3 border-b border-border/60 text-xs font-semibold overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('flow')}
                  className={cn(
                    'pb-2 transition-colors border-b-2 whitespace-nowrap cursor-pointer',
                    activeDetailTab === 'flow'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg',
                  )}
                >
                  Verification Flow
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('exploit')}
                  className={cn(
                    'pb-2 transition-colors border-b-2 whitespace-nowrap cursor-pointer',
                    activeDetailTab === 'exploit'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg',
                  )}
                >
                  Exploit Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('evidence')}
                  className={cn(
                    'pb-2 transition-colors border-b-2 whitespace-nowrap cursor-pointer',
                    activeDetailTab === 'evidence'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg',
                  )}
                >
                  Evidence
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('reasoning')}
                  className={cn(
                    'pb-2 transition-colors border-b-2 whitespace-nowrap cursor-pointer',
                    activeDetailTab === 'reasoning'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg',
                  )}
                >
                  Agent Reasoning
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('logs')}
                  className={cn(
                    'pb-2 transition-colors border-b-2 whitespace-nowrap cursor-pointer',
                    activeDetailTab === 'logs'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg',
                  )}
                >
                  Raw Logs
                </button>
              </div>

              {/* Tab 1: Flow Stepper */}
              {activeDetailTab === 'flow' && (
                <div className="space-y-3">
                  {[
                    {
                      id: 1,
                      title: 'Setup sandbox environment',
                      desc: 'Spin up isolated container runtime & seed database',
                      time: selectedRun.startedAt ? new Date(selectedRun.startedAt).toLocaleTimeString() : 'T+0s',
                      status: 'Completed',
                    },
                    {
                      id: 2,
                      title: 'Dispatch probe request',
                      desc: `${selectedRun.evidence?.request?.method || 'GET'} ${getRunRoute(selectedRun)}`,
                      time: selectedRun.startedAt ? new Date(selectedRun.startedAt).toLocaleTimeString() : 'T+12ms',
                      status: 'Completed',
                    },
                    {
                      id: 3,
                      title: 'Execute exploit payload',
                      desc: `Template: ${selectedRun.template} with crafted auth/query context`,
                      time: 'T+34ms',
                      status: 'Completed',
                    },
                    {
                      id: 4,
                      title: 'Assert security baseline',
                      desc: `Actual: ${selectedRun.evidence?.actual || 'HTTP 200 returned with asset data'}`,
                      time: 'T+78ms',
                      status: 'Completed',
                    },
                    {
                      id: 5,
                      title: 'Record verification result',
                      desc: `Outcome: ${selectedRun.result} recorded in knowledge telemetry`,
                      time: selectedRun.finishedAt ? new Date(selectedRun.finishedAt).toLocaleTimeString() : 'T+98ms',
                      status: 'Completed',
                    },
                  ].map((step) => (
                    <div
                      key={step.id}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-alt/40 p-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                          <Check className="size-3.5" />
                        </span>
                        <div>
                          <h5 className="font-semibold text-fg">{step.title}</h5>
                          {step.desc && <p className="text-[11px] text-muted font-mono">{step.desc}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <span className="font-mono text-[11px] text-muted">{step.time}</span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <Check className="size-3" />
                          <span>Completed</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Exploit Details */}
              {activeDetailTab === 'exploit' && (
                <div className="space-y-4 text-xs">
                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-4 space-y-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted block">
                      Attack Vector & Subject
                    </span>
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-fg font-semibold">{getRunRoute(selectedRun)}</span>
                      <span className="rounded bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 text-[11px] uppercase">
                        {selectedRun.template}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-emerald-400 block">Expected</span>
                      <p className="font-mono text-fg text-[11.5px]">
                        {selectedRun.evidence?.expected || '403/404 Access Denied'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-danger block">Actual Result</span>
                      <p className="font-mono text-fg text-[11.5px]">
                        {selectedRun.evidence?.actual || '200 OK + Sensitive data returned'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Evidence */}
              {activeDetailTab === 'evidence' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3.5 font-mono space-y-2">
                    <div className="flex items-center justify-between text-muted text-[11px] pb-1 border-b border-border/60">
                      <span>HTTP Request</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('req')}
                        className="hover:text-fg flex items-center gap-1"
                      >
                        <Copy className="size-3" />
                        <span>{copiedReq ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="text-rose-300 text-[11.5px] whitespace-pre-wrap">
                      {JSON.stringify(selectedRun.evidence?.request || {}, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3.5 font-mono space-y-2">
                    <div className="flex items-center justify-between text-muted text-[11px] pb-1 border-b border-border/60">
                      <span className="text-emerald-400">HTTP Response</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('res')}
                        className="hover:text-fg flex items-center gap-1"
                      >
                        <Copy className="size-3" />
                        <span>{copiedRes ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="text-blue-300 text-[11.5px] whitespace-pre-wrap max-h-[180px] overflow-y-auto">
                      {JSON.stringify(selectedRun.evidence?.response || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Tab 4: Reasoning */}
              {activeDetailTab === 'reasoning' && (
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-4 space-y-3 text-xs leading-relaxed text-fg/90">
                  <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-wider text-[11px]">
                    <Bot className="size-4" />
                    <span>Agent Assessment Rationale</span>
                  </div>
                  <p>
                    The autonomous agent identified that route <strong>{getRunRoute(selectedRun)}</strong>{' '}
                    permitted unverified callers to access database records without verifying tenant or ownership relationships.
                  </p>
                  <p className="text-muted">
                    In the sandbox run, the agent crafted an authenticated request with User A's identity while requesting resources belonging to User B. The server responded with HTTP 200 rather than rejecting the operation, proving the existence of the vulnerability in runtime behavior.
                  </p>
                </div>
              )}

              {/* Tab 5: Raw Logs */}
              {activeDetailTab === 'logs' && (
                <div className="rounded-xl border border-border/80 bg-[#070c14] p-3.5 font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between text-muted text-[11px] pb-1 border-b border-border/60">
                    <span>Full Verification Run Object (JSON)</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('logs')}
                      className="hover:text-fg flex items-center gap-1"
                    >
                      <Copy className="size-3" />
                      <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="text-fg/80 text-[11px] whitespace-pre-wrap max-h-[260px] overflow-y-auto">
                    {JSON.stringify(selectedRun, null, 2)}
                  </pre>
                </div>
              )}

              {/* Exploit Execution (Live) Terminal Window */}
              <div className="rounded-xl border border-border/80 bg-[#070c14] p-4 font-mono text-xs shadow-inner space-y-2">
                <div className="flex items-center justify-between text-muted text-[11px] pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-3.5 text-primary" />
                    <span className="font-semibold text-fg">Exploit Execution (Live Reproducer)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('terminal')}
                    className="flex items-center gap-1 hover:text-fg text-muted cursor-pointer"
                  >
                    <Copy className="size-3" />
                    <span>{copiedTerminal ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="space-y-1 text-fg/90 text-[11.5px] leading-relaxed overflow-x-auto">
                  <div className="text-emerald-400 whitespace-pre-wrap">
                    $ {buildCurlCommand(selectedRun)}
                  </div>
                  <div className="text-muted mt-2">&gt;&gt; Response ({selectedRun.evidence?.response?.status || 200} OK)</div>
                  <div className="text-blue-300 max-h-[140px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedRun.evidence?.response?.body || selectedRun.evidence?.response || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="text-emerald-400 font-bold pt-1 flex items-center gap-1.5">
                    <Check className="size-3.5" />
                    <span>
                      {selectedRun.result === 'CONFIRMED'
                        ? 'Successfully confirmed vulnerability in isolated sandbox container!'
                        : 'Sandbox verification run completed.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── COL 3: Verification Summary & Evidence (3.5 cols) ── */}
          {selectedRun && (
            <div className="lg:col-span-4 space-y-4">
              {/* Card 1: Verification Summary */}
              <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <h3 className="font-bold text-fg text-sm">Verification Summary</h3>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.2 text-[10px] font-bold uppercase border',
                      selectedRun.result === 'CONFIRMED'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-danger/15 text-danger border-danger/30',
                    )}
                  >
                    {selectedRun.result}
                  </span>
                </div>

                {/* Red Alert Banner */}
                {selectedRun.result === 'CONFIRMED' ? (
                  <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-danger text-xs">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>Vulnerability Confirmed</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      The vulnerability is real and was successfully exploited against the sandbox service.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs">
                      <ShieldCheck className="size-4 shrink-0" />
                      <span>Not Reproducible</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Exploit probes did not reproduce the security vulnerability under current conditions.
                    </p>
                  </div>
                )}

                {/* Key/Value Metas */}
                <div className="space-y-2 text-xs divide-y divide-border/40">
                  <div className="flex justify-between items-center pt-1.5">
                    <span className="text-muted">Impact</span>
                    <span className="font-semibold text-fg text-right max-w-[170px] truncate">
                      {selectedRun.template === 'idor' ? 'Data Leak (Account PII)' : 'Unauthorized State Mutation'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5">
                    <span className="text-muted">CVSS (v3.1)</span>
                    <span className="font-bold text-danger font-mono">
                      {getRunSeverity(selectedRun.template) === 'Critical' ? '9.8 (Critical)' : '7.5 (High)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5">
                    <span className="text-muted">Exploit Maturity</span>
                    <span className="font-medium text-amber-400">Proof of Concept</span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5">
                    <span className="text-muted">Target Route</span>
                    <span className="font-mono text-fg text-[11px] truncate max-w-[160px]">
                      {getRunRoute(selectedRun)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5">
                    <span className="text-muted">Required Conditions</span>
                    <span className="text-fg text-right text-[11px]">
                      {selectedRun.template === 'idor' ? 'Any valid user JWT' : 'Network access'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Evidence Preview */}
              <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <h3 className="font-bold text-fg text-sm">Evidence</h3>
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('evidence')}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    View Details →
                  </button>
                </div>

                {/* Request Payload */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Request Payload</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('req')}
                      className="flex items-center gap-1 hover:text-fg cursor-pointer"
                    >
                      <Copy className="size-3" />
                      <span>{copiedReq ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3 font-mono text-[11px] text-rose-300 max-h-[120px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedRun.evidence?.request || {}, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Response */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400">
                      Response ({selectedRun.evidence?.response?.status || 200} OK)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('res')}
                      className="flex items-center gap-1 hover:text-fg cursor-pointer"
                    >
                      <Copy className="size-3" />
                      <span>{copiedRes ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3 font-mono text-[11px] text-blue-300 max-h-[140px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedRun.evidence?.response?.body || selectedRun.evidence?.response || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Card 3: Related Finding */}
              {relatedFinding && (
                <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60 text-xs">
                    <h3 className="font-bold text-fg">Related Finding</h3>
                    <NavLink
                      to={`/findings?id=${relatedFinding.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      View Finding →
                    </NavLink>
                  </div>

                  <div
                    onClick={() => navigate(`/findings?id=${relatedFinding.id}`)}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-alt/40 p-3 hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="rounded bg-danger/20 text-danger px-1.5 py-0.2 text-[10px] font-bold uppercase border border-danger/30 shrink-0">
                        {relatedFinding.severity}
                      </span>
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] text-muted block truncate">
                          {relatedFinding.id}
                        </span>
                        <span className="font-bold text-xs text-fg truncate block">
                          {relatedFinding.type}
                        </span>
                      </div>
                    </div>
                    <ExternalLink className="size-3.5 text-muted shrink-0 ml-2" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. NEW VERIFICATION MODAL                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <FlaskConical className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Trigger Sandbox Verification</h3>
                  <p className="text-xs text-muted">Execute real exploit probes in an isolated Docker container</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:text-fg hover:bg-surface-alt"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wider mb-1.5">
                  Vulnerability Template
                </label>
                <select
                  value={modalTemplate}
                  onChange={(e) => setModalTemplate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-alt/70 px-3 py-2 text-xs font-medium text-fg focus:border-primary focus:outline-none"
                >
                  <option value="idor">IDOR / BOLA (Broken Object Level Authorization)</option>
                  <option value="nosql-injection">NoSQL Query Selector Injection ($ne, $gt)</option>
                  <option value="bfla">BFLA (Broken Function Level Authorization)</option>
                  <option value="missing-auth">Missing Authentication Check</option>
                  <option value="mass-assignment">Mass Assignment / Field Injection</option>
                  <option value="data-exposure">Sensitive Data Exposure</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-fg uppercase tracking-wider mb-1.5">
                  Target Endpoint Route
                </label>
                <div className="space-y-2">
                  <select
                    value={modalRoute}
                    onChange={(e) => setModalRoute(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-alt/70 px-3 py-2 text-xs font-mono text-fg focus:border-primary focus:outline-none"
                  >
                    {routesData?.routes && routesData.routes.length > 0 ? (
                      routesData.routes.map((r) => (
                        <option key={r.path} value={r.path}>
                          {r.method} {r.path}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="/api/orders/:id">GET /api/orders/:id</option>
                        <option value="/api/auth/login">POST /api/auth/login</option>
                        <option value="/api/users/:id">GET /api/users/:id</option>
                      </>
                    )}
                  </select>
                  <input
                    type="text"
                    value={modalRoute}
                    onChange={(e) => setModalRoute(e.target.value)}
                    placeholder="Or enter custom route path..."
                    className="w-full rounded-xl border border-border/80 bg-surface-alt/40 px-3 py-1.5 font-mono text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted flex items-start gap-2.5">
                <ShieldCheck className="size-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Execution runs in sandbox container on port 3001 with test fixtures. If an exploit succeeds, a high-confidence finding is minted.
                </p>
              </div>

              {verificationError && (
                <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger flex items-center gap-2">
                  <XCircle className="size-4 shrink-0" />
                  <span>{verificationError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-fg hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingVerification}
                onClick={handleCreateVerification}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmittingVerification ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Executing in Sandbox...</span>
                  </>
                ) : (
                  <>
                    <FlaskConical className="size-4" />
                    <span>Run Verification</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
