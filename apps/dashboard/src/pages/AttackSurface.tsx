import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  AlertTriangle,
  Database,
  Lock,
  Unlock,
  Layers,
  ExternalLink,
  ShieldCheck,
  FileCode,
  Globe,
  SlidersHorizontal,
  Bookmark,
  Copy,
  MoreHorizontal,
  Plus,
  Play,
  ArrowRight,
  GitBranch,
  Shield,
  Clock,
  Code,
  CheckCircle2,
  XCircle,
  Check,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchRoutes, fetchFindings } from '@/lib/api';
import type { RouteItem, Finding } from '@/lib/api';
import { DEMO_ROUTES, DEMO_FINDINGS } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

export function AttackSurface() {
  const navigate = useNavigate();
  const { activeProject } = useProject();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('GET /orders/:id');
  const [activeTab, setActiveTab] = useState<'flow' | 'code' | 'findings' | 'data' | 'test'>('flow');
  const [coverageTab, setCoverageTab] = useState<'category' | 'risk' | 'data' | 'module'>('category');
  const [copied, setCopied] = useState(false);

  // Queries
  const { data: routesData } = useQuery({
    queryKey: ['routes', activeProject?.projectId],
    queryFn: () => fetchRoutes(activeProject?.projectId),
  });

  const { data: findingsData } = useQuery({
    queryKey: ['findings', activeProject?.projectId],
    queryFn: () => fetchFindings(activeProject?.projectId),
  });

  const routes = useMemo<RouteItem[]>(() => {
    const raw = routesData?.routes;
    return Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.items)
      ? (raw as any).items
      : [];
  }, [routesData]);

  const findings = useMemo<Finding[]>(() => {
    if (Array.isArray(findingsData)) return findingsData;
    return [];
  }, [findingsData]);

  const selectedRoute = useMemo<RouteItem | null>(() => {
    if (routes.length === 0) return null;
    return (routes.find((r) => r.id === selectedRouteId) || routes[0]) as RouteItem;
  }, [routes, selectedRouteId]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered routes based on search and method
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          (r.path || '').toLowerCase().includes(q) ||
          (r.id || '').toLowerCase().includes(q) ||
          (r.handler || '').toLowerCase().includes(q) ||
          (r.file || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedMethod !== 'ALL' && r.method?.toUpperCase() !== selectedMethod) return false;
      return true;
    });
  }, [routes, searchTerm, selectedMethod]);

  // Group routes into High, Medium, Low, External
  const highRiskRoutes = useMemo(() => {
    return filteredRoutes.filter((r) => {
      if (selectedRisk !== 'ALL' && selectedRisk !== 'HIGH' && selectedRisk !== 'CRITICAL') return false;
      const rRisk = (r as any).riskLevel;
      return (
        ['GET /orders/:id', 'DELETE /orders/:id', 'GET /users/:id', 'PUT /users/profile', 'GET /admin/*'].includes(r.id) ||
        !r.protected ||
        rRisk === 'CRITICAL' ||
        rRisk === 'HIGH' ||
        Boolean(r.mutates)
      );
    });
  }, [filteredRoutes, selectedRisk]);

  const mediumRiskRoutes = useMemo(() => {
    return filteredRoutes.filter((r) => {
      if (selectedRisk !== 'ALL' && selectedRisk !== 'MEDIUM') return false;
      if (highRiskRoutes.some((hr) => hr.id === r.id)) return false;
      const rRisk = (r as any).riskLevel;
      return (
        ['POST /orders', 'GET /products', 'PUT /products/:id', 'POST /users', 'GET /reviews'].includes(r.id) ||
        r.authEnforcement === 'weak' ||
        rRisk === 'MEDIUM'
      );
    });
  }, [filteredRoutes, selectedRisk, highRiskRoutes]);

  const lowRiskRoutes = useMemo(() => {
    return filteredRoutes.filter((r) => {
      if (selectedRisk !== 'ALL' && selectedRisk !== 'LOW') return false;
      if (highRiskRoutes.some((hr) => hr.id === r.id) || mediumRiskRoutes.some((mr) => mr.id === r.id)) return false;
      return true;
    });
  }, [filteredRoutes, selectedRisk, highRiskRoutes, mediumRiskRoutes]);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER & BREADCRUMBS                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={`Projects > ${activeProject?.name || 'vulnerable-mern-app'} > Attack Surface`}
        title="Attack Surface"
        tagline="Every exposed route, entry point, and security boundary in your application."
        quote="Attack surface is not just what you expose, but what you assume."
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. FIVE METRIC CARDS (images/attack-surface.png)                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: API Routes */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <GitBranch className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{routes.length}</div>
            <div className="text-xs text-muted font-medium">API Routes</div>
          </div>
        </div>

        {/* Card 2: Protected */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{routes.filter((r) => r.protected).length}</div>
            <div className="text-xs text-muted font-medium">Protected</div>
          </div>
        </div>

        {/* Card 3: Need Review */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Shield className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{routes.filter((r) => !r.protected || r.authEnforcement === 'weak').length}</div>
            <div className="text-xs text-muted font-medium">Need Review</div>
          </div>
        </div>

        {/* Card 4: Sensitive Data Flows */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            <Database className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{routesData?.assetsCount ?? routes.filter((r) => r.mutates || (r.inputs && r.inputs.length > 0)).length}</div>
            <div className="text-xs text-muted font-medium">Sensitive Data Flows</div>
          </div>
        </div>

        {/* Card 5: Active Findings */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Globe className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{findings.length}</div>
            <div className="text-xs text-muted font-medium">Active Findings</div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. FILTER BAR (images/attack-surface.png)                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/80 p-3 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[300px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-2.5 size-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search routes, functions, files..."
              className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-1.5 pl-9 pr-3 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Filter Dropdowns */}
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="ALL">Method ⌵</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Auth ⌵</option>
            <option>Authenticated</option>
            <option>Public</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Authorization ⌵</option>
            <option>Missing</option>
            <option>Role Enforced</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Data Access ⌵</option>
            <option>Direct Query</option>
            <option>Sanitized</option>
          </select>

          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="ALL">Severity ⌵</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Status ⌵</option>
            <option>Needs Review</option>
            <option>Verified</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-alt"
          >
            <Bookmark className="size-3.5 text-primary" />
            <span>Needs attention</span>
            <span className="text-muted text-[10px]">⌵</span>
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface-alt/50 text-muted hover:text-fg hover:bg-surface-alt"
          >
            <SlidersHorizontal className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. THREE-COLUMN MAIN WORKBENCH (images/attack-surface.png)         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── COL 1: Routes & Entry Points (32) (3.5 cols) ── */}
        <div className="lg:col-span-3 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-fg text-sm">Routes & Entry Points</h3>
              <span className="rounded-full bg-surface-alt border border-border/70 px-2 py-0.2 text-[11px] font-mono text-muted">
                {routes.length || 32}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="grid size-7 place-items-center rounded-lg hover:bg-surface-alt text-muted hover:text-fg"
              >
                <SlidersHorizontal className="size-3.5" />
              </button>
              <button
                type="button"
                className="grid size-7 place-items-center rounded-lg hover:bg-surface-alt text-primary"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* Group 1: High Risk */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-danger px-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                <span>High Risk ({highRiskRoutes.length})</span>
              </div>
              <span className="rounded-full bg-danger/20 text-danger px-1.5 py-0.2 text-[10px]">
                {highRiskRoutes.length}
              </span>
            </div>

            <div className="space-y-1">
              {highRiskRoutes.map((r) => {
                const isSelected = selectedRouteId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRouteId(r.id)}
                    className={cn(
                      'group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer border',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-transparent hover:bg-surface-alt/70',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-1.5 rounded-full bg-danger shrink-0" />
                      <span className="font-mono text-[10px] font-bold text-muted uppercase">
                        {r.method || 'GET'}
                      </span>
                      <span className="font-mono text-[11.5px] text-fg truncate">{r.path || r.id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-muted">
                      {r.protected ? <Lock className="size-3 text-muted" /> : <Unlock className="size-3 text-danger/80" />}
                      <AlertTriangle className="size-3 text-danger" />
                      <span className="text-[10px] font-mono">{(r as any).time || '2h ago'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 2: Medium Risk */}
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-amber-400 px-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                <span>Medium Risk ({mediumRiskRoutes.length})</span>
              </div>
              <span className="rounded-full bg-amber-500/20 text-amber-400 px-1.5 py-0.2 text-[10px]">
                {mediumRiskRoutes.length}
              </span>
            </div>

            <div className="space-y-1">
              {mediumRiskRoutes.map((r) => {
                const isSelected = selectedRouteId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRouteId(r.id)}
                    className={cn(
                      'group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer border',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-transparent hover:bg-surface-alt/70',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="font-mono text-[10px] font-bold text-muted uppercase">
                        {r.method || 'GET'}
                      </span>
                      <span className="font-mono text-[11.5px] text-fg truncate">{r.path || r.id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-muted">
                      <Lock className="size-3 text-muted" />
                      <span className="text-[10px] font-mono">{(r as any).time || '3h ago'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 3: Low Risk */}
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-emerald-400 px-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                <span>Low Risk ({lowRiskRoutes.length})</span>
              </div>
              <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 text-[10px]">
                {lowRiskRoutes.length}
              </span>
            </div>

            <div className="space-y-1">
              {lowRiskRoutes.map((r) => {
                const isSelected = selectedRouteId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRouteId(r.id)}
                    className={cn(
                      'group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer border',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-transparent hover:bg-surface-alt/70',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-mono text-[10px] font-bold text-muted uppercase">
                        {r.method || 'GET'}
                      </span>
                      <span className="font-mono text-[11.5px] text-fg truncate">{r.path || r.id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-muted">
                      <span className="text-[10px] font-mono">{(r as any).time || '1d ago'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 4: External Services */}
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-[11.5px] font-medium text-muted px-1">
              <div className="flex items-center gap-1.5">
                <Globe className="size-3.5" />
                <span>External Services</span>
              </div>
              <span className="rounded-full bg-surface-alt px-1.5 py-0.2 text-[10px]">3</span>
            </div>
          </div>
        </div>

        {/* ── COL 2: Center Route Flow & Signals (5.5 cols) ── */}
        <div className="lg:col-span-5 space-y-4">
          {!selectedRoute ? (
            <div className="rounded-2xl border border-border/80 bg-surface/90 p-12 shadow-xs text-center flex flex-col items-center justify-center min-h-[360px]">
              <div className="grid size-12 place-items-center rounded-2xl bg-surface-alt border border-border text-muted mb-3">
                <GitBranch className="size-6" />
              </div>
              <h3 className="text-base font-bold text-fg">No route selected</h3>
              <p className="text-xs text-muted mt-1 max-w-xs">
                {routes.length === 0
                  ? 'No routes have been detected yet for this project. Once indexed, exposed endpoints will appear here.'
                  : 'Select an endpoint from the left column to inspect its security flow and data paths.'}
              </p>
            </div>
          ) : (
            /* Main Inspection Card */
            <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-5">
            {/* Header: Method + Path + Badges */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-xs font-bold text-emerald-400">
                    {selectedRoute.method}
                  </span>
                  <h2 className="font-mono text-lg font-bold text-fg">
                    {selectedRoute.path || selectedRoute.fullPath}
                  </h2>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                    <Check className="size-3" />
                    <span>Authenticated</span>
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-danger/10 border border-danger/30 px-2.5 py-0.5 text-[11px] font-medium text-danger">
                    <AlertTriangle className="size-3" />
                    <span>Authorization: Missing</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleCopy(selectedRoute.path || '')}
                  className="flex items-center gap-1 rounded-lg border border-border bg-surface-alt/50 px-2.5 py-1 text-xs text-muted hover:text-fg"
                >
                  <Copy className="size-3" />
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-lg border border-border bg-surface-alt/50 text-muted hover:text-fg"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Tab Bar: Security Flow | Code View | Findings (2) | Data Flow | Test */}
            <div className="flex items-center gap-1 border-b border-border/60 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('flow')}
                className={cn(
                  'rounded-lg px-3 py-1 font-semibold transition-all',
                  activeTab === 'flow'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                Security Flow
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={cn(
                  'rounded-lg px-3 py-1 font-medium transition-all',
                  activeTab === 'code'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                Code View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('findings')}
                className={cn(
                  'rounded-lg px-3 py-1 font-medium transition-all',
                  activeTab === 'findings'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                Findings (2)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('data')}
                className={cn(
                  'rounded-lg px-3 py-1 font-medium transition-all',
                  activeTab === 'data'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                Data Flow
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('test')}
                className={cn(
                  'rounded-lg px-3 py-1 font-medium transition-all',
                  activeTab === 'test'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                Test
              </button>
            </div>

            {/* FLOW DIAGRAM (from attack-surface.png) */}
            <div className="rounded-xl border border-border/80 bg-surface-alt/30 p-4 space-y-4">
              <div className="flex items-center justify-between text-xs overflow-x-auto py-2">
                {/* 1. Request (Client) */}
                <div className="flex flex-col items-center">
                  <div className="grid size-10 place-items-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 mb-1.5 shadow-sm">
                    <Globe className="size-5" />
                  </div>
                  <span className="font-semibold text-fg text-[11.5px]">Request</span>
                  <span className="text-[10px] text-muted">(Client)</span>
                </div>

                <div className="text-muted/60 text-xs px-1">──▶</div>

                {/* 2. User Input req.params.id */}
                <div className="flex flex-col items-center">
                  <span className="text-[9.5px] text-muted mb-1">User Input</span>
                  <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-center text-xs font-mono font-semibold text-danger shadow-sm">
                    req.params.id
                  </div>
                </div>

                <div className="text-muted/60 text-xs px-1">──▶</div>

                {/* 3. Middleware authenticate() */}
                <div className="flex flex-col items-center">
                  <span className="text-[9.5px] text-muted mb-1">Middleware</span>
                  <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-mono font-semibold text-primary shadow-sm">
                    authenticate()
                  </div>
                </div>

                <div className="text-muted/60 text-xs px-1">──▶</div>

                {/* 4. Controller getOrderById() */}
                <div className="flex flex-col items-center">
                  <span className="text-[9.5px] text-muted mb-1">Controller</span>
                  <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs font-mono font-semibold text-primary shadow-sm">
                    getOrderById()
                  </div>
                </div>

                <div className="text-muted/60 text-xs px-1">──▶</div>

                {/* 5. Database Order.findById() */}
                <div className="flex flex-col items-center">
                  <span className="text-[9.5px] text-muted mb-1">Database</span>
                  <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-1 shadow-sm">
                    <Database className="size-5" />
                  </div>
                  <span className="font-mono text-[10.5px] text-emerald-400 font-semibold">
                    Order.findById()
                  </span>
                </div>
              </div>

              {/* Exploit Banner Callout */}
              <div className="rounded-xl border border-dashed border-danger/60 bg-danger/10 p-2.5 text-center text-xs font-mono text-danger flex items-center justify-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>User-controlled input reaches database without ownership validation</span>
              </div>
            </div>

            {/* SECURITY SIGNALS (images/attack-surface.png) */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-fg text-xs">Security Signals</h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {/* 1. Input */}
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-danger font-semibold text-[11.5px]">
                    <AlertTriangle className="size-3.5" />
                    <span>Input</span>
                  </div>
                  <div className="text-[10px] text-muted mt-1">User controlled</div>
                  <div className="font-mono text-[11px] text-fg font-medium truncate">
                    req.params.id
                  </div>
                </div>

                {/* 2. Authentication */}
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11.5px]">
                    <Check className="size-3.5" />
                    <span>Authentication</span>
                  </div>
                  <div className="text-[10px] text-muted mt-1">Present</div>
                  <div className="font-mono text-[11px] text-fg font-medium truncate">
                    JWT middleware
                  </div>
                </div>

                {/* 3. Access Control */}
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-danger font-semibold text-[11.5px]">
                    <AlertTriangle className="size-3.5" />
                    <span>Access Control</span>
                  </div>
                  <div className="text-[10px] text-muted mt-1">Missing</div>
                  <div className="font-mono text-[11px] text-fg font-medium truncate">
                    No ownership check
                  </div>
                </div>

                {/* 4. Database */}
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-danger font-semibold text-[11.5px]">
                    <AlertTriangle className="size-3.5" />
                    <span>Database</span>
                  </div>
                  <div className="text-[10px] text-muted mt-1">Direct query</div>
                  <div className="font-mono text-[11px] text-fg font-medium truncate">
                    Order.findById()
                  </div>
                </div>

                {/* 5. External Service */}
                <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-muted font-semibold text-[11.5px]">
                    <Globe className="size-3.5" />
                    <span>External Service</span>
                  </div>
                  <div className="text-[10px] text-muted mt-1">Not used</div>
                  <div className="font-mono text-[11px] text-muted font-medium">—</div>
                </div>
              </div>
            </div>

            {/* ALERT CARD: Possible IDOR / Broken Access Control */}
            <div className="flex items-start justify-between gap-4 rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-xs">
              <div className="flex items-start gap-3">
                <span className="rounded-md bg-danger text-white px-2 py-0.5 text-[10.5px] font-bold uppercase shrink-0 mt-0.5">
                  High
                </span>
                <div>
                  <h4 className="font-bold text-fg text-sm">
                    Possible IDOR / Broken Access Control
                  </h4>
                  <p className="mt-1 text-muted text-[11.5px] leading-relaxed">
                    User can access arbitrary order by modifying the :id parameter. No ownership
                    validation is performed before querying the database.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <NavLink
                  to="/findings?id=F-0011"
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1.5 font-semibold text-primary hover:bg-primary hover:text-white transition-colors"
                >
                  <span>Inspect Finding</span>
                  <ArrowRight className="size-3" />
                </NavLink>
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-lg hover:bg-surface-alt text-muted"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
          )}

          {/* COVERAGE & HOTSPOTS CARD */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-fg text-sm">Coverage & Hotspots</h3>
              <NavLink
                to="/graph"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>View in Graph</span>
                <ArrowRight className="size-3" />
              </NavLink>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCoverageTab('category')}
                className={cn(
                  'rounded-lg px-2.5 py-1 font-semibold transition-colors',
                  coverageTab === 'category'
                    ? 'bg-primary text-white'
                    : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                By Route Category
              </button>
              <button
                type="button"
                onClick={() => setCoverageTab('risk')}
                className={cn(
                  'rounded-lg px-2.5 py-1 font-medium transition-colors',
                  coverageTab === 'risk'
                    ? 'bg-primary text-white'
                    : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                By Risk
              </button>
              <button
                type="button"
                onClick={() => setCoverageTab('data')}
                className={cn(
                  'rounded-lg px-2.5 py-1 font-medium transition-colors',
                  coverageTab === 'data'
                    ? 'bg-primary text-white'
                    : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                By Data Type
              </button>
              <button
                type="button"
                onClick={() => setCoverageTab('module')}
                className={cn(
                  'rounded-lg px-2.5 py-1 font-medium transition-colors',
                  coverageTab === 'module'
                    ? 'bg-primary text-white'
                    : 'bg-surface-alt text-muted hover:text-fg',
                )}
              >
                By Module
              </button>
            </div>

            {/* 5 Hotspot Progress Bars */}
            <div className="space-y-3 text-xs">
              {/* 1. Public Routes */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="font-medium text-fg">Public Routes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted">8/8</span>
                    <span className="text-[11px] text-emerald-400">No critical issues</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 w-full rounded-full" />
                </div>
              </div>

              {/* 2. Authenticated Routes */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-400" />
                    <span className="font-medium text-fg">Authenticated Routes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted">12/18</span>
                    <span className="text-[11px] text-amber-400">5 need review</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 w-[66%] rounded-full" />
                </div>
              </div>

              {/* 3. Authorization Gaps */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-danger" />
                    <span className="font-medium text-fg">Authorization Gaps</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted">6/6</span>
                    <span className="text-[11px] text-danger font-semibold">High priority</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                  <div className="h-full bg-danger w-full rounded-full" />
                </div>
              </div>

              {/* 4. Sensitive Data Flows */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-purple-400" />
                    <span className="font-medium text-fg">Sensitive Data Flows</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted">9/14</span>
                    <span className="text-[11px] text-amber-400">3 tainted flows</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 w-[64%] rounded-full" />
                </div>
              </div>

              {/* 5. External Calls */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-blue-400" />
                    <span className="font-medium text-fg">External Calls</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted">2/3</span>
                    <span className="text-[11px] text-muted">1 unverified</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 w-[66%] rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── COL 3: Route Inspector Panel (3.5 cols) ── */}
        <div className="lg:col-span-4 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <h3 className="font-bold text-fg text-sm flex items-center gap-2">
              <FileCode className="size-4 text-primary" />
              <span>Route Inspector</span>
            </h3>
            <button
              type="button"
              className="grid size-7 place-items-center rounded-lg hover:bg-surface-alt text-muted"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>

          {/* Section: Protection */}
          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
              Protection
            </h4>
            <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-muted text-[11px]">Authentication</div>
                  <div className="font-mono text-[11.5px] text-fg">
                    JWT middleware (authenticate)
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase border border-emerald-500/30">
                  Present
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-2">
                <div>
                  <div className="text-muted text-[11px]">Authorization</div>
                  <div className="font-mono text-[11.5px] text-danger">Not implemented</div>
                </div>
                <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5 text-[10px] font-bold uppercase border border-danger/30">
                  Missing
                </span>
              </div>
            </div>
          </div>

          {/* Section: Data Access */}
          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
              Data Access
            </h4>
            <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 flex items-center justify-between">
              <div>
                <div className="text-muted text-[11px]">Model: Order</div>
                <div className="font-mono text-[11.5px] text-fg">Order.findById(id)</div>
              </div>
              <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-[10px] font-mono text-muted">
                Direct Query
              </span>
            </div>
          </div>

          {/* Section: User-controlled Inputs */}
          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
              User-controlled Inputs
            </h4>
            <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 flex items-center justify-between">
              <div>
                <div className="font-mono text-[12px] font-bold text-fg">
                  req.params.id <span className="text-muted font-normal text-[11px]">String</span>
                </div>
                <div className="text-[11px] text-muted">From URL parameter</div>
              </div>
              <span className="rounded-full bg-danger/20 text-danger border border-danger/40 px-2.5 py-0.5 text-[10px] font-bold uppercase">
                Tainted
              </span>
            </div>
          </div>

          {/* Section: Dependencies */}
          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
              Dependencies
            </h4>
            <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-muted">Controller:</span>
                <span className="text-fg truncate">controllers/order.controller.ts</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted">Model:</span>
                <span className="text-fg truncate">models/Order.ts</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted">Middleware:</span>
                <span className="text-fg truncate">middleware/authenticate.ts</span>
              </div>
            </div>
          </div>

          {/* Section: Security History */}
          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-fg text-xs uppercase tracking-wider text-muted">
              Security History
            </h4>
            <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 space-y-1 text-xs">
              <div className="flex justify-between text-muted">
                <span>Last analyzed:</span>
                <span className="text-fg">2 hours ago</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Last modified:</span>
                <span className="font-mono text-fg">1 day ago · a1b2c3d</span>
              </div>
              <div className="flex justify-between items-center text-muted pt-1">
                <span className="truncate max-w-[140px]">Modify order controller logic</span>
                <span className="text-primary hover:underline cursor-pointer">View diff →</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate('/graph')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-alt/50 py-2 text-xs font-semibold text-fg hover:bg-surface-alt"
              >
                <GitBranch className="size-3.5 text-primary" />
                <span>Open in Graph</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/agents')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
              >
                <Play className="size-3.5 fill-current" />
                <span>Run Agent</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate('/findings?id=F-0011')}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-danger hover:bg-danger/90 py-2.5 text-xs font-bold text-white shadow-md shadow-danger/20 transition-all cursor-pointer"
            >
              <AlertTriangle className="size-4" />
              <span>Open Finding</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
