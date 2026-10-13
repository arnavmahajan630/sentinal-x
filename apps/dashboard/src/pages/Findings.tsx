import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
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
  XCircle,
  Bot,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchFindings, triggerVerification } from '@/lib/api';
import type { Finding } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

function getFixRecommendation(finding: Finding | null | undefined) {
  if (!finding) return { code: '', description: '', steps: [] as string[] };
  const type = (finding.type || '').toLowerCase();
  if (type.includes('idor') || type.includes('bola')) {
    return {
      description: 'The endpoint retrieves resource objects without validating whether the requesting identity possesses ownership privileges. Malicious callers can enumerate resource IDs to retrieve records belonging to other tenants.',
      code: `// Enforce Ownership Verification in Route Controller
router.get('/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id // enforce resource ownership
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found or unauthorized' });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});`,
      steps: [
        'Enforce authentication middleware (JWT / session) on route',
        'Bind database lookup to req.user._id rather than trusting client-provided ID alone',
        'Exclude sensitive attributes (e.g. payment details, CVV) from returned projection',
        'Re-run verification in Sandbox to confirm 403 / 404 response on foreign resource IDs',
      ],
    };
  } else if (type.includes('nosql') || type.includes('injection')) {
    return {
      description: 'The controller passes raw request parameters into MongoDB query selectors without type assertions. Attackers can pass object payloads with query operators ($ne, $gt, $regex) to bypass authentication.',
      code: `// Cast parameters to primitive strings before querying
router.post('/login', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({ error: 'Valid username and password required' });
  }

  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
  res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
});`,
      steps: [
        'Sanitize or cast request parameters to primitive string values',
        'Use express-mongo-sanitize or schema validation (zod / joi) to strip $-prefixed query operators',
        'Compare password hashes using bcrypt.compare instead of plaintext matching',
        'Re-test in Sandbox with NoSQL injection payload',
      ],
    };
  } else if (type.includes('bfla') || type.includes('auth')) {
    return {
      description: 'Administrative or sensitive operations lack role-based authorization guards, allowing unprivileged accounts or anonymous clients to trigger privileged actions.',
      code: `// Role-based authorization middleware guard
function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
}

router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});`,
      steps: [
        'Enforce authentication prior to role evaluation',
        'Verify required role or permission claims in JWT / session',
        'Log unauthorized access attempts to audit stream',
        'Re-verify in sandbox to confirm 403 Forbidden enforcement',
      ],
    };
  } else {
    return {
      description: `Security vulnerability detected by sentinel-x static AST engine and sandbox probes in ${finding.affectedNodes?.[0] || 'repository'}.`,
      code: `// Generic Schema Validation & Secure Guard
import { z } from 'zod';

const RequestSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

router.use((req, res, next) => {
  const result = RequestSchema.safeParse(req.params);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request schema' });
  }
  next();
});`,
      steps: [
        'Validate input schemas strictly at controller boundary',
        'Apply defense-in-depth authorization checks',
        'Prevent raw internal errors and sensitive fields from leaking',
        'Re-verify in Sandbox to confirm remediation',
      ],
    };
  }
}

