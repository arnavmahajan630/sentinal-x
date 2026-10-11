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
  const [selectedView, setSelectedView] = useState<'graph' | 'tree' | 'table'>('graph');
  const [showPaths, setShowPaths] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-sensitive-password');
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
        {/* Card 1: 127 Total Nodes */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
            <Network className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">127</div>
            <div className="text-xs text-muted font-medium">Total Nodes</div>
          </div>
        </div>

        {/* Card 2: 214 Relationships */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Layers className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">214</div>
            <div className="text-xs text-muted font-medium">Relationships</div>
          </div>
        </div>

        {/* Card 3: 32 External Entry Points */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Globe className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">32</div>
            <div className="text-xs text-muted font-medium">External Entry Points</div>
          </div>
        </div>

        {/* Card 4: 18 High Risk Paths */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20 shrink-0">
            <AlertTriangle className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">18</div>
            <div className="text-xs text-muted font-medium">High Risk Paths</div>
          </div>
        </div>

        {/* Card 5: 7 Critical Findings */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs">
          <div className="grid size-12 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20 shrink-0">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-fg">7</div>
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

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Node Type ⌵</option>
            <option>Route</option>
            <option>Function</option>
            <option>Middleware</option>
            <option>Database</option>
          </select>

          <select className="rounded-xl border border-border/80 bg-surface-alt/50 px-3 py-1.5 text-xs font-medium text-fg focus:outline-none cursor-pointer">
            <option>Risk Level ⌵</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
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
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          <div className="relative w-full max-w-4xl min-h-[460px] flex items-center justify-center">
            {/* SVG Relationship Lines Background */}
            <svg className="absolute inset-0 size-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
              {/* Path from Client to /api/auth */}
              <path d="M 80 230 C 120 230, 140 180, 180 180" stroke="#3b66ff" strokeWidth="2" fill="none" />
              {/* Path from Client to req.body */}
              <path d="M 80 230 C 120 230, 160 300, 220 300" stroke="#f43f5e" strokeWidth="2" strokeDasharray="4 4" fill="none" />
              {/* Path from /api/auth to jwt.js */}
              <path d="M 230 150 C 230 110, 230 90, 230 80" stroke="#3b66ff" strokeWidth="2" fill="none" />
              {/* Path from jwt.js to authenticate() */}
              <path d="M 270 60 C 310 60, 310 180, 310 180" stroke="#10b981" strokeWidth="2" fill="none" />
              {/* Path from authenticate() to user.controller.js */}
              <path d="M 360 190 C 390 190, 400 190, 420 190" stroke="#3b66ff" strokeWidth="2" fill="none" />
              {/* Path from req.body to user.controller.js */}
              <path d="M 270 300 C 350 300, 400 230, 430 210" stroke="#f43f5e" strokeWidth="2" strokeDasharray="4 4" fill="none" />
              {/* Path from .env to user.controller.js */}
              <path d="M 435 340 L 435 220" stroke="#94a3b8" strokeWidth="2" fill="none" />
              {/* Path from user.controller.js to User (MongoDB) */}
              <path d="M 480 170 C 510 140, 520 130, 550 130" stroke="#f59e0b" strokeWidth="2" fill="none" />
              {/* Path from user.controller.js to sendEmail() */}
              <path d="M 480 200 C 510 230, 520 240, 550 240" stroke="#3b66ff" strokeWidth="2" fill="none" />
              {/* Path from User (MongoDB) to Sensitive Data user.password */}
              <path d="M 620 130 C 650 130, 660 110, 680 110" stroke="#ef4444" strokeWidth="3" strokeDasharray="6 4" fill="none" />
              {/* Path from sendEmail() to Nodemailer */}
              <path d="M 620 240 L 670 240" stroke="#a855f7" strokeWidth="2" fill="none" />
              {/* Path from .env to OpenAI */}
              <path d="M 480 370 L 660 370" stroke="#a855f7" strokeWidth="2" fill="none" />
            </svg>

            {/* NODES (Positioned matching mockup) */}
            {/* 1. Client (External) */}
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

            {/* 2. Route /api/auth */}
            <div
              onClick={() => setSelectedNodeId('node-api-auth')}
              className="absolute left-[160px] top-[140px] rounded-xl border border-danger/60 bg-danger/10 p-3 shadow-md cursor-pointer hover:border-danger transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-danger animate-pulse" />
                <span className="font-mono text-xs font-bold text-danger">/api/auth</span>
              </div>
              <span className="text-[10px] font-mono text-muted mt-0.5 block">POST</span>
            </div>

            {/* 3. User Input req.body */}
            <div
              onClick={() => setSelectedNodeId('node-req-body')}
              className="absolute left-[170px] top-[280px] rounded-xl border border-danger/60 bg-danger/10 p-3 shadow-md cursor-pointer hover:border-danger transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3 text-danger" />
                <span className="font-mono text-xs font-bold text-danger">req.body</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">User Input</span>
            </div>

            {/* 4. jwt.js Middleware */}
            <div
              onClick={() => setSelectedNodeId('node-jwt-middleware')}
              className="absolute left-[210px] top-[40px] rounded-xl border border-primary/50 bg-surface-alt/70 p-3 shadow-md cursor-pointer hover:border-primary transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Lock className="size-3 text-primary" />
                <span className="font-mono text-xs font-bold text-fg">jwt.js</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">Middleware</span>
            </div>

            {/* 5. authenticate() Function */}
            <div
              onClick={() => setSelectedNodeId('node-auth-fn')}
              className="absolute left-[290px] top-[160px] rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3 shadow-md cursor-pointer hover:border-emerald-500 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="size-3 text-emerald-400" />
                <span className="font-mono text-xs font-bold text-fg">authenticate()</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">Function</span>
            </div>

            {/* 6. user.controller.js */}
            <div
              onClick={() => setSelectedNodeId('node-user-controller')}
              className="absolute left-[400px] top-[160px] rounded-xl border border-primary/50 bg-surface-alt/70 p-3 shadow-md cursor-pointer hover:border-primary transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Code2 className="size-3 text-primary" />
                <span className="font-mono text-xs font-bold text-fg">user.controller.js</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">Controller</span>
            </div>

            {/* 7. .env Configuration */}
            <div
              onClick={() => setSelectedNodeId('node-env')}
              className="absolute left-[420px] top-[340px] rounded-xl border border-border bg-surface-alt/60 p-2.5 shadow-md cursor-pointer hover:border-muted transition-colors text-center"
            >
              <FileCode className="size-4 text-muted mx-auto" />
              <span className="font-mono text-xs font-bold text-fg mt-1 block">.env</span>
              <span className="text-[9.5px] text-muted">Configuration</span>
            </div>

            {/* 8. User (MongoDB) */}
            <div
              onClick={() => setSelectedNodeId('node-user-model')}
              className="absolute left-[540px] top-[100px] rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 shadow-md cursor-pointer hover:border-amber-500 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Database className="size-3 text-amber-400" />
                <span className="font-mono text-xs font-bold text-fg">User</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">(MongoDB)</span>
            </div>

            {/* 9. sendEmail() Function */}
            <div
              onClick={() => setSelectedNodeId('node-send-email')}
              className="absolute left-[540px] top-[220px] rounded-xl border border-primary/40 bg-surface-alt/60 p-2.5 shadow-md cursor-pointer hover:border-primary transition-colors"
            >
              <span className="font-mono text-xs font-bold text-fg block">sendEmail()</span>
              <span className="text-[10px] text-muted">Function</span>
            </div>

            {/* 10. Sensitive Data user.password (TARGET / HIGHLIGHTED) */}
            <div
              onClick={() => setSelectedNodeId('node-sensitive-password')}
              className="absolute left-[670px] top-[70px] rounded-xl border-2 border-danger bg-danger/15 p-3.5 shadow-xl shadow-danger/25 cursor-pointer ring-2 ring-danger/40 animate-pulse"
            >
              <div className="flex items-center gap-2">
                <Key className="size-4 text-danger" />
                <div>
                  <span className="font-mono text-xs font-bold text-danger block">
                    Sensitive Data
                  </span>
                  <span className="font-mono text-[11px] text-fg">user.password</span>
                </div>
              </div>
              <span className="mt-2 inline-block rounded bg-danger px-1.5 py-0.2 text-[9.5px] font-bold text-white uppercase tracking-wider">
                High Risk Path
              </span>
            </div>

            {/* 11. Nodemailer External Service */}
            <div
              onClick={() => setSelectedNodeId('node-nodemailer')}
              className="absolute left-[670px] top-[220px] rounded-xl border border-purple-500/40 bg-purple-500/10 p-2.5 shadow-md cursor-pointer hover:border-purple-500 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-purple-400" />
                <span className="font-mono text-xs font-bold text-fg">Nodemailer</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">External Service</span>
            </div>

            {/* 12. OpenAI External Service */}
            <div
              onClick={() => setSelectedNodeId('node-openai')}
              className="absolute left-[660px] top-[340px] rounded-xl border border-purple-500/40 bg-purple-500/10 p-2.5 shadow-md cursor-pointer hover:border-purple-500 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Cpu className="size-3.5 text-purple-400" />
                <span className="font-mono text-xs font-bold text-fg">OpenAI</span>
              </div>
              <span className="text-[10px] text-muted mt-0.5 block">External Service</span>
            </div>
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
            <button type="button" className="text-muted hover:text-fg text-xs">
              ✕
            </button>
          </div>

          {/* Selected Node Card */}
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3.5 space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg bg-danger/20 text-danger">
                  <Database className="size-4" />
                </div>
                <div>
                  <h4 className="font-bold text-fg text-sm">Sensitive Data</h4>
                  <div className="font-mono text-xs text-danger">user.password</div>
                </div>
              </div>
              <span className="rounded bg-danger text-white px-2 py-0.5 text-[10px] font-bold uppercase">
                High Risk
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-danger/20">
              <div>
                <span className="text-muted">Type:</span>
                <span className="font-medium text-fg block">Database Field</span>
              </div>
              <div>
                <span className="text-muted">Layer:</span>
                <span className="font-medium text-fg block">Data</span>
              </div>
              <div>
                <span className="text-muted">Risk Level:</span>
                <span className="font-bold text-danger block">High</span>
              </div>
              <div>
                <span className="text-muted">File/Location:</span>
                <span className="font-mono text-muted block truncate">models/user.js:12</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted">Data Classification:</span>
                <span className="font-medium text-fg block">Credential</span>
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

          {/* Incoming Connections */}
          <div className="space-y-2 text-xs">
            <div className="font-bold text-muted text-[11px] uppercase tracking-wider">
              Incoming (2)
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-alt/40 p-2">
                <div className="flex items-center gap-2">
                  <Database className="size-3.5 text-amber-400" />
                  <span className="font-medium text-fg">User (MongoDB)</span>
                </div>
                <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] font-mono text-muted">
                  Reads
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-alt/40 p-2">
                <div className="flex items-center gap-2">
                  <Lock className="size-3.5 text-primary" />
                  <span className="font-medium text-fg">authenticate()</span>
                </div>
                <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] font-mono text-muted">
                  Writes
                </span>
              </div>
            </div>
          </div>

          {/* Outgoing Connections */}
          <div className="space-y-2 text-xs">
            <div className="font-bold text-muted text-[11px] uppercase tracking-wider">
              Outgoing (0)
            </div>
            <div className="text-muted text-[11px] italic bg-surface-alt/20 p-2 rounded-lg text-center">
              No outgoing relationships
            </div>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <span>View in Code</span>
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
                  High Risk Paths
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
                <tr>
                  <td className="py-2.5 text-danger font-bold">1</td>
                  <td className="py-2.5 text-fg">Client → /api/auth → User → user.password</td>
                  <td className="py-2.5">
                    <span className="rounded bg-danger/20 text-danger px-1.5 py-0.2 text-[10px] font-bold">
                      Critical
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-muted">4</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-amber-400 font-bold">2</td>
                  <td className="py-2.5 text-fg">Client → /api/orders → MongoDB → orders</td>
                  <td className="py-2.5">
                    <span className="rounded bg-amber-500/20 text-amber-400 px-1.5 py-0.2 text-[10px] font-bold">
                      High
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-muted">5</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-yellow-400 font-bold">3</td>
                  <td className="py-2.5 text-fg">Client → /api/users → sendEmail → External</td>
                  <td className="py-2.5">
                    <span className="rounded bg-yellow-500/20 text-yellow-400 px-1.5 py-0.2 text-[10px] font-bold">
                      Medium
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-muted">4</td>
                </tr>
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
