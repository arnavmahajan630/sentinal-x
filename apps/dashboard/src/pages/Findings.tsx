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
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchFindings, triggerVerification } from '@/lib/api';
import type { Finding } from '@/lib/api';
import { DEMO_FINDINGS } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

export function Findings() {
  const navigate = useNavigate();
  const { activeProject } = useProject();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list');
  const [selectedFindingId, setSelectedFindingId] = useState<string>('F-0012');
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
    if (Array.isArray(findingsData) && findingsData.length > 0) return findingsData;
    return DEMO_FINDINGS;
  }, [findingsData]);

  const selectedFinding = useMemo(() => {
    return findingsList.find((f) => f.id === selectedFindingId) || findingsList[0] || DEMO_FINDINGS[0];
  }, [findingsList, selectedFindingId]);

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
              <div className="text-2xl font-extrabold text-fg">7</div>
              <div className="text-xs text-muted font-medium">Critical</div>
            </div>
          </div>

          {/* High */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <Shield className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">18</div>
              <div className="text-xs text-muted font-medium">High</div>
            </div>
          </div>

          {/* Medium */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">24</div>
              <div className="text-xs text-muted font-medium">Medium</div>
            </div>
          </div>

          {/* Low */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">12</div>
              <div className="text-xs text-muted font-medium">Low</div>
            </div>
          </div>

          {/* Informational */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-surface-alt text-muted border border-border shrink-0">
              <FileCode className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-fg">36</div>
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
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                  strokeDasharray="10 100"
                  strokeDashoffset="0"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="4"
                  strokeDasharray="20 100"
                  strokeDashoffset="-10"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="4"
                  strokeDasharray="25 100"
                  strokeDashoffset="-30"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="4"
                  strokeDasharray="15 100"
                  strokeDashoffset="-55"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="4"
                  strokeDasharray="30 100"
                  strokeDashoffset="-70"
                />
              </svg>
              <div className="absolute text-center">
                <div className="text-xl font-extrabold text-fg">97</div>
                <div className="text-[9px] uppercase font-bold text-muted">Total</div>
              </div>
            </div>

            <div className="text-xs">
              <div className="font-bold text-fg">97</div>
              <div className="text-[11px] text-muted">Total Findings</div>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-1 text-[11px] pr-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-danger" />
              <span className="font-bold text-fg">7</span>
              <span className="text-muted">Critical</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400" />
              <span className="font-bold text-fg">18</span>
              <span className="text-muted">High</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-yellow-400" />
              <span className="font-bold text-fg">24</span>
              <span className="text-muted">Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-blue-400" />
              <span className="font-bold text-fg">12</span>
              <span className="text-muted">Low</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-slate-400" />
              <span className="font-bold text-fg">36</span>
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
                97
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

          {/* List items (matching images/findings.png) */}
          <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
            {[
              {
                id: 'F-0012',
                severity: 'Critical',
                title: 'NoSQL Injection in User Login',
                endpoint: 'POST /api/auth/login',
                tag: 'Injection',
                status: 'Open',
                time: '2h ago',
              },
              {
                id: 'F-0011',
                severity: 'Critical',
                title: 'Insecure Direct Object Reference (IDOR)',
                endpoint: 'GET /api/users/:id',
                tag: 'Access Control',
                status: 'Open',
                time: '3h ago',
              },
              {
                id: 'F-0010',
                severity: 'Critical',
                title: 'Hardcoded JWT Secret',
                endpoint: 'config/jwt.js',
                tag: 'Secrets',
                status: 'Open',
                time: '5h ago',
              },
              {
                id: 'F-0009',
                severity: 'High',
                title: 'Cross-Site Scripting (XSS)',
                endpoint: 'GET /api/comments',
                tag: 'XSS',
                status: 'Open',
                time: '6h ago',
              },
              {
                id: 'F-0008',
                severity: 'High',
                title: 'Missing Authorization Middleware',
                endpoint: 'POST /api/admin/*',
                tag: 'Access Control',
                status: 'Open',
                time: '8h ago',
              },
              {
                id: 'F-0007',
                severity: 'High',
                title: 'Insecure CORS Configuration',
                endpoint: 'server.js',
                tag: 'Configuration',
                status: 'In Progress',
                time: '10h ago',
              },
              {
                id: 'F-0006',
                severity: 'Medium',
                title: 'Sensitive Data in Logs',
                endpoint: 'utils/logger.js',
                tag: 'Data Exposure',
                status: 'Open',
                time: '12h ago',
              },
              {
                id: 'F-0005',
                severity: 'Medium',
                title: 'Unvalidated File Upload',
                endpoint: 'POST /api/upload',
                tag: 'File Upload',
                status: 'Open',
                time: '1d ago',
              },
              {
                id: 'F-0004',
                severity: 'Medium',
                title: 'Outdated Dependency (express@4.17.1)',
                endpoint: 'package.json',
                tag: 'Dependency',
                status: 'Open',
                time: '1d ago',
              },
              {
                id: 'F-0003',
                severity: 'Low',
                title: 'Missing Security Headers',
                endpoint: 'server.js',
                tag: 'Configuration',
                status: 'Open',
                time: '1d ago',
              },
              {
                id: 'F-0002',
                severity: 'Low',
                title: 'Verbose Error Messages',
                endpoint: 'errorHandler.js',
                tag: 'Information Disclosure',
                status: 'Open',
                time: '2d ago',
              },
              {
                id: 'F-0001',
                severity: 'Info',
                title: 'Debug Endpoint Enabled',
                endpoint: 'GET /api/debug',
                tag: 'Debug',
                status: 'Open',
                time: '2d ago',
              },
            ].map((f) => {
              const isSelected = selectedFindingId === f.id;
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
                        {f.title}
                      </h4>
                    </div>

                    <div className="font-mono text-[11px] text-muted mt-1 truncate">
                      {f.endpoint}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[10.5px]">
                      <span className="rounded bg-surface-alt border border-border/60 px-1.5 py-0.2 text-muted">
                        {f.tag}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.2 font-mono text-[10px]',
                            f.status === 'In Progress'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : 'bg-danger/10 text-danger border border-danger/20',
                          )}
                        >
                          {f.status}
                        </span>
                        <span className="font-mono text-muted">{f.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination (images/findings.png) */}
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
              <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                2
              </span>
              <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                3
              </span>
              <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                4
              </span>
              <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                5
              </span>
              <span className="px-1 text-muted">...</span>
              <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                9
              </span>
              <span className="grid size-6 place-items-center rounded hover:bg-surface-alt cursor-pointer">
                10
              </span>
            </div>

            <button type="button" className="flex items-center gap-1 hover:text-fg cursor-pointer">
              <span>Next</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Finding Dossier (7 cols) ── */}
        <div className="lg:col-span-7 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-md bg-danger/15 border border-danger/30 px-2.5 py-0.5 text-xs font-bold text-danger uppercase tracking-wider">
                  <ShieldAlert className="size-3.5" />
                  <span>Critical</span>
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
              NoSQL Injection in User Login
            </h2>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="font-mono text-muted">POST /api/auth/login</span>
              <div className="flex items-center gap-4 text-muted font-mono text-[11px]">
                <span>Finding ID: <strong className="text-fg">F-0012</strong></span>
                <span>Status: <strong className="text-danger">● Open</strong></span>
                <span>Discovered: 2 hours ago</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs: Overview | Evidence | Fix Recommendation | Agent Analysis | References */}
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
              The login endpoint is vulnerable to NoSQL injection. User input is directly
              concatenated into a MongoDB query, allowing an attacker to bypass authentication and
              gain unauthorized access.
            </p>

            {/* 5 Metric Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                <span className="text-[10px] text-muted uppercase block">Category</span>
                <span className="font-semibold text-fg text-xs mt-0.5 block">Injection</span>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                <span className="text-[10px] text-muted uppercase block">CWE</span>
                <span className="font-mono text-fg text-xs mt-0.5 block">CWE-943</span>
              </div>
              <div className="rounded-xl border border-danger/30 bg-danger/5 p-2.5">
                <span className="text-[10px] text-muted uppercase block">CVSS (v3.1)</span>
                <span className="font-bold text-danger text-xs mt-0.5 block">9.8 (Critical)</span>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                <span className="text-[10px] text-muted uppercase block">Affected Component</span>
                <span className="font-mono text-fg text-xs mt-0.5 block truncate">
                  auth.controller.js
                </span>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
                <span className="text-[10px] text-muted uppercase block">Exploit Maturity</span>
                <span className="font-semibold text-amber-400 text-[11px] mt-0.5 flex items-center gap-1">
                  <span>Proof of Concept</span>
                </span>
              </div>
            </div>
          </div>

          {/* Section: Vulnerable Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted text-[11px]">
                <Code2 className="size-3.5 text-primary" />
                <span>Vulnerable Code</span>
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
                auth.controller.js <span className="text-muted/60">L12–L18</span>
              </div>
              <div className="space-y-1 text-[12px] leading-relaxed">
                <div>
                  <span className="text-muted/50 select-none mr-4">12</span>
                  <span className="text-purple-400">const</span> user = <span className="text-purple-400">await</span>{' '}
                  <span className="text-blue-400">User.findOne</span>(&#123;
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">13</span>
                  &nbsp;&nbsp;username: req.body.username,
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">14</span>
                  &nbsp;&nbsp;password: req.body.password
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">15</span>
                  &#125;);
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">16</span>
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">17</span>
                  <span className="text-purple-400">if</span> (user) &#123;
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">18</span>
                  &nbsp;&nbsp;<span className="text-muted">// proceed with login</span>
                </div>
                <div>
                  <span className="text-muted/50 select-none mr-4">19</span>
                  &#125;
                </div>
              </div>
            </div>
          </div>

          {/* Section: Example Payload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-muted text-[11px]">
                Example Payload
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 w-full flex items-center justify-between rounded-xl border border-border/80 bg-[#090e18] px-3.5 py-2.5 font-mono text-xs text-rose-300">
                <span>&#123;&quot;username&quot;: &#123;&quot;$ne&quot;: null&#125;, &quot;password&quot;: &#123;&quot;$ne&quot;: null&#125;&#125;</span>
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
                <span>Successfully authenticated as admin! Vulnerability confirmed in sandbox.</span>
              </div>
            )}
          </div>

          {/* Bottom 2 Columns: Impact & Recommended Fix (images/findings.png) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60 text-xs">
            {/* Impact */}
            <div className="space-y-2">
              <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
                Impact
              </h4>
              <ul className="space-y-1.5 text-fg/90">
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-danger shrink-0" />
                  <span>Bypass authentication</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-danger shrink-0" />
                  <span>Access any user account</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-danger shrink-0" />
                  <span>Potential data exfiltration</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-danger shrink-0" />
                  <span>Complete application compromise</span>
                </li>
              </ul>
            </div>

            {/* Recommended Fix */}
            <div className="space-y-2">
              <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
                Recommended Fix
              </h4>
              <ul className="space-y-1.5 text-fg/90">
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400 shrink-0" />
                  <span>Use parameterized queries or Mongoose validation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400 shrink-0" />
                  <span>Validate and sanitize all user input</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400 shrink-0" />
                  <span>Implement rate limiting on login attempts</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400 shrink-0" />
                  <span>Add proper error handling and generic error messages</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
