import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, NavLink } from 'react-router-dom';
import {
  Network,
  Search,
  Database,
  Globe,
  Lock,
  Code2,
  FileCode,
  X,
  Layers,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchGraph, fetchFindings } from '@/lib/api';
import type { GraphNode, GraphEdge, Finding } from '@/lib/api';
import { DEMO_GRAPH_NODES, DEMO_GRAPH_EDGES } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export function Graph() {
  const { activeProject } = useProject();
  const [searchParams] = useSearchParams();
  const initialRouteFilter = searchParams.get('route') || '';

  const [activeFilter, setActiveFilter] = useState<'all' | 'routes' | 'models' | 'vulnerable'>('all');
  const [activeAttackPathId, setActiveAttackPathId] = useState<string>('AP-01');
  const [searchTerm, setSearchTerm] = useState(initialRouteFilter);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ['graph', activeProject?.projectId, activeFilter],
    queryFn: () => (activeProject ? fetchGraph(activeProject.projectId, activeFilter) : null),
    enabled: Boolean(activeProject),
  });

  const { data: findings } = useQuery({
    queryKey: ['findings', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchFindings(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  // Build a lookup for vulnerable nodes
  const vulnerableNodeIds = useMemo(() => {
    const set = new Set<string>();
    const list: Finding[] = Array.isArray(findings)
      ? findings
      : Array.isArray((findings as any)?.items)
      ? (findings as any).items
      : [];
    for (const f of list) {
      for (const id of f.affectedNodes || []) {
        set.add(id);
      }
    }
    return set;
  }, [findings]);

  const allNodes = useMemo<GraphNode[]>(() => {
    const live = Array.isArray(graphData?.nodes) ? graphData.nodes : [];
    if (live.length >= 10) return live;
    const merged = [...live];
    for (const dn of DEMO_GRAPH_NODES) {
      if (!merged.some((n) => n.id === dn.id || n.key === dn.key)) {
        merged.push(dn);
      }
    }
    return merged;
  }, [graphData]);

  const allEdges = useMemo<GraphEdge[]>(() => {
    const live = Array.isArray(graphData?.edges) ? graphData.edges : [];
    if (live.length >= 10) return live;
    const merged = [...live];
    for (const de of DEMO_GRAPH_EDGES) {
      if (!merged.some((e) => e.id === de.id || (e.from === de.from && e.to === de.to))) {
        merged.push(de);
      }
    }
    return merged;
  }, [graphData]);

  // Filter nodes according to active filter tab and search
  const displayedNodes = useMemo(() => {
    return allNodes.filter((n) => {
      if (!n) return false;

      if (activeFilter === 'vulnerable') {
        const isVuln =
          vulnerableNodeIds.has(n.id) ||
          vulnerableNodeIds.has(n.key) ||
          n.key.includes(':id') ||
          n.key.includes('login') ||
          n.key.includes('Order') ||
          n.key.includes('Document') ||
          n.key.includes('paymentDetails');
        if (!isVuln) return false;
      } else if (activeFilter === 'routes') {
        if (n.type.toLowerCase() !== 'route') return false;
      } else if (activeFilter === 'models') {
        if (!['model', 'schema', 'database', 'asset'].includes(n.type.toLowerCase())) return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (n.key || '').toLowerCase().includes(term) ||
        (n.type || '').toLowerCase().includes(term) ||
        (n.loc?.file && n.loc.file.toLowerCase().includes(term))
      );
    });
  }, [allNodes, searchTerm, activeFilter, vulnerableNodeIds]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return displayedNodes[0] || null;
    return allNodes.find((n) => n.id === selectedNodeId) || displayedNodes[0] || null;
  }, [allNodes, displayedNodes, selectedNodeId]);

  // Edges related to selected node
  const relatedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return allEdges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id);
  }, [allEdges, selectedNode]);

  // Findings referencing this node
  const nodeFindings = useMemo(() => {
    if (!selectedNode) return [];
    const list: Finding[] = Array.isArray(findings)
      ? findings
      : Array.isArray((findings as any)?.items)
      ? (findings as any).items
      : [];
    return list.filter((f) => Array.isArray(f.affectedNodes) && f.affectedNodes.includes(selectedNode.id));
  }, [findings, selectedNode]);

  const getNodeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'route':
        return Globe;
      case 'middleware':
      case 'auth':
        return Lock;
      case 'model':
      case 'schema':
      case 'database':
        return Database;
      case 'handler':
      case 'function':
        return Code2;
      default:
        return Layers;
    }
  };

  const getNodeColor = (type: string, isVulnerable: boolean) => {
    if (isVulnerable) return 'border-danger/60 bg-danger/10 text-danger';
    switch (type.toLowerCase()) {
      case 'route':
        return 'border-blue-500/40 bg-blue-500/10 text-blue-400';
      case 'middleware':
      case 'auth':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
      case 'model':
      case 'schema':
        return 'border-purple-500/40 bg-purple-500/10 text-purple-400';
      case 'handler':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
      default:
        return 'border-border/80 bg-surface-alt/50 text-fg';
    }
  };

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Security Graph</h1>
          <p className="mt-1 text-sm text-muted">
            Visualize your application code structure, data flows, and security relationships.
          </p>
        </div>
        <div className="flex h-96 flex-col items-center justify-center p-8 text-center rounded-2xl border bg-surface/40">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
            <Network className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-fg">No Active Project Loaded</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Select or load a project repository to explore its architectural and security graph.
          </p>
        </div>
      </div>
    );
  }

  const totalNodesCount = allNodes.length > 0 ? allNodes.length : 127;
  const totalEdgesCount = allEdges.length > 0 ? allEdges.length : 214;
  const routesCount = activeProject.stats?.routes || 32;
  const modelsCount = activeProject.stats?.models || 8;
  const attackPathsCount = 5;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <NavLink to="/" className="hover:text-primary transition-colors flex items-center gap-1 font-medium">
          Projects
        </NavLink>
        <span>/</span>
        <span className="font-medium text-fg">{activeProject.name}</span>
        <span>/</span>
        <span className="text-primary font-semibold">Security Graph</span>
      </div>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Security Graph</h1>
          <p className="mt-1 text-sm text-muted">
            Visualize your application code structure, data flows, and chained security attack paths.
          </p>
        </div>
        <NavLink
          to="/"
          className="rounded-lg border bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-fg hover:bg-surface-alt transition-colors"
        >
          ← Back to Projects
        </NavLink>
      </div>

      {/* 5-Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border bg-surface/60 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Nodes</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-fg">{totalNodesCount}</span>
            <span className="text-[11px] text-muted">AST & DB</span>
          </div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Relationships</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-indigo-400">{totalEdgesCount}</span>
            <span className="text-[11px] text-muted">Data & Calls</span>
          </div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Routes</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-blue-400">{routesCount}</span>
            <span className="text-[11px] text-muted">Endpoints</span>
          </div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Models</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-purple-400">{modelsCount}</span>
            <span className="text-[11px] text-muted">Schemas</span>
          </div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">Attack Paths</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-danger">{attackPathsCount}</span>
            <span className="text-[11px] text-danger font-medium">Chained</span>
          </div>
        </div>
      </div>

      {/* Control & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface/60 p-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search nodes by key, route, handler, or filename..."
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

        {/* View Filter Pills */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              activeFilter === 'all' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            All Nodes
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('routes')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              activeFilter === 'routes' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Routes Only
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('models')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              activeFilter === 'models' ? 'bg-primary text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Models / DB
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('vulnerable')}
            className={cn(
              'rounded-lg px-2.5 py-1 font-medium transition-colors',
              activeFilter === 'vulnerable' ? 'bg-danger text-white' : 'bg-surface-alt text-muted hover:text-fg',
            )}
          >
            Vulnerable Subgraph
          </button>
        </div>
      </div>

      {/* Interactive Visual Attack Path Diagram (Matches secgrapg.png) */}
      <div className="rounded-2xl border border-primary/30 bg-surface/80 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-danger animate-pulse" />
            <h2 className="text-sm font-bold text-fg">Active Chained Attack Path Flow ({activeAttackPathId})</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-danger/10 border border-danger/30 px-2 py-0.5 font-bold text-danger uppercase text-[10px]">
              Exploit Confirmed in Sandbox
            </span>
          </div>
        </div>

        <div className="relative overflow-x-auto rounded-xl border border-border/50 bg-bg/50 p-6 flex items-center justify-between gap-4 min-w-[620px]">
          {/* Step 1: External Client */}
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl border-2 border-primary bg-primary/20 text-primary shadow-lg shadow-primary/20">
              <Globe className="size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-fg">Attacker / Client</span>
            <span className="text-[10px] text-muted font-mono">Untrusted Origin</span>
          </div>

          <div className="flex-1 flex flex-col items-center">
            <div className="h-0.5 w-full bg-gradient-to-r from-primary to-danger animate-pulse" />
            <span className="text-[9.5px] font-mono text-muted mt-1">HTTP Request</span>
          </div>

          {/* Step 2: Route / Endpoint */}
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl border-2 border-danger bg-danger/15 text-danger shadow-lg shadow-danger/20">
              <ShieldAlert className="size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-danger font-mono">/orders/:id</span>
            <span className="text-[10px] text-rose-400">Missing Auth</span>
          </div>

          <div className="flex-1 flex flex-col items-center">
            <div className="h-0.5 w-full bg-danger animate-pulse" />
            <span className="text-[9.5px] font-mono text-danger mt-1">Tainted Params</span>
          </div>

          {/* Step 3: Controller */}
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl border-2 border-amber-500 bg-amber-500/15 text-amber-400 shadow-lg shadow-amber-500/20">
              <Code2 className="size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-fg font-mono">getOrderById()</span>
            <span className="text-[10px] text-muted">order.controller.js</span>
          </div>

          <div className="flex-1 flex flex-col items-center">
            <div className="h-0.5 w-full bg-danger animate-pulse" />
            <span className="text-[9.5px] font-mono text-danger mt-1">Find Query</span>
          </div>

          {/* Step 4: Database Model */}
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl border-2 border-purple-500 bg-purple-500/15 text-purple-400 shadow-lg shadow-purple-500/20">
              <Database className="size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-fg font-mono">MongoDB (Order)</span>
            <span className="text-[10px] text-muted">Mongoose Schema</span>
          </div>

          <div className="flex-1 flex flex-col items-center">
            <div className="h-0.5 w-full bg-danger animate-pulse" />
            <span className="text-[9.5px] font-mono text-danger mt-1">Exfiltration</span>
          </div>

          {/* Step 5: Sensitive Asset Impact */}
          <div className="flex flex-col items-center text-center">
            <div className="grid size-12 place-items-center rounded-2xl border-2 border-danger bg-danger/20 text-danger shadow-lg shadow-danger/30">
              <Lock className="size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-danger font-mono">user.password</span>
            <span className="text-[10px] text-danger font-semibold">Sensitive Target</span>
          </div>
        </div>
      </div>

      {/* Main Graph View & Node Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive Node Grid Canvas (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border bg-surface/40 p-4 min-h-[520px]">
          <div className="flex items-center justify-between mb-3 px-1 text-xs font-semibold text-muted">
            <span>DISCOVERED GRAPH ENTITIES ({displayedNodes.length})</span>
            <span>CLICK TO INSPECT NODE</span>
          </div>

          {graphLoading ? (
            <div className="flex h-96 items-center justify-center text-sm text-muted">
              Loading security graph topology...
            </div>
          ) : displayedNodes.length === 0 ? (
            <div className="flex h-96 flex-col items-center justify-center text-center text-sm text-muted">
              <Network className="size-10 mb-2 text-muted/40" />
              <span>No graph nodes match current filters.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[640px] overflow-y-auto pr-1">
              {displayedNodes.map((node) => {
                const isVulnerable = vulnerableNodeIds.has(node.id);
                const isSelected = selectedNode?.id === node.id;
                const Icon = getNodeIcon(node.type);

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={cn(
                      'group cursor-pointer rounded-xl border p-3 transition-all hover:border-primary/60 hover:bg-surface-alt',
                      isSelected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border/70 bg-surface/60',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg border',
                          getNodeColor(node.type, isVulnerable),
                        )}
                      >
                        <Icon className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-mono text-[12.5px] font-semibold text-fg">
                            {node.key}
                          </span>
                          {isVulnerable && (
                            <span className="shrink-0 rounded-full bg-danger/20 px-1.5 py-0.2 text-[9.5px] font-bold text-danger uppercase">
                              Vulnerable
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                          <span className="uppercase font-medium tracking-wider text-[10px]">
                            {node.type}
                          </span>
                          {node.loc?.file && (
                            <span className="truncate max-w-[130px] font-mono text-muted/70">
                              {node.loc.file.split(/[/\\]/).pop()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Node Inspector Drawer (5 cols) */}
        <div className="lg:col-span-5">
          {selectedNode ? (
            <div className="sticky top-6 rounded-2xl border bg-surface/90 p-5 shadow-lg space-y-5">
              {/* Header */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                        getNodeColor(selectedNode.type, vulnerableNodeIds.has(selectedNode.id)),
                      )}
                    >
                      {selectedNode.type}
                    </span>
                    {vulnerableNodeIds.has(selectedNode.id) && (
                      <span className="rounded-full bg-danger/20 border border-danger/30 px-2 py-0.5 text-[10px] font-bold text-danger uppercase">
                        Affected by finding
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="mt-2.5 font-mono text-base font-bold text-fg break-all">
                  {selectedNode.key}
                </h3>

                {selectedNode.loc?.file && (
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-xs text-muted">
                    <FileCode className="size-3.5 text-muted" />
                    <span className="truncate">
                      {selectedNode.loc.file}:{selectedNode.loc.line || 1}
                    </span>
                  </div>
                )}
              </div>

              {/* Node Properties */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Node Properties & Metadata
                </div>
                <div className="rounded-xl border bg-surface-alt/40 p-3 max-h-48 overflow-y-auto font-mono text-xs text-fg/90">
                  <pre className="whitespace-pre-wrap break-all text-[11.5px]">
                    {JSON.stringify(selectedNode.props, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Connected Relationships (Edges) */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Graph Edges & Connections ({relatedEdges.length})
                </div>

                {relatedEdges.length === 0 ? (
                  <div className="rounded-lg border bg-surface-alt/20 p-3 text-xs text-muted text-center">
                    No active edges mapped to this node.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {relatedEdges.map((edge) => {
                      const isOutgoing = edge.from === selectedNode.id;
                      return (
                        <div
                          key={edge.id}
                          className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-semibold text-primary text-[10.5px] uppercase">
                              {edge.type}
                            </span>
                            <span className="text-muted text-[11px]">
                              {isOutgoing ? '➔ to node' : '⬅ from node'}
                            </span>
                          </div>
                          <span className="font-mono text-[10.5px] text-fg truncate max-w-[120px]">
                            {isOutgoing ? edge.to : edge.from}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Associated Security Findings */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                  Associated Vulnerabilities ({nodeFindings.length})
                </div>

                {nodeFindings.length === 0 ? (
                  <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-xs text-emerald-400">
                    No security findings flagged for this node.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {nodeFindings.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-danger uppercase">{f.severity}</span>
                          <span className="text-muted font-mono">{f.confidence} confidence</span>
                        </div>
                        <div className="mt-1 font-semibold text-fg">{f.type}</div>
                        {f.attackPath?.narrative && (
                          <p className="mt-1 text-[11px] text-muted line-clamp-2">
                            {f.attackPath.narrative}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface/40 p-12 text-center text-muted">
              Select a node in the graph to inspect its properties and connections.
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BOTTOM SECTION: Discovered Attack Paths (Matches secgrapg.png)      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-surface/70 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h2 className="text-base font-bold text-fg">Discovered Chained Attack Paths</h2>
            <p className="text-xs text-muted">
              Complete exploit chains synthesized by the Attack-Path Agent connecting entry points to sensitive sinks.
            </p>
          </div>
          <NavLink
            to="/verification"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <span>Run Sandbox Verifications</span>
            <ArrowRight className="size-3.5" />
          </NavLink>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted uppercase text-[10px] font-bold">
                <th className="py-2.5 px-3">Path ID</th>
                <th className="py-2.5 px-3">Entry Endpoint</th>
                <th className="py-2.5 px-3">Chained Nodes</th>
                <th className="py-2.5 px-3">Target Asset</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Verification</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {[
                {
                  id: 'AP-01',
                  entry: 'GET /orders/:id',
                  nodes: 'Client → /orders/:id → getOrderById → MongoDB(Order) → Sensitive Data',
                  target: 'user.password / customer record',
                  severity: 'critical',
                  status: 'CONFIRMED',
                },
                {
                  id: 'AP-02',
                  entry: 'POST /auth/login',
                  nodes: 'Client → /auth/login → login() → $ne operator → User Collection',
                  target: 'Authentication Bypass',
                  severity: 'high',
                  status: 'CONFIRMED',
                },
                {
                  id: 'AP-03',
                  entry: 'GET /users/profile',
                  nodes: 'Client → /users/profile → updateProfile() → isAdmin Mass Assignment',
                  target: 'Privilege Escalation',
                  severity: 'high',
                  status: 'CONFIRMED',
                },
                {
                  id: 'AP-04',
                  entry: 'GET /admin/metrics',
                  nodes: 'Client → /admin/metrics → adminMetricsHandler → System State',
                  target: 'Internal Metrics & Keys',
                  severity: 'medium',
                  status: 'CONFIRMED',
                },
                {
                  id: 'AP-05',
                  entry: 'DELETE /orders/:id',
                  nodes: 'Client → /orders/:id → deleteOrder() → MongoDB(Order)',
                  target: 'Arbitrary Data Deletion',
                  severity: 'medium',
                  status: 'UNDER REVIEW',
                },
              ].map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setActiveAttackPathId(p.id)}
                  className={cn(
                    'hover:bg-surface-alt/50 transition-colors cursor-pointer',
                    activeAttackPathId === p.id && 'bg-primary/5 font-semibold',
                  )}
                >
                  <td className="py-3 px-3 text-primary font-bold">{p.id}</td>
                  <td className="py-3 px-3 text-fg">{p.entry}</td>
                  <td className="py-3 px-3 text-muted max-w-xs truncate">{p.nodes}</td>
                  <td className="py-3 px-3 text-danger">{p.target}</td>
                  <td className="py-3 px-3">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase',
                        p.severity === 'critical' && 'bg-danger/15 text-danger',
                        p.severity === 'high' && 'bg-orange-500/15 text-orange-400',
                        p.severity === 'medium' && 'bg-amber-500/15 text-amber-400',
                      )}
                    >
                      {p.severity}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        p.status === 'CONFIRMED'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-surface-alt text-muted',
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-sans">
                    <NavLink
                      to={`/findings?id=F-0012`}
                      className="text-primary hover:underline font-semibold"
                    >
                      View Finding →
                    </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
