import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchVerifications, triggerVerification } from '@/lib/api';
import type { VerificationRun } from '@/lib/api';
import { DEMO_VERIFICATIONS } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

export function Verification() {
  const navigate = useNavigate();
  const { activeProject } = useProject();

  const [searchFilter, setSearchFilter] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'confirmed' | 'rejected' | 'in-progress' | 'manual'>('all');
  const [selectedRunId, setSelectedRunId] = useState<string>('VR-012');
  const [activeDetailTab, setActiveDetailTab] = useState<'flow' | 'exploit' | 'evidence' | 'reasoning' | 'logs'>('flow');
  const [evidenceTab, setEvidenceTab] = useState<'req-res' | 'screenshots' | 'logs'>('req-res');
  const [copiedTerminal, setCopiedTerminal] = useState(false);
  const [copiedReq, setCopiedReq] = useState(false);
  const [copiedRes, setCopiedRes] = useState(false);

  const { data: runsData } = useQuery({
    queryKey: ['verifications', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchVerifications(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const runs = useMemo<VerificationRun[]>(() => {
    if (Array.isArray(runsData) && runsData.length > 0) return runsData;
    return DEMO_VERIFICATIONS;
  }, [runsData]);

  const handleCopy = (type: 'terminal' | 'req' | 'res') => {
    if (type === 'terminal') {
      navigator.clipboard.writeText(
        `curl -X POST http://localhost:3000/api/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"username": {"$ne": null}, "password": {"$ne": null}}'`,
      );
      setCopiedTerminal(true);
      setTimeout(() => setCopiedTerminal(false), 2000);
    } else if (type === 'req') {
      navigator.clipboard.writeText('{\n  "username": { "$ne": null },\n  "password": { "$ne": null }\n}');
      setCopiedReq(true);
      setTimeout(() => setCopiedReq(false), 2000);
    } else {
      navigator.clipboard.writeText('{\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n  "user": {\n    "id": "64f1a2b3c4d5e6f7g8h9i0j1",\n    "username": "admin",\n    "role": "admin"\n  }\n}');
      setCopiedRes(true);
      setTimeout(() => setCopiedRes(false), 2000);
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
      {/* 2. FIVE METRIC CARDS (images/verifcaiton.png)                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: 12 Verification Runs */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <FlaskConical className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">12</div>
            <div className="text-xs text-muted font-medium">Verification Runs</div>
          </div>
        </div>

        {/* Card 2: 8 Confirmed */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">8</div>
            <div className="text-xs text-muted font-medium">Confirmed</div>
          </div>
        </div>

        {/* Card 3: 2 Not Reproducible */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20 shrink-0">
            <XCircle className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">2</div>
            <div className="text-xs text-muted font-medium">Not Reproducible</div>
          </div>
        </div>

        {/* Card 4: 1 In Progress */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Clock className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">1</div>
            <div className="text-xs text-muted font-medium">In Progress</div>
          </div>
        </div>

        {/* Card 5: 1 Skipped */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-surface-alt text-muted border border-border shrink-0">
            <Shield className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">1</div>
            <div className="text-xs text-muted font-medium">Skipped</div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. FILTER TABS & ACTION BUTTON (images/verifcaiton.png)             */}
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
          className="flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white transition-all shadow-xs"
        >
          <Plus className="size-3.5" />
          <span>New Verification</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. THREE-COLUMN MAIN WORKBENCH (images/verifcaiton.png)             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── COL 1: Verification Runs List (3.5 cols) ── */}
        <div className="lg:col-span-3 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h3 className="font-bold text-fg text-sm">Verification Runs</h3>
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
            <button
              type="button"
              className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface-alt/50 text-muted hover:text-fg"
            >
              <SlidersHorizontal className="size-3.5" />
            </button>
          </div>

          {/* List of verification run cards */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {[
              {
                id: 'VR-012',
                severity: 'Critical',
                title: 'NoSQL Injection in User Login',
                time: '2 minutes ago',
                status: 'Confirmed',
                statusType: 'confirmed',
              },
              {
                id: 'VR-011',
                severity: 'High',
                title: 'IDOR in Order Access',
                time: '1 hour ago',
                status: 'In Progress',
                statusType: 'in-progress',
              },
              {
                id: 'VR-010',
                severity: 'High',
                title: 'Insecure File Upload',
                time: '4 hours ago',
                status: 'Not Reproducible',
                statusType: 'rejected',
              },
              {
                id: 'VR-009',
                severity: 'Medium',
                title: 'CORS Misconfiguration',
                time: '1 day ago',
                status: 'Confirmed',
                statusType: 'confirmed',
              },
              {
                id: 'VR-008',
                severity: 'Medium',
                title: 'XSS in Comments',
                time: '1 day ago',
                status: 'Skipped',
                statusType: 'skipped',
              },
              {
                id: 'VR-007',
                severity: 'Low',
                title: 'Verbose Error Messages',
                time: '2 days ago',
                status: 'Confirmed',
                statusType: 'confirmed',
              },
              {
                id: 'VR-006',
                severity: 'High',
                title: 'Broken Authentication',
                time: '2 days ago',
                status: 'Confirmed',
                statusType: 'confirmed',
              },
              {
                id: 'VR-005',
                severity: 'Medium',
                title: 'JWT Secret Exposure',
                time: '3 days ago',
                status: 'Not Reproducible',
                statusType: 'rejected',
              },
            ].map((run) => {
              const isSelected = selectedRunId === run.id;
              return (
                <div
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    'group rounded-xl border p-3 transition-all cursor-pointer space-y-2',
                    isSelected
                      ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                      : 'border-border/60 bg-surface/50 hover:bg-surface-alt/70',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-fg">#{run.id}</span>
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.2 text-[10px] font-bold uppercase',
                          run.severity === 'Critical'
                            ? 'bg-danger/15 text-danger border border-danger/30'
                            : run.severity === 'High'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : run.severity === 'Medium'
                            ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
                        )}
                      >
                        {run.severity}
                      </span>
                    </div>

                    <span
                      className={cn(
                        'rounded-full px-2 py-0.2 text-[10px] font-bold uppercase',
                        run.statusType === 'confirmed'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : run.statusType === 'in-progress'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : run.statusType === 'rejected'
                          ? 'bg-danger/15 text-danger border border-danger/30'
                          : 'bg-surface-alt text-muted border border-border',
                      )}
                    >
                      {run.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-fg text-xs truncate group-hover:text-primary transition-colors">
                    {run.title}
                  </h4>

                  <div className="flex items-center justify-between text-[11px] text-muted font-mono">
                    <span>{run.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COL 2: Center Run Detail & Terminal (5 cols) ── */}
        <div className="lg:col-span-5 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-danger/15 text-danger border border-danger/30">
                <FlaskConical className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-fg">#VR-012</span>
                  <span className="rounded bg-danger/20 text-danger px-1.5 py-0.2 text-[10px] font-bold uppercase border border-danger/40">
                    Critical
                  </span>
                </div>
                <h3 className="font-bold text-base text-fg mt-0.5">
                  NoSQL Injection in User Login
                </h3>
                <span className="font-mono text-xs text-muted">POST /api/auth/login</span>
              </div>
            </div>

            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold uppercase">
              <Check className="size-3" />
              <span>Confirmed</span>
            </span>
          </div>

          {/* Metadata Row: Started | Duration | Agent | Environment */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-y border-border/60 py-3">
            <div>
              <span className="text-muted text-[10.5px] block">Started</span>
              <span className="font-medium text-fg text-[11.5px]">Oct 1, 2025, 10:24 AM</span>
            </div>
            <div>
              <span className="text-muted text-[10.5px] block">Duration</span>
              <span className="font-mono font-medium text-fg text-[11.5px]">2m 14s</span>
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
                'pb-2 transition-colors border-b-2 whitespace-nowrap',
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
                'pb-2 transition-colors border-b-2 whitespace-nowrap',
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
                'pb-2 transition-colors border-b-2 whitespace-nowrap',
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
                'pb-2 transition-colors border-b-2 whitespace-nowrap',
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
                'pb-2 transition-colors border-b-2 whitespace-nowrap',
                activeDetailTab === 'logs'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-fg',
              )}
            >
              Raw Logs
            </button>
          </div>

          {/* Stepper (5 Steps matching images/verifcaiton.png) */}
          <div className="space-y-3">
            {[
              { id: 1, title: 'Setup sandbox environment', time: '10:24:13', status: 'Completed' },
              {
                id: 2,
                title: 'Reproduce vulnerability',
                desc: 'Send crafted NoSQL payload',
                time: '10:24:18',
                status: 'Completed',
              },
              {
                id: 3,
                title: 'Execute exploit',
                desc: 'Authenticate as admin',
                time: '10:24:25',
                status: 'Completed',
              },
              {
                id: 4,
                title: 'Validate impact',
                desc: 'Access admin dashboard',
                time: '10:24:32',
                status: 'Completed',
              },
              {
                id: 5,
                title: 'Generate evidence',
                desc: 'Save request/response, screenshots',
                time: '10:24:41',
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

          {/* Exploit Execution (Live) Terminal Window (images/verifcaiton.png) */}
          <div className="rounded-xl border border-border/80 bg-[#070c14] p-4 font-mono text-xs shadow-inner space-y-2">
            <div className="flex items-center justify-between text-muted text-[11px] pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-primary" />
                <span className="font-semibold text-fg">Exploit Execution (Live)</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('terminal')}
                className="flex items-center gap-1 hover:text-fg text-muted"
              >
                <Copy className="size-3" />
                <span>{copiedTerminal ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="space-y-1 text-fg/90 text-[11.5px] leading-relaxed overflow-x-auto">
              <div className="text-emerald-400">
                $ curl -X POST http://localhost:3000/api/auth/login \
              </div>
              <div className="pl-4 text-emerald-400">-H &quot;Content-Type: application/json&quot; \</div>
              <div className="pl-4 text-emerald-400">
                -d &apos;&#123;&quot;username&quot;: &#123;&quot;$ne&quot;: null&#125;, &quot;password&quot;: &#123;&quot;$ne&quot;: null&#125;&#125;&apos;
              </div>
              <div className="text-muted mt-2">&gt;&gt; Response (200 OK)</div>
              <div className="text-blue-300">&#123;</div>
              <div className="pl-4 text-blue-300">
                &quot;token&quot;: &quot;eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...&quot;,
              </div>
              <div className="pl-4 text-blue-300">&quot;user&quot;: &#123;</div>
              <div className="pl-8 text-blue-300">&quot;id&quot;: &quot;64f1a2b3c4d5e6f7g8h9i0j1&quot;,</div>
              <div className="pl-8 text-blue-300">&quot;username&quot;: &quot;admin&quot;,</div>
              <div className="pl-8 text-blue-300">&quot;role&quot;: &quot;admin&quot;</div>
              <div className="pl-4 text-blue-300">&#125;</div>
              <div className="text-blue-300">&#125;</div>
              <div className="text-emerald-400 font-bold pt-1 flex items-center gap-1.5">
                <Check className="size-3.5" />
                <span>Successfully authenticated as admin using NoSQL injection!</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── COL 3: Verification Summary & Evidence (3.5 cols) ── */}
        <div className="lg:col-span-4 space-y-4">
          {/* Card 1: Verification Summary */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="font-bold text-fg text-sm">Verification Summary</h3>
              <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.2 text-[10px] font-bold uppercase">
                Confirmed
              </span>
            </div>

            {/* Red Alert Banner */}
            <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-danger text-xs">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Vulnerability Confirmed</span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                The vulnerability is real and can be exploited in the current environment.
              </p>
            </div>

            {/* Key/Value Metas */}
            <div className="space-y-2 text-xs divide-y divide-border/40">
              <div className="flex justify-between items-center pt-1.5">
                <span className="text-muted">Impact</span>
                <span className="font-semibold text-fg text-right max-w-[170px] truncate">
                  Full account takeover (admin access)
                </span>
              </div>
              <div className="flex justify-between items-center pt-1.5">
                <span className="text-muted">CVSS (v3.1)</span>
                <span className="font-bold text-danger font-mono">9.8 (Critical)</span>
              </div>
              <div className="flex justify-between items-center pt-1.5">
                <span className="text-muted">Exploit Maturity</span>
                <span className="font-medium text-amber-400">Proof of Concept</span>
              </div>
              <div className="flex justify-between items-center pt-1.5">
                <span className="text-muted">Affected Component</span>
                <span className="font-mono text-fg text-[11px]">auth.controller.js</span>
              </div>
              <div className="flex justify-between items-center pt-1.5">
                <span className="text-muted">Required Conditions</span>
                <span className="text-fg text-right text-[11px]">
                  None (no authentication required)
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Evidence */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <h3 className="font-bold text-fg text-sm">Evidence</h3>
              <button type="button" className="text-xs font-semibold text-primary hover:underline">
                View All →
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setEvidenceTab('req-res')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-colors',
                  evidenceTab === 'req-res' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                Request / Response
              </button>
              <button
                type="button"
                onClick={() => setEvidenceTab('screenshots')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-colors',
                  evidenceTab === 'screenshots' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                Screenshots (2)
              </button>
              <button
                type="button"
                onClick={() => setEvidenceTab('logs')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-colors',
                  evidenceTab === 'logs' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                Logs (1)
              </button>
            </div>

            {/* Request Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-bold uppercase tracking-wider text-[10px]">Request Payload</span>
                <button
                  type="button"
                  onClick={() => handleCopy('req')}
                  className="flex items-center gap-1 hover:text-fg"
                >
                  <Copy className="size-3" />
                  <span>{copiedReq ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="rounded-xl border border-border/80 bg-[#070c14] p-3 font-mono text-[11px] text-rose-300">
                <pre className="whitespace-pre-wrap">
{`{
  "username": { "$ne": null },
  "password": { "$ne": null }
}`}
                </pre>
              </div>
            </div>

            {/* Response (200 OK) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400">
                  Response (200 OK)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('res')}
                  className="flex items-center gap-1 hover:text-fg"
                >
                  <Copy className="size-3" />
                  <span>{copiedRes ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="rounded-xl border border-border/80 bg-[#070c14] p-3 font-mono text-[11px] text-blue-300">
                <pre className="whitespace-pre-wrap">
{`{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f1a2b3c4d5e6f7g8h9i0j1",
    "username": "admin",
    "role": "admin"
  }
}`}
                </pre>
              </div>
            </div>
          </div>

          {/* Card 3: Related Finding */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-border/60 text-xs">
              <h3 className="font-bold text-fg">Related Finding</h3>
              <NavLink to="/findings?id=F-0012" className="font-semibold text-primary hover:underline">
                View Finding →
              </NavLink>
            </div>

            <div
              onClick={() => navigate('/findings?id=F-0012')}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-alt/40 p-3 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded bg-danger/20 text-danger px-1.5 py-0.2 text-[10px] font-bold uppercase border border-danger/30">
                  Critical
                </span>
                <div>
                  <span className="font-mono text-[11px] text-muted block">F-0012</span>
                  <span className="font-bold text-xs text-fg">NoSQL Injection in User Login</span>
                </div>
              </div>
              <ExternalLink className="size-3.5 text-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
