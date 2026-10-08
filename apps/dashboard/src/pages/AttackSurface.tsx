import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  AlertTriangle,
  Code2,
  Database,
  Lock,
  Unlock,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  FileCode,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchRoutes, fetchFindings } from '@/lib/api';
import type { RouteItem, Finding } from '@/lib/api';
import { cn } from '@/lib/utils';

export function AttackSurface() {
  const { activeProject } = useProject();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'CRITICAL' | 'MEDIUM' | 'LOW' | 'GAPS'>('ALL');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['routes', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchRoutes(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const { data: findingsData } = useQuery({
    queryKey: ['findings', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchFindings(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const routes = useMemo<RouteItem[]>(() => routesData?.routes || [], [routesData]);
  const findings = useMemo<Finding[]>(() => findingsData || [], [findingsData]);

  // Map route IDs to findings
  const routeFindingsMap = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      for (const nodeId of f.affectedNodes || []) {
        const list = map.get(nodeId) || [];
        list.push(f);
        map.set(nodeId, list);
      }
    }
    return map;
  }, [findings]);

  // Compute risk for each route based on auth and associated findings
  const getRouteRisk = useCallback((route: RouteItem): { label: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; badgeClass: string } => {
    const rf = routeFindingsMap.get(route.id) || [];
    const hasCrit = rf.some((f) => f.severity === 'critical');
    const hasHigh = rf.some((f) => f.severity === 'high');

    if (hasCrit || (!route.protected && route.mutates)) {
      return { label: 'CRITICAL', badgeClass: 'bg-danger/15 text-danger border-danger/30' };
    }
    if (hasHigh || !route.protected) {
      return { label: 'HIGH', badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30' };
    }
    if (rf.some((f) => f.severity === 'medium') || route.authEnforcement === 'weak') {
      return { label: 'MEDIUM', badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    }
    return { label: 'LOW', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  }, [routeFindingsMap]);

  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      const matchesSearch =
        r.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.handler.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.file.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedMethod !== 'ALL' && r.method !== selectedMethod) return false;

      const risk = getRouteRisk(r);
      if (riskFilter === 'CRITICAL' && risk.label !== 'CRITICAL' && risk.label !== 'HIGH') return false;
      if (riskFilter === 'MEDIUM' && risk.label !== 'MEDIUM') return false;
      if (riskFilter === 'LOW' && risk.label !== 'LOW') return false;
      if (riskFilter === 'GAPS' && r.protected) return false;

      return true;
    });
  }, [routes, searchTerm, selectedMethod, riskFilter, getRouteRisk]);

  const selectedRoute = useMemo(() => {
    if (!routes.length) return null;
    if (selectedRouteId) {
      return routes.find((r) => r.id === selectedRouteId) || routes[0];
    }
    return routes[0];
  }, [routes, selectedRouteId]);

  const selectedRouteFindings = selectedRoute ? routeFindingsMap.get(selectedRoute.id) || [] : [];

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Attack Surface</h1>
          <p className="mt-1 text-sm text-muted">
            Every exposed route, entry point, and security boundary in your application.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <ShieldAlert className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Select or load a project repository to explore its attack surface and route security boundaries.
          </p>
        </div>
      </div>
    );
  }

  const methodColors: Record<string, string> = {
    GET: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    POST: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    PATCH: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    DELETE: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Attack Surface</h1>
        <p className="mt-1 text-sm text-muted">
          Every exposed route, entry point, and security boundary in your application.
        </p>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface/60 p-3">
        <div className="flex flex-1 items-center gap-2 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Filter routes by path, handler, file..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border bg-surface-alt/70 py-1.5 pl-9 pr-3 text-sm text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
            />
          </div>

          {/* HTTP Method selector */}
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="rounded-lg border bg-surface-alt/70 px-3 py-1.5 text-xs font-semibold text-fg/90 focus:border-primary focus:outline-none"
          >
            <option value="ALL">ALL METHODS</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        {/* Risk Pills Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setRiskFilter('ALL')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              riskFilter === 'ALL' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            All ({routes.length})
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('CRITICAL')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              riskFilter === 'CRITICAL' ? 'bg-danger text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Critical Risk
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('MEDIUM')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              riskFilter === 'MEDIUM' ? 'bg-amber-600 text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Medium Risk
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('LOW')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              riskFilter === 'LOW' ? 'bg-emerald-600 text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Low Risk
          </button>
          <button
            type="button"
            onClick={() => setRiskFilter('GAPS')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              riskFilter === 'GAPS' ? 'bg-rose-600 text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Auth Gaps
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Route List | Right Route Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Routes List (7 cols) */}
        <div className="lg:col-span-6 space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
            <span>SHOWING {filteredRoutes.length} ROUTES</span>
            <span>SORT: BY CRITICALITY</span>
          </div>

          {routesLoading ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              Loading attack surface routes...
            </div>
          ) : filteredRoutes.length === 0 ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              No routes match the selected criteria.
            </div>
          ) : (
            filteredRoutes.map((route) => {
              const risk = getRouteRisk(route);
              const isSelected = selectedRoute?.id === route.id;
              const routeFindings = routeFindingsMap.get(route.id) || [];

              return (
                <div
                  key={route.id}
                  onClick={() => setSelectedRouteId(route.id)}
                  className={cn(
                    'group cursor-pointer rounded-xl border p-3.5 transition-all hover:border-primary/50 hover:bg-surface-alt/40',
                    isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 bg-surface/50',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                          methodColors[route.method] || 'bg-surface-alt text-fg border-border',
                        )}
                      >
                        {route.method}
                      </span>
                      <span className="truncate font-mono text-[13.5px] font-medium text-fg">
                        {route.path}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase',
                          risk.badgeClass,
                        )}
                      >
                        {risk.label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-xs text-muted">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11.5px]">
                        {route.protected ? (
                          <>
                            <Lock className="size-3 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Auth Protected</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="size-3 text-rose-400" />
                            <span className="text-rose-400 font-medium">Public / Unprotected</span>
                          </>
                        )}
                      </span>
                      <span className="truncate max-w-[150px] font-mono text-[11px] text-muted/80">
                        {route.handler}
                      </span>
                    </div>

                    {routeFindings.length > 0 && (
                      <span className="flex items-center gap-1 font-semibold text-danger text-[11px]">
                        <AlertTriangle className="size-3" />
                        {routeFindings.length} issue{routeFindings.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Route Inspector (6 cols) */}
        <div className="lg:col-span-6">
          {selectedRoute ? (
            <div className="sticky top-6 rounded-2xl border bg-surface/80 p-5 shadow-lg space-y-6">
              {/* Route Header */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
                        methodColors[selectedRoute.method] || 'bg-surface-alt text-fg',
                      )}
                    >
                      {selectedRoute.method}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase',
                        getRouteRisk(selectedRoute).badgeClass,
                      )}
                    >
                      {getRouteRisk(selectedRoute).label} RISK
                    </span>
                  </div>

                  <NavLink
                    to={`/graph?route=${encodeURIComponent(selectedRoute.id)}`}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View in Graph <ExternalLink className="size-3" />
                  </NavLink>
                </div>

                <h2 className="mt-2.5 font-mono text-lg font-bold text-fg break-all">
                  {selectedRoute.path}
                </h2>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted">
                  <FileCode className="size-3.5 text-muted" />
                  <span className="truncate">{selectedRoute.file}:{selectedRoute.line || 1}</span>
                </div>
              </div>

              {/* Security Flow Diagram (Matches design mockup) */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2.5">
                  Security Flow & Execution Path
                </div>
                <div className="grid grid-cols-5 gap-1.5 rounded-xl border bg-surface-alt/40 p-3 text-center text-xs">
                  {/* Step 1: Client */}
                  <div className="flex flex-col items-center">
                    <div className="grid size-8 place-items-center rounded-lg bg-surface border text-primary mb-1">
                      <Code2 className="size-4" />
                    </div>
                    <span className="font-semibold text-fg text-[11px]">Client</span>
                    <span className="text-[10px] text-muted">Request</span>
                  </div>

                  {/* Step 2: Input */}
                  <div className="flex flex-col items-center">
                    <div className="grid size-8 place-items-center rounded-lg bg-surface border text-indigo-400 mb-1">
                      <Layers className="size-4" />
                    </div>
                    <span className="font-semibold text-fg text-[11px]">Input</span>
                    <span className="text-[10px] text-muted">
                      {selectedRoute.hasInput ? 'Params/Body' : 'None'}
                    </span>
                  </div>

                  {/* Step 3: Auth Middleware */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'grid size-8 place-items-center rounded-lg border mb-1',
                        selectedRoute.protected
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                      )}
                    >
                      {selectedRoute.protected ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                    </div>
                    <span className="font-semibold text-fg text-[11px]">Auth</span>
                    <span className="text-[10px] text-muted">
                      {selectedRoute.protected ? 'Enforced' : 'Bypassed'}
                    </span>
                  </div>

                  {/* Step 4: Controller */}
                  <div className="flex flex-col items-center">
                    <div className="grid size-8 place-items-center rounded-lg bg-surface border text-amber-400 mb-1">
                      <FileCode className="size-4" />
                    </div>
                    <span className="font-semibold text-fg text-[11px]">Handler</span>
                    <span className="text-[10px] text-muted truncate max-w-[65px]">
                      {selectedRoute.handler}
                    </span>
                  </div>

                  {/* Step 5: Database */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'grid size-8 place-items-center rounded-lg border mb-1',
                        selectedRoute.mutates
                          ? 'bg-danger/10 text-danger border-danger/30'
                          : 'bg-surface text-muted border-border',
                      )}
                    >
                      <Database className="size-4" />
                    </div>
                    <span className="font-semibold text-fg text-[11px]">Storage</span>
                    <span className="text-[10px] text-muted">
                      {selectedRoute.mutates ? 'Mutates' : 'Read-only'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security Signals */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Security Signals & Controls
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg border bg-surface-alt/30 px-3 py-2 text-xs">
                    <span className="text-muted">Authentication Guard</span>
                    <span
                      className={cn(
                        'font-semibold',
                        selectedRoute.protected ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {selectedRoute.protected ? 'Active Middleware' : 'Missing (Public)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-surface-alt/30 px-3 py-2 text-xs">
                    <span className="text-muted">State Mutation</span>
                    <span className={cn('font-semibold', selectedRoute.mutates ? 'text-amber-400' : 'text-muted')}>
                      {selectedRoute.mutates ? 'Writes / Updates DB' : 'Read-Only Query'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-surface-alt/30 px-3 py-2 text-xs">
                    <span className="text-muted">Input Parsing</span>
                    <span className="font-semibold text-fg">
                      {selectedRoute.hasInput ? 'Dynamic Parameters present' : 'No parameters identified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Linked Findings */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Identified Vulnerabilities ({selectedRouteFindings.length})
                </div>

                {selectedRouteFindings.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
                    <ShieldCheck className="size-4 shrink-0" />
                    <span>No confirmed vulnerabilities discovered on this route endpoint yet.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedRouteFindings.map((f) => (
                      <NavLink
                        key={f.id}
                        to={`/findings?id=${f.id}`}
                        className="group flex items-center justify-between rounded-xl border border-border/70 bg-surface-alt/30 p-3 hover:border-primary/50 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                f.severity === 'critical' && 'bg-danger/20 text-danger',
                                f.severity === 'high' && 'bg-orange-500/20 text-orange-400',
                                f.severity === 'medium' && 'bg-amber-500/20 text-amber-400',
                                f.severity === 'low' && 'bg-blue-500/20 text-blue-400',
                              )}
                            >
                              {f.severity}
                            </span>
                            <span className="font-semibold text-xs text-fg">{f.type}</span>
                          </div>
                          <p className="mt-1 text-[11.5px] text-muted line-clamp-1">
                            {f.attackPath?.narrative || f.verificationResult?.result || 'Suspected vulnerability'}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-muted group-hover:text-primary transition-colors" />
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface/40 p-12 text-center text-muted">
              Select a route from the list to view its execution path and security controls.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