export function Findings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
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
  const [copiedReq, setCopiedReq] = useState(false);
  const [copiedRes, setCopiedRes] = useState(false);
  const [testingSandbox, setTestingSandbox] = useState(false);
  const [sandboxSuccess, setSandboxSuccess] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<string | null>(null);
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

  // Sync selected finding ID from search params if provided
  useEffect(() => {
    const urlId = searchParams.get('id');
    if (urlId) {
      setSelectedFindingId(urlId);
    }
  }, [searchParams]);

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
    const fix = getFixRecommendation(selectedFinding);
    navigator.clipboard.writeText(fix.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPayload = () => {
    if (!selectedFinding) return;
    const payload = selectedFinding.evidence?.request
      ? JSON.stringify(selectedFinding.evidence.request, null, 2)
      : '{"test": "payload"}';
    navigator.clipboard.writeText(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleTestSandbox = async () => {
    if (!activeProject || !selectedFinding) return;
    setTestingSandbox(true);
    setSandboxSuccess(false);
    setSandboxResult(null);
    try {
      const res = await triggerVerification({
        projectId: activeProject.projectId,
        findingId: selectedFinding.id,
      });
      queryClient.invalidateQueries({ queryKey: ['findings'] });
      queryClient.invalidateQueries({ queryKey: ['verifications'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      setSandboxSuccess(true);
      setSandboxResult(res.result || 'CONFIRMED');
      setTimeout(() => setSandboxSuccess(false), 6000);
    } catch (err: any) {
      console.error('Failed to trigger sandbox verification:', err);
      setSandboxResult('ERROR');
      setSandboxSuccess(false);
    } finally {
      setTestingSandbox(false);
    }
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

            {/* ── TAB 1: OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
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
                      {testingSandbox ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span>Verifying in Sandbox...</span>
                        </>
                      ) : (
                        <>
                          <FlaskConical className="size-4" />
                          <span>Test in Sandbox</span>
                        </>
                      )}
                    </button>
                  </div>

                  {sandboxSuccess && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
                      <Check className="size-4" />
                      <span>
                        Verification finished: Result <strong>{sandboxResult}</strong> logged to telemetry and DB.
                      </span>
                    </div>
                  )}
                  {sandboxResult === 'ERROR' && (
                    <div className="rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger flex items-center gap-2">
                      <XCircle className="size-4" />
                      <span>Failed to trigger sandbox verification. Ensure sandbox container is running.</span>
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

            {/* ── TAB 2: EVIDENCE ── */}
            {activeTab === 'evidence' && (
              <div className="space-y-4">
                {/* Expected vs Actual Assertion */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Check className="size-3.5" />
                      <span>Expected Baseline</span>
                    </span>
                    <p className="font-mono text-xs text-fg/90">
                      {selectedFinding.evidence?.expected || 'HTTP 401 Unauthorized or HTTP 403 Forbidden'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 space-y-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-danger flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" />
                      <span>Actual Exploit Response</span>
                    </span>
                    <p className="font-mono text-xs text-fg/90">
                      {selectedFinding.evidence?.actual || 'HTTP 200 OK + Sensitive resource returned'}
                    </p>
                  </div>
                </div>

                {/* HTTP Request Inspector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wider text-muted text-[11px] flex items-center gap-1.5">
                      <Terminal className="size-3.5 text-primary" />
                      <span>Trigger Request</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedFinding.evidence?.request) {
                          navigator.clipboard.writeText(JSON.stringify(selectedFinding.evidence.request, null, 2));
                          setCopiedReq(true);
                          setTimeout(() => setCopiedReq(false), 2000);
                        }
                      }}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-fg"
                    >
                      <Copy className="size-3" />
                      <span>{copiedReq ? 'Copied' : 'Copy Request'}</span>
                    </button>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3 font-mono text-xs space-y-2 text-fg">
                    <div className="text-emerald-400 font-semibold text-[11.5px]">
                      {(selectedFinding.evidence?.request as any)?.method || 'GET'} {(selectedFinding.evidence?.request as any)?.url || (selectedFinding.evidence?.request as any)?.path || '/api/orders/:id'}
                    </div>
                    {(selectedFinding.evidence?.request as any)?.headers && (
                      <div className="text-muted text-[11px] pl-2 border-l-2 border-border/60">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify((selectedFinding.evidence?.request as any).headers, null, 2)}
                        </pre>
                      </div>
                    )}
                    {(selectedFinding.evidence?.request as any)?.body && (
                      <div className="text-rose-300 text-[11.5px] pt-1">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify((selectedFinding.evidence?.request as any).body, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* HTTP Response Inspector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wider text-muted text-[11px] flex items-center gap-1.5">
                      <FileCode className="size-3.5 text-primary" />
                      <span>Server Response Telemetry</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedFinding.evidence?.response) {
                          navigator.clipboard.writeText(JSON.stringify(selectedFinding.evidence.response, null, 2));
                          setCopiedRes(true);
                          setTimeout(() => setCopiedRes(false), 2000);
                        }
                      }}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-fg"
                    >
                      <Copy className="size-3" />
                      <span>{copiedRes ? 'Copied' : 'Copy Response'}</span>
                    </button>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3.5 font-mono text-xs space-y-2 text-fg">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold">
                        {(selectedFinding.evidence?.response as any)?.status || 200} OK
                      </span>
                      <span className="text-muted text-[11px]">Sandbox Container Isolated Execution</span>
                    </div>

                    <div className="rounded-lg bg-black/60 p-3 text-blue-300 text-[11.5px] max-h-[220px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap">
                        {selectedFinding.evidence?.response?.body
                          ? JSON.stringify(selectedFinding.evidence.response.body, null, 2)
                          : JSON.stringify(selectedFinding.evidence?.response || { status: 200 }, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: FIX RECOMMENDATION ── */}
            {activeTab === 'fix' && (() => {
              const fix = getFixRecommendation(selectedFinding);
              return (
                <div className="space-y-4">
                  {/* Remediation Overview */}
                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3.5 space-y-1.5">
                    <span className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="size-4 text-emerald-400" />
                      <span>Remediation Overview</span>
                    </span>
                    <p className="text-xs text-muted leading-relaxed">
                      {fix.description}
                    </p>
                  </div>

                  {/* Fix Code Diff */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-muted text-[11px] flex items-center gap-1.5">
                        <Code2 className="size-3.5 text-primary" />
                        <span>Recommended Patch</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 text-[11px] text-muted hover:text-fg"
                      >
                        <Copy className="size-3" />
                        <span>{copiedCode ? 'Copied' : 'Copy Fix Code'}</span>
                      </button>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-[#070c14] p-3.5 font-mono text-xs overflow-x-auto text-emerald-300">
                      <pre className="whitespace-pre-wrap leading-relaxed">
                        {fix.code}
                      </pre>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted block">
                      Implementation Checklist
                    </span>
                    <ul className="space-y-2">
                      {fix.steps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-fg/90">
                          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 mt-0.5">
                            <Check className="size-3" />
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}

            {/* ── TAB 4: AGENT ANALYSIS ── */}
            {activeTab === 'agent' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3">
                    <span className="text-[10px] text-muted uppercase block">Discovered By</span>
                    <span className="font-semibold text-fg text-xs mt-1 flex items-center gap-1.5">
                      <Bot className="size-3.5 text-primary" />
                      <span className="capitalize">{selectedFinding.agentRun || 'Autonomous Agent'}</span>
                    </span>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3">
                    <span className="text-[10px] text-muted uppercase block">Confidence Score</span>
                    <span className="font-semibold text-emerald-400 text-xs mt-1 capitalize">
                      ● {selectedFinding.confidence} (Evidence-Backed)
                    </span>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3">
                    <span className="text-[10px] text-muted uppercase block">Verification Status</span>
                    <span className="font-semibold text-amber-400 text-xs mt-1">
                      {selectedFinding.verificationResult?.result || 'Dynamic Exploit Confirmed'}
                    </span>
                  </div>
                </div>

                {/* Traversed Graph Path */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    <span>Attack Vector & Graph Path</span>
                  </span>

                  <div className="rounded-xl border border-border/80 bg-[#070c14] p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      {selectedFinding.affectedNodes?.map((node, i) => (
                        <div key={node} className="flex items-center gap-2">
                          <span className="rounded-lg bg-surface-alt px-2.5 py-1 text-primary border border-border/80">
                            {node}
                          </span>
                          {i < (selectedFinding.affectedNodes?.length || 0) - 1 && (
                            <ArrowRight className="size-3.5 text-muted shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-muted leading-relaxed font-sans pt-2 border-t border-border/60">
                      {selectedFinding.attackPath?.narrative ||
                        'The security agent tracked data flow from the exposed public HTTP route through AST AST call graphs into unauthenticated controllers, verifying direct read access to sensitive customer assets.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 5: REFERENCES ── */}
            {activeTab === 'references' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-4 space-y-2">
                    <span className="text-[10px] text-muted uppercase font-bold tracking-wider block">
                      OWASP Category
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-fg text-sm">
                        {selectedFinding.references?.owasp || 'A01:2025 Broken Object Level Authorization'}
                      </span>
                      <a
                        href="https://owasp.org/Top10/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <span>OWASP Docs</span>
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-4 space-y-2">
                    <span className="text-[10px] text-muted uppercase font-bold tracking-wider block">
                      Common Weakness Enumeration
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {selectedFinding.references?.cwe && selectedFinding.references.cwe.length > 0 ? (
                        selectedFinding.references.cwe.map((cweNum) => (
                          <a
                            key={cweNum}
                            href={`https://cwe.mitre.org/data/definitions/${cweNum}.html`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary hover:bg-primary/20"
                          >
                            <span>CWE-{cweNum}</span>
                            <ExternalLink className="size-2.5" />
                          </a>
                        ))
                      ) : (
                        <span className="font-mono text-muted">CWE-639, CWE-284</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-surface-alt/30 p-4 space-y-2">
                  <span className="font-bold text-fg uppercase tracking-wider text-[11px] block">
                    CVSS v3.1 Vector Breakdown
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11.5px] font-mono">
                    <div className="rounded-lg bg-surface/60 p-2 border border-border/60">
                      <span className="text-muted text-[10px] block">AV (Attack Vector)</span>
                      <span className="font-bold text-fg">Network (AV:N)</span>
                    </div>
                    <div className="rounded-lg bg-surface/60 p-2 border border-border/60">
                      <span className="text-muted text-[10px] block">AC (Complexity)</span>
                      <span className="font-bold text-fg">Low (AC:L)</span>
                    </div>
                    <div className="rounded-lg bg-surface/60 p-2 border border-border/60">
                      <span className="text-muted text-[10px] block">PR (Privileges)</span>
                      <span className="font-bold text-fg">None (PR:N)</span>
                    </div>
                    <div className="rounded-lg bg-surface/60 p-2 border border-border/60">
                      <span className="text-muted text-[10px] block">UI (Interaction)</span>
                      <span className="font-bold text-fg">None (UI:N)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
