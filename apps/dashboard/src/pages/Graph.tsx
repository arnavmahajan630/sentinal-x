import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Network,
  Search,
  Database,
  Globe,
  Lock,
  Code2,
  FileCode,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  SlidersHorizontal,
  Maximize2,
  Settings as SettingsIcon,
  Download,
  Eye,
  CheckCircle2,
  ChevronRight,
  Layers,
  Sparkles,
  Shield,
  FileText,
  Key,
  Mail,
  Cpu,
  Terminal,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { fetchGraph, fetchFindings } from '@/lib/api';
import type { GraphNode, GraphEdge, Finding } from '@/lib/api';
import { DEMO_GRAPH_NODES, DEMO_GRAPH_EDGES, DEMO_FINDINGS } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

export function Graph() {
  const navigate = useNavigate();
  const { activeProject } = useProject();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeType, setSelectedNodeType] = useState<string>('ALL');
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');
  const [selectedView, setSelectedView] = useState<'graph' | 'tree' | 'table'>('graph');
  const [showPaths, setShowPaths] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [detailTab, setDetailTab] = useState<'relationships' | 'findings' | 'context'>('relationships');
  const [zoomLevel, setZoomLevel] = useState(100);

  const { data: graphData } = useQuery({
    queryKey: ['graph', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchGraph(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const { data: findingsData } = useQuery({
    queryKey: ['findings', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchFindings(activeProject.projectId) : null),
    enabled: Boolean(activeProject),
  });

  const findingsList = useMemo<Finding[]>(() => {
    if (Array.isArray(findingsData)) return findingsData;
    return [];
  }, [findingsData]);

  const totalNodes = graphData?.nodes?.length ?? 0;
  const totalEdges = graphData?.edges?.length ?? 0;
  const entryPoints = graphData?.nodes?.filter((n) => n.type?.toLowerCase() === 'route').length ?? 0;
  const highRiskPaths = findingsList.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  const criticalFindings = findingsList.filter((f) => f.severity === 'critical').length;

  // Set of node IDs affected by findings
  const vulnerableNodeIds = useMemo(() => {
    const set = new Set<string>();
    findingsList.forEach((f) => {
      f.affectedNodes?.forEach((n) => set.add(n));
    });
    return set;
  }, [findingsList]);

  // Filtered nodes based on search and filters
  const filteredNodes = useMemo(() => {
    const rawNodes = graphData?.nodes || [];
    return rawNodes.filter((node) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          node.key?.toLowerCase().includes(q) ||
          node.id?.toLowerCase().includes(q) ||
          node.type?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedNodeType !== 'ALL') {
        if (node.type?.toLowerCase() !== selectedNodeType.toLowerCase()) return false;
      }
      if (selectedRisk !== 'ALL') {
        const isVuln = vulnerableNodeIds.has(node.id) || vulnerableNodeIds.has(node.key);
        if (!isVuln) return false;
      }
      return true;
    });
  }, [graphData?.nodes, searchTerm, selectedNodeType, selectedRisk, vulnerableNodeIds]);

  // Group nodes into 4 columns (tiers) for layout
  const tieredNodes = useMemo(() => {
    const col1: GraphNode[] = []; // Routes & Inputs
    const col2: GraphNode[] = []; // Middleware & Functions
    const col3: GraphNode[] = []; // Models & Databases
    const col4: GraphNode[] = []; // Assets, Secrets, External

    filteredNodes.forEach((node) => {
      const t = node.type?.toLowerCase();
      if (t === 'route' || t === 'input') {
        if (col1.length < 5 || vulnerableNodeIds.has(node.id)) col1.push(node);
      } else if (t === 'middleware' || t === 'function') {
        if (col2.length < 5 || vulnerableNodeIds.has(node.id)) col2.push(node);
      } else if (t === 'model' || t === 'database') {
        if (col3.length < 5 || vulnerableNodeIds.has(node.id)) col3.push(node);
      } else {
        if (col4.length < 5 || vulnerableNodeIds.has(node.id)) col4.push(node);
      }
    });

    return {
      col1: col1.slice(0, 5),
      col2: col2.slice(0, 5),
      col3: col3.slice(0, 5),
      col4: col4.slice(0, 5),
    };
  }, [filteredNodes, vulnerableNodeIds]);

  // Position nodes on canvas
  const { nodeCoords, allVisibleNodes } = useMemo(() => {
    const coords: Record<string, { x: number; y: number; node: GraphNode }> = {};
    const visible: Array<{ x: number; y: number; node: GraphNode }> = [];

    const placeCol = (list: GraphNode[], x: number) => {
      list.forEach((node, i) => {
        const y = 50 + i * 90;
        coords[node.id] = { x, y, node };
        coords[node.key] = { x, y, node };
        visible.push({ x, y, node });
      });
    };

    placeCol(tieredNodes.col1, 150);
    placeCol(tieredNodes.col2, 340);
    placeCol(tieredNodes.col3, 530);
    placeCol(tieredNodes.col4, 720);

    return { nodeCoords: coords, allVisibleNodes: visible };
  }, [tieredNodes]);

  // Selected node
  const activeSelectedNodeId = selectedNodeId || allVisibleNodes[0]?.node?.id || graphData?.nodes?.[0]?.id || '';
  const selectedNode = useMemo(() => {
    const all = graphData?.nodes || [];
    return all.find((n) => n.id === activeSelectedNodeId || n.key === activeSelectedNodeId) || all[0] || null;
  }, [graphData?.nodes, activeSelectedNodeId]);

  // Visible edges
  const visibleEdges = useMemo(() => {
    const rawEdges = graphData?.edges || [];
    return rawEdges.filter((e) => nodeCoords[e.from] && nodeCoords[e.to]);
  }, [graphData?.edges, nodeCoords]);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER                                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={`Projects > ${activeProject?.name || 'vulnerable-mern-app'} > Security Graph`}
        title="Security Graph"
        tagline="Visualize your application. See how it all connects."
        quote="Every vulnerability is a path. The graph shows you the bigger picture."
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. FIVE METRIC CARDS (images/secgrapg.png)                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Card 1: Total Nodes */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            <Network className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{totalNodes}</div>
            <div className="text-xs text-muted font-medium">Total Nodes</div>
          </div>
        </div>

        {/* Card 2: Relationships */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Layers className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{totalEdges}</div>
            <div className="text-xs text-muted font-medium">Relationships</div>
          </div>
        </div>

        {/* Card 3: External Entry Points */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Globe className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{entryPoints}</div>
            <div className="text-xs text-muted font-medium">External Entry Points</div>
          </div>
        </div>

        {/* Card 4: High Risk Paths */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20 shrink-0">
            <AlertTriangle className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{highRiskPaths}</div>
            <div className="text-xs text-muted font-medium">High Risk Paths</div>
          </div>
        </div>

        {/* Card 5: Critical Findings */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20 shrink-0">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">{criticalFindings}</div>
            <div className="text-xs text-muted font-medium">Critical Findings</div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. FILTER BAR (images/secgrapg.png)                                 */}
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
              placeholder="Search nodes (e.g. /orders, authenticate, MongoDB)..."
              className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-1.5 pl-9 pr-3 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
            />
          </div>

          <select
            value={selectedNodeType}
            onChange={(e) => setSelectedNodeType(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="ALL">Node Type: All ⌵</option>
            <option value="Route">Routes</option>
            <option value="Function">Functions</option>
            <option value="Middleware">Middleware</option>
            <option value="Model">Models</option>
            <option value="Asset">Assets</option>
          </select>

          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer"
          >
            <option value="ALL">Risk Level: All ⌵</option>
            <option value="Critical">Critical Findings</option>
            <option value="High">High Risk Paths</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Layer ⌵</option>
            <option>Presentation</option>
            <option>Business Logic</option>
            <option>Data</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Cluster ⌵</option>
            <option>Auth</option>
            <option>Orders</option>
            <option>Users</option>
          </select>

          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface-alt/50 text-muted hover:text-fg"
          >
            <SlidersHorizontal className="size-3.5" />
          </button>
        </div>

        {/* View Switcher: Graph | Tree | Table */}
        <div className="flex rounded-xl border border-border/80 bg-surface-alt/50 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setSelectedView('graph')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors',
              selectedView === 'graph' ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-fg',
            )}
          >
            <Network className="size-3.5" />
            <span>Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedView('tree')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors',
              selectedView === 'tree' ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-fg',
            )}
          >
            <Layers className="size-3.5" />
            <span>Tree</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedView('table')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors',
              selectedView === 'table' ? 'bg-primary text-white font-semibold' : 'text-muted hover:text-fg',
            )}
          >
            <FileText className="size-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. CANVAS / VISUALIZATION AREA (images/secgrapg.png)                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-border/80 bg-[#080d16] p-6 shadow-md overflow-hidden min-h-[580px] flex">
        {/* Floating Left: Node Types Legend */}
        <div className="absolute left-6 top-6 z-20 w-44 rounded-2xl border border-border/80 bg-surface/90 p-3.5 backdrop-blur-md shadow-lg text-xs space-y-2">
          <div className="flex items-center justify-between font-bold text-fg text-xs pb-1 border-b border-border/60">
            <span>Node Types</span>
            <span className="text-muted text-[10px]">^</span>
          </div>
          <div className="space-y-1.5 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-500" />
                <span className="text-muted">Route</span>
              </span>
              <span className="font-mono text-muted">42</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-cyan-400" />
                <span className="text-muted">Function</span>
              </span>
              <span className="font-mono text-muted">28</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400" />
                <span className="text-muted">Middleware</span>
              </span>
              <span className="font-mono text-muted">12</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-400" />
                <span className="text-muted">Database</span>
              </span>
              <span className="font-mono text-muted">8</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-purple-400" />
                <span className="text-muted">External Service</span>
              </span>
              <span className="font-mono text-muted">6</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-blue-400" />
                <span className="text-muted">File</span>
              </span>
              <span className="font-mono text-muted">18</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-slate-400" />
                <span className="text-muted">Configuration</span>
              </span>
              <span className="font-mono text-muted">7</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-orange-400" />
                <span className="text-muted">User Input</span>
              </span>
              <span className="font-mono text-muted">14</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-pink-500" />
                <span className="text-muted">Sensitive Data</span>
              </span>
              <span className="font-mono text-muted">8</span>
            </div>
          </div>
        </div>

        {/* Top-Right Canvas Controls */}
        <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface/80 text-muted hover:text-fg backdrop-blur-md"
            title="Fullscreen"
          >
            <Maximize2 className="size-3.5" />
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface/80 text-muted hover:text-fg backdrop-blur-md"
            title="Lock view"
          >
            <Lock className="size-3.5" />
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface/80 text-muted hover:text-fg backdrop-blur-md"
            title="Settings"
          >
            <SettingsIcon className="size-3.5" />
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface/80 px-3 py-1.5 text-xs font-medium text-fg backdrop-blur-md">
            <span>Show Paths</span>
            <button
              type="button"
              onClick={() => setShowPaths(!showPaths)}
              className={cn(
                'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                showPaths ? 'bg-primary' : 'bg-surface-alt',
              )}
            >
              <span
                className={cn(
                  'inline-block size-3 transform rounded-full bg-white transition-transform',
                  showPaths ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        </div>

        {/* Main Canvas Interactive Topology Map (Matching secgrapg.png) */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto min-h-[500px]">
          <div
            className="relative w-full max-w-5xl min-h-[480px] flex items-center justify-center"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          >
            {/* SVG Relationship Lines Background */}
            <svg className="absolute inset-0 size-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              {/* Virtual Client connecting to first Route */}
              {showPaths && tieredNodes.col1[0] && (() => {
                const targetNode = tieredNodes.col1[0];
                const pos = targetNode ? nodeCoords[targetNode.id] : undefined;
                const targetY = (pos?.y ?? 50) + 22;
                const targetX = pos?.x ?? 150;
                return (
                  <path
                    d={`M 65 220 C 100 220, 110 ${targetY}, ${targetX} ${targetY}`}
                    stroke="#3b66ff"
                    strokeWidth="2"
                    fill="none"
                  />
                );
              })()}

              {/* Dynamic Real Edges */}
              {showPaths && visibleEdges.map((edge, idx) => {
                const fromPos = nodeCoords[edge.from];
                const toPos = nodeCoords[edge.to];
                if (!fromPos || !toPos) return null;
                const isEdgeVuln = (vulnerableNodeIds.has(edge.from) || vulnerableNodeIds.has(edge.to));
                const x1 = fromPos.x + 120;
                const y1 = fromPos.y + 24;
                const x2 = toPos.x;
                const y2 = toPos.y + 24;
                const dx = Math.abs(x2 - x1) * 0.5;

                return (
                  <path
                    key={edge.id || `${edge.from}-${edge.to}-${idx}`}
                    d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                    stroke={isEdgeVuln ? '#ef4444' : edge.type === 'ACCESSES' ? '#f59e0b' : edge.type === 'PROTECTED_BY' ? '#10b981' : '#3b66ff'}
                    strokeWidth={isEdgeVuln ? 2.5 : 1.8}
                    strokeDasharray={isEdgeVuln ? '5 4' : 'none'}
                    fill="none"
                  />
                );
              })}
            </svg>

            {/* Virtual Client Node */}
            <div
              onClick={() => setSelectedNodeId('node-client')}
              className="absolute left-4 top-[200px] flex flex-col items-center cursor-pointer group"
            >
              <div className="grid size-12 place-items-center rounded-full border-2 border-primary bg-primary/20 text-primary shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                <Globe className="size-6" />
              </div>
              <span className="mt-1.5 font-bold text-fg text-xs">Client</span>
              <span className="text-[10px] text-muted">(External)</span>
            </div>

            {/* Dynamic AST Nodes */}
            {allVisibleNodes.map(({ x, y, node }) => {
              const isNodeSelected = selectedNode?.id === node.id || selectedNode?.key === node.key;
              const isNodeVuln = vulnerableNodeIds.has(node.id) || vulnerableNodeIds.has(node.key);
              const label =
                node.props?.path ||
                node.props?.model ||
                node.props?.field ||
                node.props?.name ||
                node.key?.split('#')[1] ||
                node.key?.split('/').pop() ||
                node.key ||
                node.id;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  style={{ left: `${x}px`, top: `${y}px` }}
                  className={cn(
                    'absolute rounded-xl p-2.5 shadow-md cursor-pointer transition-all max-w-[155px] min-w-[125px]',
                    isNodeVuln
                      ? 'border-2 border-danger bg-danger/15 shadow-danger/25 ring-2 ring-danger/40 animate-pulse'
                      : isNodeSelected
                      ? 'border-2 border-primary bg-primary/20 shadow-primary/20 ring-1 ring-primary/40'
                      : 'border border-border/80 bg-surface-alt/70 hover:border-primary/50',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {node.type?.toLowerCase() === 'route' ? (
                      <span className={cn('size-2 rounded-full shrink-0', isNodeVuln ? 'bg-danger animate-pulse' : 'bg-primary')} />
                    ) : node.type?.toLowerCase() === 'asset' ? (
                      <Key className="size-3 text-danger shrink-0" />
                    ) : node.type?.toLowerCase() === 'model' ? (
                      <Database className="size-3 text-amber-400 shrink-0" />
                    ) : node.type?.toLowerCase() === 'middleware' ? (
                      <Lock className="size-3 text-primary shrink-0" />
                    ) : (
                      <Terminal className="size-3 text-primary shrink-0" />
                    )}
                    <span className={cn('font-mono text-xs font-bold truncate', isNodeVuln ? 'text-danger' : 'text-fg')} title={node.key}>
                      {label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] text-muted mt-1 font-mono">
                    <span className="capitalize">{node.type}</span>
                    {isNodeVuln ? (
                      <span className="font-bold text-danger uppercase text-[8.5px]">High Risk</span>
                    ) : (
                      <span className="text-[8.5px]">{node.props?.method || ''}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Controls: Minimap & Zoom */}
        <div className="absolute left-6 bottom-6 z-20 flex items-center gap-3">
          {/* Minimap preview */}
          <div className="size-20 rounded-xl border border-border/80 bg-surface/80 p-1.5 backdrop-blur-md hidden sm:block">
            <div className="relative size-full rounded-lg bg-surface-alt/40 border border-border/50">
              <span className="absolute left-2 top-3 size-1.5 rounded-full bg-primary" />
              <span className="absolute left-6 top-5 size-1.5 rounded-full bg-danger" />
              <span className="absolute left-10 top-2 size-1.5 rounded-full bg-amber-400" />
              <span className="absolute right-3 top-2 size-2 rounded-full bg-danger animate-ping" />
            </div>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-surface/80 p-1 text-xs font-medium text-fg backdrop-blur-md">
            <button
              type="button"
              onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
              className="grid size-6 place-items-center rounded-lg hover:bg-surface-alt"
            >
              -
            </button>
            <span className="px-2 font-mono">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
              className="grid size-6 place-items-center rounded-lg hover:bg-surface-alt"
            >
              +
            </button>
            <span className="text-border px-1">|</span>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-2 py-0.5 hover:bg-surface-alt rounded-lg"
            >
              Fit View
            </button>
          </div>
        </div>

        {/* Right Drawer: Node Details (secgrapg.png) */}
        <div className="w-80 shrink-0 border-l border-border/80 bg-surface/90 p-5 rounded-r-2xl backdrop-blur-md space-y-5 hidden md:block">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <h3 className="font-bold text-fg text-sm">Node Details</h3>
            <span className="text-muted text-xs font-mono">{selectedNode?.type || 'AST Node'}</span>
          </div>

          {/* Selected Node Card */}
          <div className={cn(
            'rounded-xl border p-3.5 space-y-2',
            vulnerableNodeIds.has(selectedNode?.id || '') || vulnerableNodeIds.has(selectedNode?.key || '')
              ? 'border-danger/40 bg-danger/10'
              : 'border-border/80 bg-surface-alt/50',
          )}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'grid size-9 place-items-center rounded-lg',
                  vulnerableNodeIds.has(selectedNode?.id || '') ? 'bg-danger/20 text-danger' : 'bg-primary/20 text-primary',
                )}>
                  {selectedNode?.type?.toLowerCase() === 'route' ? <Globe className="size-4" /> : <Database className="size-4" />}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-fg text-sm capitalize">{selectedNode?.type || 'Client'}</h4>
                  <div className="font-mono text-xs text-muted truncate max-w-[160px]" title={selectedNode?.key || selectedNode?.id}>
                    {selectedNode?.props?.path || selectedNode?.props?.model || selectedNode?.key || selectedNode?.id || 'node-client'}
                  </div>
                </div>
              </div>
              <span className={cn(
                'rounded px-2 py-0.5 text-[10px] font-bold uppercase',
                vulnerableNodeIds.has(selectedNode?.id || '') ? 'bg-danger text-white' : 'bg-surface-alt text-muted border border-border',
              )}>
                {vulnerableNodeIds.has(selectedNode?.id || '') ? 'High Risk' : 'Normal'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-border/40">
              <div>
                <span className="text-muted">Type:</span>
                <span className="font-medium text-fg block capitalize">{selectedNode?.type || 'Client'}</span>
              </div>
              <div>
                <span className="text-muted">Layer:</span>
                <span className="font-medium text-fg block">
                  {selectedNode?.type?.toLowerCase() === 'route' ? 'Presentation' : selectedNode?.type?.toLowerCase() === 'model' ? 'Data' : 'Logic'}
                </span>
              </div>
              <div>
                <span className="text-muted">Risk Level:</span>
                <span className={cn('font-bold block', vulnerableNodeIds.has(selectedNode?.id || '') ? 'text-danger' : 'text-emerald-400')}>
                  {vulnerableNodeIds.has(selectedNode?.id || '') ? 'Critical / High' : 'Clean'}
                </span>
              </div>
              <div>
                <span className="text-muted">Location:</span>
                <span className="font-mono text-muted block truncate" title={selectedNode?.loc?.file || 'N/A'}>
                  {selectedNode?.loc?.file ? `${selectedNode.loc.file.split('/').pop()}:${selectedNode.loc.line || 1}` : 'AST Graph'}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs: Relationships | Findings | Context */}
          <div className="flex border-b border-border/60 pb-1 text-xs font-semibold gap-4">
            <button
              type="button"
              onClick={() => setDetailTab('relationships')}
              className={cn(
                'pb-1.5 transition-colors',
                detailTab === 'relationships'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted hover:text-fg',
              )}
            >
              Relationships
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('findings')}
              className={cn(
                'pb-1.5 transition-colors',
                detailTab === 'findings'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted hover:text-fg',
              )}
            >
              Findings
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('context')}
              className={cn(
                'pb-1.5 transition-colors',
                detailTab === 'context'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted hover:text-fg',
              )}
            >
              Context
            </button>
          </div>

          {/* Relationships Content */}
          {detailTab === 'relationships' && (
            <div className="space-y-4 text-xs">
              {/* Incoming Connections */}
              <div className="space-y-2">
                <div className="font-bold text-muted text-[11px] uppercase tracking-wider">
                  Incoming ({graphData?.edges?.filter((e) => selectedNode && (e.to === selectedNode.id || e.to === selectedNode.key)).length || 0})
                </div>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {graphData?.edges?.filter((e) => selectedNode && (e.to === selectedNode.id || e.to === selectedNode.key)).slice(0, 5).map((e, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-alt/40 p-2">
                      <span className="font-mono text-fg text-[11px] truncate max-w-[140px]" title={e.from}>{e.from.split(':').pop()}</span>
                      <span className="rounded bg-surface px-1.5 py-0.2 text-[9.5px] font-mono text-primary">{e.type}</span>
                    </div>
                  ))}
                  {(!graphData?.edges || graphData.edges.filter((e) => selectedNode && (e.to === selectedNode.id || e.to === selectedNode.key)).length === 0) && (
                    <div className="text-muted text-[11px] italic bg-surface-alt/20 p-2 rounded-lg text-center">No incoming connections</div>
                  )}
                </div>
              </div>

              {/* Outgoing Connections */}
              <div className="space-y-2">
                <div className="font-bold text-muted text-[11px] uppercase tracking-wider">
                  Outgoing ({graphData?.edges?.filter((e) => selectedNode && (e.from === selectedNode.id || e.from === selectedNode.key)).length || 0})
                </div>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {graphData?.edges?.filter((e) => selectedNode && (e.from === selectedNode.id || e.from === selectedNode.key)).slice(0, 5).map((e, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-alt/40 p-2">
                      <span className="font-mono text-fg text-[11px] truncate max-w-[140px]" title={e.to}>{e.to.split(':').pop()}</span>
                      <span className="rounded bg-surface px-1.5 py-0.2 text-[9.5px] font-mono text-primary">{e.type}</span>
                    </div>
                  ))}
                  {(!graphData?.edges || graphData.edges.filter((e) => selectedNode && (e.from === selectedNode.id || e.from === selectedNode.key)).length === 0) && (
                    <div className="text-muted text-[11px] italic bg-surface-alt/20 p-2 rounded-lg text-center">No outgoing connections</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Findings Content */}
          {detailTab === 'findings' && (
            <div className="space-y-2 text-xs">
              {findingsList.filter((f) => selectedNode && f.affectedNodes?.some((n) => n === selectedNode.id || n === selectedNode.key)).length === 0 ? (
                <div className="p-4 text-center text-muted bg-surface-alt/20 border rounded-xl">
                  <CheckCircle2 className="size-6 text-emerald-400 mx-auto mb-1.5" />
                  <p className="font-semibold text-fg">No direct findings</p>
                  <p className="text-[10.5px] text-muted mt-0.5">This node has no active vulnerabilities assigned.</p>
                </div>
              ) : (
                findingsList
                  .filter((f) => selectedNode && f.affectedNodes?.some((n) => n === selectedNode.id || n === selectedNode.key))
                  .map((f) => (
                    <div key={f.id} className="p-2.5 rounded-xl border border-danger/40 bg-danger/10 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-danger">{f.type}</span>
                        <span className="text-[10px] font-bold uppercase rounded bg-danger text-white px-1.5">{f.severity}</span>
                      </div>
                      <p className="text-[11px] text-muted">{f.attackPath?.narrative || 'Confirmed vulnerability'}</p>
                      <NavLink to={`/findings?id=${f.id}`} className="text-[11px] text-primary font-semibold hover:underline block pt-1">
                        View Dossier →
                      </NavLink>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* Context Content */}
          {detailTab === 'context' && (
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl border bg-black/50 text-[11px] overflow-x-auto text-fg">
                <pre>{JSON.stringify(selectedNode?.props || { id: selectedNode?.id, key: selectedNode?.key }, null, 2)}</pre>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/attack-surface')}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <span>View in Attack Surface</span>
            <ArrowRight className="size-3" />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. BOTTOM PANELS (3 COLUMNS: secgrapg.png)                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Col 1: Attack Paths (5 cols) */}
        <div className="md:col-span-5 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-fg text-sm">Attack Paths</h3>
                <span className="rounded-full bg-danger/10 border border-danger/30 px-2 py-0.2 text-[10px] font-bold text-danger">
                  {highRiskPaths} High Risk Paths
                </span>
              </div>
              <NavLink to="/findings" className="text-xs font-semibold text-primary hover:underline">
                View All Paths →
              </NavLink>
            </div>

            <table className="w-full text-left text-xs mt-3">
              <thead>
                <tr className="text-muted uppercase text-[10px] font-bold border-b border-border/50">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Path</th>
                  <th className="pb-2">Risk</th>
                  <th className="pb-2 text-right">Steps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 font-mono text-[11px]">
                {findingsList.map((f, i) => (
                  <tr key={f.id} className="hover:bg-surface-alt/40 cursor-pointer" onClick={() => navigate(`/findings?id=${f.id}`)}>
                    <td className="py-2.5 text-danger font-bold">{i + 1}</td>
                    <td className="py-2.5 text-fg truncate max-w-[220px]" title={f.affectedNodes?.join(' → ')}>
                      Client → {f.affectedNodes?.map((n) => n.split(':').pop()).join(' → ') || f.type}
                    </td>
                    <td className="py-2.5">
                      <span className="rounded bg-danger/20 text-danger px-1.5 py-0.2 text-[10px] font-bold capitalize">
                        {f.severity}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-muted">{(f.affectedNodes?.length || 1) + 1}</td>
                  </tr>
                ))}
                {findingsList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted text-xs">
                      No attack paths identified yet. Run a verification agent to trace paths.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Col 2: Key Insights (4 cols) */}
        <div className="md:col-span-4 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs space-y-3">
          <h3 className="font-bold text-fg text-sm pb-2 border-b border-border/60">Key Insights</h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-2.5">
              <AlertTriangle className="size-4 text-danger shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-danger">3 direct paths</span> to sensitive data
                <div className="text-[10px] text-muted font-mono mt-0.5">user.password, apiKey, jwt.secret</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
              <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-400">2 external services</span> without validation
                <div className="text-[10px] text-muted font-mono mt-0.5">OpenAI, Nodemailer</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/30 bg-blue-500/5 p-2.5">
              <Layers className="size-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-fg">Multiple user inputs</span> reach database
                <div className="text-[10px] text-muted font-mono mt-0.5">5 tainted inputs detected</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-muted">
                Authentication middleware properly configured on <span className="font-bold text-emerald-400">12/14</span> protected routes
              </div>
            </div>
          </div>
        </div>

        {/* Col 3: Graph Actions (3 cols) */}
        <div className="md:col-span-3 rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-bold text-fg text-sm pb-2 border-b border-border/60">Graph Actions</h3>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-danger/30 bg-danger/5 hover:bg-danger/10 text-center transition-colors"
              >
                <AlertTriangle className="size-4 text-danger mb-1" />
                <span className="text-[10.5px] font-bold text-fg leading-tight">Find Attack Paths</span>
              </button>

              <button
                type="button"
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-center transition-colors"
              >
                <Sparkles className="size-4 text-purple-400 mb-1" />
                <span className="text-[10.5px] font-bold text-fg leading-tight">Highlight Inputs</span>
              </button>

              <button
                type="button"
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-center transition-colors"
              >
                <Layers className="size-4 text-blue-400 mb-1" />
                <span className="text-[10.5px] font-bold text-fg leading-tight">Show Data Flow</span>
              </button>

              <button
                type="button"
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-surface-alt/40 hover:bg-surface-alt text-center transition-colors"
              >
                <Shield className="size-4 text-muted mb-1" />
                <span className="text-[10.5px] font-bold text-fg leading-tight">Detect Dead Code</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-alt/60 py-2.5 text-xs font-semibold text-fg hover:bg-surface-alt transition-colors"
          >
            <Download className="size-3.5" />
            <span>Export Graph</span>
          </button>
        </div>
      </div>
    </div>
  );
}
