import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchGraph, fetchFindings } from '@/lib/api';
import type { GraphNode, GraphEdge } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Graph() {
  const { activeProject } = useProject();
  const [searchParams] = useSearchParams();
  const initialRouteFilter = searchParams.get('route') || '';

  const [activeFilter, setActiveFilter] = useState<'all' | 'routes' | 'models' | 'vulnerable'>('all');
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

  const allNodes = useMemo<GraphNode[]>(() => graphData?.nodes || [], [graphData]);
  const allEdges = useMemo<GraphEdge[]>(() => graphData?.edges || [], [graphData]);

  // Filter nodes according to search
  const displayedNodes = useMemo(() => {
    return allNodes.filter((n) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        n.key.toLowerCase().includes(term) ||
        n.type.toLowerCase().includes(term) ||
        (n.loc?.file && n.loc.file.toLowerCase().includes(term))
      );
    });
  }, [allNodes, searchTerm]);

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
    if (!selectedNode || !findings) return [];
    return findings.filter((f) => f.affectedNodes?.includes(selectedNode.id));
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

  // Build a lookup for vulnerable nodes
  const vulnerableNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of findings || []) {
      for (const id of f.affectedNodes || []) {
        set.add(id);
      }
    }
    return set;
  }, [findings]);

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Security Graph</h1>
        <p className="mt-1 text-sm text-muted">
          Visualize your application code structure, data flows, and security relationships.
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-surface/60 p-4">
          <div className="text-xs font-semibold text-muted uppercase">Total Graph Nodes</div>
          <div className="mt-1 text-2xl font-bold text-fg">{allNodes.length}</div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-4">
          <div className="text-xs font-semibold text-muted uppercase">Dependency Edges</div>
          <div className="mt-1 text-2xl font-bold text-fg">{allEdges.length}</div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-4">
          <div className="text-xs font-semibold text-muted uppercase">Vulnerable Nodes</div>
          <div className="mt-1 text-2xl font-bold text-danger">{vulnerableNodeIds.size}</div>
        </div>
        <div className="rounded-xl border bg-surface/60 p-4">
          <div className="text-xs font-semibold text-muted uppercase">Identified Attack Paths</div>
          <div className="mt-1 text-2xl font-bold text-primary">
            {findings?.filter((f) => f.attackPath)?.length || 0}
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
    </div>
  );
}
