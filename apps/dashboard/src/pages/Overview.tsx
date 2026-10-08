import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronRight,
  Database,
  ExternalLink,
  Globe,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchOverview } from '@/lib/api';
import { useGlobalEvents } from '@/hooks/useSse';
import { cn } from '@/lib/utils';

export function Overview() {
  const { activeProject } = useProject();
  const { events: liveEvents } = useGlobalEvents(activeProject?.projectId);

  const { data } = useQuery({
    queryKey: ['overview', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchOverview(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
    refetchInterval: 6000,
  });

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Analyze. Understand. Verify. Track.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <ShieldAlert className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Load a local MERN application repository using the project switcher in the top bar to inspect its security posture.
          </p>
        </div>
      </div>
    );
  }

  const posture = data?.posture || {
    grade: 'D+',
    score: 35,
    statusText: 'At Risk',
    protectedRoutes: 0,
    totalRoutes: 0,
  };

  const findings = data?.findings || {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  // Combine live stream events with recent persisted events
  const timelineEvents = [
    ...liveEvents.map((e) => ({
      ts: e.ts || new Date().toISOString(),
      summary: e.summary || e.kind || 'Security event',
      kind: e.kind || 'event',
    })),
    ...(data?.recentEvents || []).map((e: any) => ({
      ts: e.ts,
      summary: e.summary,
      kind: e.type,
    })),
  ].slice(0, 7);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TOP ROW: Hero + Total Findings Donut + Posture Card                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Hero Banner */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted">
              Application Security Model
            </div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-fg">
              Secure What{' '}
              <span className="bg-gradient-to-r from-primary via-indigo-400 to-secondary bg-clip-text text-transparent">
                You Build
              </span>
            </h1>
            <div className="mt-1 font-medium text-muted text-[13.5px]">
              Analyze. Understand. Verify. Track.
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted/90">
              A living security model for your MERN application — powered by AI specialist agents and real sandbox exploit verification, not blind assumptions.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <NavLink
              to="/attack-surface"
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-alt px-3.5 py-2 text-[12.5px] font-semibold text-fg hover:bg-primary hover:text-white transition-colors"
            >
              <span>Explore Attack Surface</span>
              <ArrowRight className="size-3.5" />
            </NavLink>
            <NavLink
              to="/agents"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 px-3.5 py-2 text-[12.5px] font-medium text-muted hover:text-fg hover:bg-surface-alt transition-colors"
            >
              <Bot className="size-3.5 text-primary" />
              <span>Agents Console</span>
            </NavLink>
          </div>
        </div>

        {/* Center: Total Findings Counter & Breakdown */}
        <div className="lg:col-span-4 flex items-center justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="relative grid size-32 place-items-center rounded-full border-4 border-primary/20 bg-surface">
              <div className="text-center">
                <span className="text-3xl font-extrabold tracking-tight text-fg">{findings.total}</span>
                <span className="block text-[10.5px] font-medium uppercase tracking-wider text-muted">
                  Total Findings
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pr-2">
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="size-2.5 rounded-full bg-danger" />
              <span className="font-bold text-fg">{findings.critical}</span>
              <span className="text-muted">Critical</span>
            </div>
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="size-2.5 rounded-full bg-warning" />
              <span className="font-bold text-fg">{findings.high}</span>
              <span className="text-muted">High</span>
            </div>
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="font-bold text-fg">{findings.medium}</span>
              <span className="text-muted">Medium</span>
            </div>
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="size-2.5 rounded-full bg-info" />
              <span className="font-bold text-fg">{findings.low}</span>
              <span className="text-muted">Low</span>
            </div>
          </div>
        </div>

        {/* Right: Security Posture Score */}
        <div className="lg:col-span-3 flex flex-col justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-muted uppercase tracking-wider">
                Security Posture
              </span>
              <span className="grid size-7 place-items-center rounded-lg bg-success/10 text-success">
                <ShieldCheck className="size-4" />
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-fg">{posture.grade}</span>
              <span className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                posture.grade === 'D+' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning',
              )}>
                {posture.statusText}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[11px] text-muted mb-1.5">
                <span>Route Authorization</span>
                <span className="font-medium text-fg">{posture.protectedRoutes} / {posture.totalRoutes} protected</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-danger transition-all"
                  style={{
                    width: `${posture.totalRoutes > 0 ? (posture.protectedRoutes / posture.totalRoutes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <NavLink
            to="/attack-surface"
            className="mt-4 flex items-center justify-between text-[12px] font-semibold text-primary hover:underline"
          >
            <span>View Details</span>
            <ChevronRight className="size-3.5" />
          </NavLink>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MIDDLE ROW: Mini Graph Preview + Live Activity Stream              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Application Security Graph Preview Widget */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <div>
              <h2 className="text-[15px] font-bold text-fg">Application Security Graph</h2>
              <p className="text-[11.5px] text-muted">Interactive view of your application's security model</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border bg-surface-alt/60 p-0.5 text-[11.5px]">
              <span className="rounded-md bg-surface px-2.5 py-1 font-semibold text-fg shadow-xs">Graph</span>
              <NavLink to="/attack-surface" className="px-2.5 py-1 text-muted hover:text-fg">Routes</NavLink>
              <NavLink to="/graph" className="px-2.5 py-1 text-muted hover:text-fg">Data Flow</NavLink>
            </div>
          </div>

          {/* Graph visual representation */}
          <div className="relative flex-1 min-h-[220px] rounded-xl bg-bg/40 mt-4 p-4 flex items-center justify-center border border-border/40 overflow-hidden">
            <div className="flex items-center justify-center gap-4 md:gap-8 flex-wrap">
              {/* Client Node */}
              <div className="flex flex-col items-center">
                <div className="grid size-11 place-items-center rounded-full border-2 border-primary bg-primary/20 text-primary shadow-lg shadow-primary/20">
                  <Globe className="size-5" />
                </div>
                <span className="mt-1 text-[11px] font-semibold text-fg">Client</span>
              </div>

              <div className="text-muted/60 text-xs">──▶</div>

              {/* Route Node */}
              <div className="flex flex-col items-center">
                <div className="grid size-11 place-items-center rounded-xl border-2 border-danger bg-danger/10 text-danger shadow-lg shadow-danger/10">
                  <ShieldAlert className="size-5" />
                </div>
                <span className="mt-1 text-[11px] font-mono text-danger font-bold">/orders/:id</span>
                <span className="text-[9.5px] text-muted">Unprotected</span>
              </div>

              <div className="text-muted/60 text-xs">──▶</div>

              {/* Controller Node */}
              <div className="flex flex-col items-center">
                <div className="grid size-11 place-items-center rounded-xl border-2 border-info bg-info/10 text-info">
                  <Terminal className="size-5" />
                </div>
                <span className="mt-1 text-[11px] font-mono text-fg">getOrderById()</span>
                <span className="text-[9.5px] text-muted">Controller</span>
              </div>

              <div className="text-muted/60 text-xs">──▶</div>

              {/* Database Node */}
              <div className="flex flex-col items-center">
                <div className="grid size-11 place-items-center rounded-xl border-2 border-success bg-success/10 text-success">
                  <Database className="size-5" />
                </div>
                <span className="mt-1 text-[11px] font-semibold text-fg">MongoDB</span>
                <span className="text-[9.5px] text-muted">Order</span>
              </div>
            </div>

            <NavLink
              to="/graph"
              className="absolute bottom-3 right-3 rounded-lg border bg-surface/90 px-2.5 py-1 text-[11.5px] font-medium text-primary hover:bg-surface flex items-center gap-1 shadow-sm"
            >
              <span>Expand Full Graph</span>
              <ExternalLink className="size-3" />
            </NavLink>
          </div>
        </div>

        {/* Live Activity Stream Widget */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <h2 className="text-[15px] font-bold text-fg">Live Activity</h2>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success animate-ping" />
              Live
            </span>
          </div>

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto max-h-[220px] pr-1">
            {timelineEvents.map((evt, idx) => (
              <div key={idx} className="flex items-start gap-3 text-[12.5px]">
                <span className="font-mono text-[11px] text-muted shrink-0 mt-0.5">
                  {new Date(evt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="size-1.5 rounded-full bg-primary shrink-0 mt-2" />
                <span className="text-fg/90 flex-1 leading-snug">{evt.summary}</span>
              </div>
            ))}
            {timelineEvents.length === 0 && (
              <div className="py-8 text-center text-xs text-muted">
                No recent activity recorded.
              </div>
            )}
          </div>

          <NavLink
            to="/agents"
            className="mt-3 flex items-center justify-between text-[12px] font-semibold text-primary hover:underline pt-2 border-t border-border/60"
          >
            <span>View all activity</span>
            <ChevronRight className="size-3.5" />
          </NavLink>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BOTTOM ROW: Top Findings + Attack Surface + Agent Status Cards     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Top Findings Table */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-[14px] font-bold text-fg">Top Findings</h3>
              <NavLink to="/findings" className="text-[11.5px] font-semibold text-primary hover:underline">
                View all →
              </NavLink>
            </div>

            <div className="mt-3 divide-y divide-border/40">
              {(data?.topFindings || []).map((f) => (
                <div key={f.id} className="py-2.5 flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn(
                      'size-2 rounded-full shrink-0',
                      f.severity === 'critical' ? 'bg-danger' : f.severity === 'high' ? 'bg-warning' : 'bg-info',
                    )} />
                    <span className="font-medium text-fg truncate">{f.type.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                      f.severity === 'critical' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning',
                    )}>
                      {f.severity}
                    </span>
                    <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                      {f.status}
                    </span>
                  </div>
                </div>
              ))}
              {(!data?.topFindings || data.topFindings.length === 0) && (
                <div className="py-6 text-center text-xs text-muted">
                  No confirmed findings recorded.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Attack Surface Summary Donut */}
        <div className="lg:col-span-3 flex flex-col justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-[14px] font-bold text-fg">Attack Surface</h3>
              <NavLink to="/attack-surface" className="text-[11.5px] font-semibold text-primary hover:underline">
                View all →
              </NavLink>
            </div>

            <div className="mt-4 flex flex-col items-center">
              <div className="grid size-28 place-items-center rounded-full border-4 border-primary/30 bg-surface">
                <div className="text-center">
                  <span className="text-2xl font-extrabold text-fg">{posture.totalRoutes}</span>
                  <span className="block text-[9.5px] text-muted uppercase font-bold">API Routes</span>
                </div>
              </div>

              <div className="mt-4 flex w-full justify-around text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-danger" />
                  <span className="text-muted">Unprotected:</span>
                  <span className="font-bold text-fg">{posture.totalRoutes - posture.protectedRoutes}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-success" />
                  <span className="text-muted">Protected:</span>
                  <span className="font-bold text-fg">{posture.protectedRoutes}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-2.5 text-[11.5px] text-danger flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>High risk routes detected without authentication enforcement.</span>
          </div>
        </div>

        {/* Agent Status Cards */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border bg-surface/60 p-6 shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <h3 className="text-[14px] font-bold text-fg">Specialist Agents</h3>
              <span className="text-[11.5px] font-medium text-success">3 Registered</span>
            </div>

            <div className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border bg-surface-alt/40 p-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Shield className="size-4" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-semibold text-fg">Auth / Access Control Agent</div>
                    <div className="text-[10.5px] text-muted">IDOR, missing-auth, privilege escalation</div>
                  </div>
                </div>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  Ready
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-surface-alt/40 p-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-lg bg-info/10 text-info">
                    <Database className="size-4" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-semibold text-fg">Dataflow / Mongo Agent</div>
                    <div className="text-[10.5px] text-muted">NoSQL injection, mass assignment, secrets</div>
                  </div>
                </div>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  Ready
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-surface-alt/40 p-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-lg bg-secondary/10 text-secondary">
                    <Radio className="size-4" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-semibold text-fg">Attack-Path Agent</div>
                    <div className="text-[10.5px] text-muted">Chains confirmed open findings</div>
                  </div>
                </div>
                <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold text-muted">
                  Idle
                </span>
              </div>
            </div>
          </div>

          <NavLink
            to="/agents"
            className="mt-3 block w-full rounded-xl bg-surface-alt py-2 text-center text-[12px] font-semibold text-fg hover:bg-primary hover:text-white transition-colors"
          >
            Open Agent Console →
          </NavLink>
        </div>
      </div>
    </div>
  );
}
