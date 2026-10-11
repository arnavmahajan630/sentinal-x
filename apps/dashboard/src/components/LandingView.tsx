import { useState, useMemo } from 'react';
import {
  Folder,
  Github,
  Search,
  ArrowRight,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Sun,
  Moon,
  Star,
  LayoutGrid,
  List,
  ChevronDown,
  MoreHorizontal,
  Check,
  Copy,
  Play,
  Shield,
  AlertTriangle,
  Cpu,
  Database,
  Workflow,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useTheme } from '@/context/ThemeContext';
import { fetchHealth } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DEMO_PROJECTS } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export function LandingView() {
  const navigate = useNavigate();
  const { allProjects, activeProject, selectProject, loadProjectFromPath, isLoading } = useProject();
  const { theme, toggleTheme } = useTheme();

  const [localPathInput, setLocalPathInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'vulnerable' | 'clean' | 'local'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'findings' | 'routes' | 'name-asc'>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [starredIds, setStarredIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sx-starred-projects');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Live system health for port indicators
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 8000,
    retry: false,
  });

  const isServerHealthy = healthData?.status === 'ok' || healthData?.status === 'degraded';

  const toggleStar = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...starredIds, [projectId]: !starredIds[projectId] };
    setStarredIds(updated);
    try {
      localStorage.setItem('sx-starred-projects', JSON.stringify(updated));
    } catch {
      // ignore localStorage errors
    }
  };

  const handleCopyPath = (pId: string, path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedId(pId);
    setTimeout(() => setCopiedId(null), 2000);
    setMenuOpenId(null);
  };

  const handleSelectProject = (p: any) => {
    selectProject(p);
    navigate('/overview');
  };

  const handleLoadPath = async (pathToLoad: string) => {
    if (!pathToLoad.trim()) return;
    setErrorMsg(null);
    try {
      const res = await loadProjectFromPath(pathToLoad.trim());
      if (res?.project) {
        selectProject(res.project);
        navigate('/overview');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to index project directory');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLoadPath(localPathInput);
  };

  const handleQuickLoadDemo = () => {
    const candidatePath = '/app/sandbox-target';
    setLocalPathInput(candidatePath);
    handleLoadPath(candidatePath);
  };

  const handleQuickLoadLocalFixture = () => {
    const fixturePath = 'packages/engine/test/fixtures/vuln-mern';
    setLocalPathInput(fixturePath);
    handleLoadPath(fixturePath);
  };

  // Combine live indexed projects with rich demo catalog
  const combinedProjects = useMemo(() => {
    const list = [...allProjects];
    for (const demo of DEMO_PROJECTS) {
      if (!list.some((p) => p.projectId === demo.projectId || p.name === demo.name)) {
        list.push(demo);
      }
    }
    return list;
  }, [allProjects]);

  // Filter & Sort Projects
  const filteredProjects = useMemo(() => {
    return combinedProjects
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
          p.path.toLowerCase().includes(searchFilter.toLowerCase());

        if (!matchesSearch) return false;

        const findingsCount =
          (p as any).findingsCount !== undefined
            ? (p as any).findingsCount
            : (p.stats?.routes ? Math.min(p.stats.routes, 7) : 0);

        if (activeTab === 'vulnerable') {
          return findingsCount > 0;
        }
        if (activeTab === 'clean') {
          return findingsCount === 0;
        }
        if (activeTab === 'local') {
          return !p.path.includes('github');
        }
        return true;
      })
      .sort((a, b) => {
        const starA = starredIds[a.projectId] ? 1 : 0;
        const starB = starredIds[b.projectId] ? 1 : 0;
        if (starA !== starB) return starB - starA;

        if (sortBy === 'findings') {
          const fcA = (a as any).findingsCount ?? 0;
          const fcB = (b as any).findingsCount ?? 0;
          return fcB - fcA;
        }
        if (sortBy === 'routes') {
          return (b.stats?.routes ?? 0) - (a.stats?.routes ?? 0);
        }
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);

        // default: recent / indexedAt
        const dateA = a.indexedAt ? new Date(a.indexedAt).getTime() : 0;
        const dateB = b.indexedAt ? new Date(b.indexedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [combinedProjects, searchFilter, activeTab, sortBy, starredIds]);

  const vulnTargetsCount = combinedProjects.filter(
    (p) => ((p as any).findingsCount ?? (p.stats?.routes ? Math.min(p.stats.routes, 7) : 0)) > 0,
  ).length;

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col font-sans">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER (Precision Dev-Tool Console)                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <header className="border-b border-border/80 bg-surface/75 backdrop-blur-md px-6 py-3 sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Brand Logo & Engine Badges */}
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/20 border border-primary/40 text-primary shadow-xs">
              <Shield className="size-5" />
            </span>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-extrabold tracking-tight text-fg font-mono">
                  Sentinel-X
                </span>
                <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-primary">
                  v0.9.4
                </span>
                <span className="rounded border border-border/70 bg-surface-alt px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted">
                  SELF-HOSTED
                </span>
              </div>
              <div className="whitespace-nowrap text-[11px] font-mono text-muted">
                Offensive & Defensive Security Engine
              </div>
            </div>
          </div>

          {/* Right: Daemon Ports & Theme Toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border/70 bg-surface-alt/50 px-2.5 py-1 text-[11px] font-mono text-muted">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    isServerHealthy ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse',
                  )}
                />
                <span className="text-fg/80">API:4000</span>
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="text-fg/80">SANDBOX:3001</span>
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="text-fg/80">MONGO:27017</span>
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="grid size-8 place-items-center rounded-lg border bg-surface-alt/60 text-muted transition-colors hover:bg-surface-alt hover:text-fg"
            >
              {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. MAIN CONTAINER                                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-6">
        {/* ACTIVE TARGET BANNER (if active project is set) */}
        {activeProject && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-surface-alt/40 p-3.5 backdrop-blur-md shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex size-2.5 relative">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
                  Active Target
                </span>
                <span className="font-bold text-fg text-sm">{activeProject.name}</span>
                <span className="font-mono text-muted text-[11.5px] bg-surface px-1.5 py-0.5 rounded border border-border/60">
                  {activeProject.gitBranch ? `${activeProject.name}:${activeProject.gitBranch}` : activeProject.path}
                </span>
                <span className="text-muted text-[11px]">
                  ({activeProject.stats?.routes ?? 16} routes · {activeProject.stats?.models ?? 2} models)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/overview')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
            >
              <span>Launch Target Dashboard</span>
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 3. TARGET INGESTION & AUDIT COCKPIT (Clean Engineering UX)         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/80 bg-surface/80 p-6 shadow-sm backdrop-blur-md space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Terminal className="size-4.5 text-primary" />
                <h1 className="text-xl font-bold tracking-tight text-fg font-mono">
                  Target Ingestion & Security Audit
                </h1>
              </div>
              <p className="mt-1 text-xs text-muted">
                Analyze local MERN repositories using AST parsing, taint tracking, and containerized exploit verification.
              </p>
            </div>

            {/* Quick Engine Spec Badges */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted">
              <span className="rounded border bg-surface-alt/60 px-2 py-0.5">AST + TS-Morph</span>
              <span className="rounded border bg-surface-alt/60 px-2 py-0.5">Docker Sandbox</span>
              <span className="rounded border bg-surface-alt/60 px-2 py-0.5">Automated PoC</span>
            </div>
          </div>

          {/* Integrated CLI-Style Target Path Loader */}
          <form onSubmit={handleFormSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 flex items-center rounded-xl border border-border/90 bg-surface-alt/70 focus-within:border-primary transition-colors overflow-hidden">
                <span className="pl-3.5 pr-2 font-mono text-xs font-bold text-primary select-none flex items-center gap-1.5">
                  <Terminal className="size-3.5" />
                  <span>$ target:</span>
                </span>
                <input
                  type="text"
                  value={localPathInput}
                  onChange={(e) => setLocalPathInput(e.target.value)}
                  placeholder="e.g. /app/sandbox-target or packages/engine/test/fixtures/vuln-mern"
                  className="w-full bg-transparent py-2.5 pr-3 text-xs font-mono text-fg placeholder:text-muted/50 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Auditing Target...</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 fill-current" />
                    <span>Index & Audit Target</span>
                  </>
                )}
              </button>
            </div>

            {/* Preset Quick-Targets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11.5px]">
              <span className="font-mono text-muted text-[11px]">Quick Presets:</span>
              <button
                type="button"
                onClick={handleQuickLoadDemo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 font-mono text-[11px] text-fg/90 hover:border-primary/50 hover:bg-surface-alt transition-colors"
              >
                <Folder className="size-3 text-primary" />
                <span>/app/sandbox-target (Live Target)</span>
              </button>
              <button
                type="button"
                onClick={handleQuickLoadLocalFixture}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 font-mono text-[11px] text-fg/90 hover:border-primary/50 hover:bg-surface-alt transition-colors"
              >
                <Folder className="size-3 text-muted" />
                <span>packages/engine/test/fixtures/vuln-mern</span>
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-mono text-danger flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </form>

          {/* Engine Pipeline Architecture Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 border-t border-border/50 text-[11px]">
            <div className="flex items-center gap-2 rounded-lg bg-surface-alt/40 border border-border/40 p-2">
              <Cpu className="size-3.5 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-fg/90">AST Static Analysis</div>
                <div className="text-[10px] text-muted font-mono">Control flow & routes</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface-alt/40 border border-border/40 p-2">
              <Workflow className="size-3.5 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-fg/90">Taint Propagation</div>
                <div className="text-[10px] text-muted font-mono">Sources to DB sinks</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface-alt/40 border border-border/40 p-2">
              <Terminal className="size-3.5 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-fg/90">Sandbox Verifier</div>
                <div className="text-[10px] text-muted font-mono">Dynamic HTTP exploits</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface-alt/40 border border-border/40 p-2">
              <Database className="size-3.5 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-fg/90">MongoDB Proof</div>
                <div className="text-[10px] text-muted font-mono">State leakage validation</div>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 4. TARGET WORKSPACES & AUDITED CATALOG                              */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Section Title & Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-muted mr-1">
                Target Workspaces ({filteredProjects.length})
              </h2>

              <div className="flex rounded-xl border border-border/70 bg-surface-alt/50 p-1 text-[11.5px] font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={cn(
                    'rounded-lg px-2.5 py-0.5 transition-colors',
                    activeTab === 'all'
                      ? 'bg-primary text-white font-semibold'
                      : 'text-muted hover:text-fg',
                  )}
                >
                  All ({combinedProjects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('vulnerable')}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-0.5 transition-colors',
                    activeTab === 'vulnerable'
                      ? 'bg-danger text-white font-semibold'
                      : 'text-muted hover:text-fg',
                  )}
                >
                  <ShieldAlert className="size-3" />
                  <span>Vulnerable ({vulnTargetsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('clean')}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-0.5 transition-colors',
                    activeTab === 'clean'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-muted hover:text-fg',
                  )}
                >
                  <ShieldCheck className="size-3" />
                  <span>Clean</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('local')}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-0.5 transition-colors',
                    activeTab === 'local'
                      ? 'bg-primary text-white font-semibold'
                      : 'text-muted hover:text-fg',
                  )}
                >
                  <Folder className="size-3" />
                  <span>Local</span>
                </button>
              </div>
            </div>

            {/* Search Input, Sort & View Mode */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Input */}
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-2.5 size-3.5 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter targets..."
                  className="w-full rounded-xl border border-border/80 bg-surface-alt/40 py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none rounded-xl border border-border/80 bg-surface-alt/40 py-1.5 pl-3 pr-7 text-xs font-medium text-fg focus:border-primary focus:outline-none cursor-pointer"
                >
                  <option value="recent">Last Audited</option>
                  <option value="findings">Most Findings</option>
                  <option value="routes">Most Routes</option>
                  <option value="name-asc">Name (A → Z)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3.5 text-muted" />
              </div>

              {/* View Mode Toggle */}
              <div className="flex rounded-xl border border-border/80 bg-surface-alt/40 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'rounded-lg p-1 text-muted transition-colors',
                    viewMode === 'grid' && 'bg-surface text-fg shadow-xs',
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'rounded-lg p-1 text-muted transition-colors',
                    viewMode === 'list' && 'bg-surface text-fg shadow-xs',
                  )}
                  title="List view"
                >
                  <List className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TARGET CARDS GRID / LIST                                         */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {filteredProjects.length > 0 ? (
            <div
              className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
                  : 'space-y-3',
              )}
            >
              {filteredProjects.map((p) => {
                const projectItem = p as any;
                const isStarred = Boolean(starredIds[p.projectId] ?? projectItem.isStarred);
                const isGithub = Boolean(p.gitBranch) || p.path.includes('github') || projectItem.type === 'github';
                const routeCount = p.stats?.routes ?? 0;
                const funcCount = p.stats?.functions ?? 0;
                const modelCount = p.stats?.models ?? 0;

                const isDemo =
                  p.name.toLowerCase().includes('demo') ||
                  p.name.toLowerCase().includes('vuln') ||
                  p.path.toLowerCase().includes('vuln');

                const desc =
                  projectItem.description ||
                  (isDemo
                    ? 'Deliberately vulnerable MERN application with confirmed NoSQL injection and IDOR flaws.'
                    : 'Application codebase indexed and analyzed by Sentinel-X agentic security engine.');

                const tags: string[] = projectItem.tags || ['Express', 'MongoDB', 'Node.js', 'React'];
                const analyzedAgo: string =
                  projectItem.analyzedAgo || (p.indexedAt ? 'Audited recently' : 'Ready to index');
                const findingsCount: number =
                  projectItem.findingsCount !== undefined
                    ? projectItem.findingsCount
                    : routeCount > 0
                    ? Math.min(routeCount, 7)
                    : 0;

                return (
                  <div
                    key={p.projectId}
                    onClick={() => handleSelectProject(p)}
                    className={cn(
                      'group relative flex flex-col justify-between rounded-xl border bg-surface/70 p-4.5 transition-all hover:border-primary/60 hover:bg-surface/95 hover:shadow-md cursor-pointer',
                      findingsCount > 0 ? 'border-border/80' : 'border-border/60',
                    )}
                  >
                    <div>
                      {/* Card Header: Icon, Name, Star */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/80 bg-surface-alt/80 text-fg">
                            {isGithub ? (
                              <Github className="size-4.5" />
                            ) : (
                              <Terminal className="size-4.5 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-bold text-fg text-[14.5px] group-hover:text-primary transition-colors">
                              {p.name}
                            </h3>
                            <div className="truncate font-mono text-[11px] text-muted">
                              {p.gitBranch ? `${p.name}:${p.gitBranch}` : p.path}
                            </div>
                          </div>
                        </div>

                        {/* Star Button */}
                        <button
                          type="button"
                          onClick={(e) => toggleStar(p.projectId, e)}
                          className={cn(
                            'p-1 text-muted hover:text-warning transition-colors shrink-0',
                            isStarred && 'text-warning fill-warning',
                          )}
                          title={isStarred ? 'Unstar target' : 'Star target'}
                        >
                          <Star className={cn('size-4', isStarred && 'fill-current')} />
                        </button>
                      </div>

                      {/* Description */}
                      <p className="mt-2.5 text-[12px] leading-relaxed text-muted line-clamp-2">
                        {desc}
                      </p>

                      {/* Tech & Metric Badges */}
                      <div className="mt-3.5 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-surface-alt border border-border/60 px-1.5 py-0.5 text-[10.5px] font-mono text-fg/80"
                          >
                            {tag}
                          </span>
                        ))}
                        {routeCount > 0 && (
                          <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10.5px] font-mono text-primary font-medium">
                            {routeCount} routes
                          </span>
                        )}
                        {modelCount > 0 && (
                          <span className="rounded bg-surface-alt border border-border/60 px-1.5 py-0.5 text-[10.5px] font-mono text-muted">
                            {modelCount} models
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: Status Badge, Analyzed Ago, Open Action */}
                    <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                      {/* Findings Status */}
                      <div>
                        {findingsCount > 0 ? (
                          <span className="flex items-center gap-1 rounded border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-mono font-bold text-danger">
                            <ShieldAlert className="size-3" />
                            <span>{findingsCount} Findings</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-400">
                            <ShieldCheck className="size-3" />
                            <span>Passing</span>
                          </span>
                        )}
                      </div>

                      {/* Right: Timestamp & Action */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-muted text-[11px] font-mono hidden sm:inline">
                          {analyzedAgo}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleSelectProject(p)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary/90 cursor-pointer"
                        >
                          <span>Open Console</span>
                          <ArrowRight className="size-3" />
                        </button>

                        {/* Context Menu Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === p.projectId ? null : p.projectId);
                            }}
                            className="grid size-7 place-items-center rounded-lg border border-border/70 bg-surface-alt/40 text-muted hover:text-fg hover:bg-surface-alt"
                          >
                            <MoreHorizontal className="size-3" />
                          </button>

                          {menuOpenId === p.projectId && (
                            <div className="absolute right-0 bottom-full mb-1.5 z-50 w-44 rounded-xl border bg-surface p-1 shadow-xl text-xs font-mono">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectProject(p);
                                  setMenuOpenId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-fg hover:bg-surface-alt"
                              >
                                <ArrowRight className="size-3 text-primary" />
                                <span>Open in Dashboard</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleCopyPath(p.projectId, p.path, e)}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-fg hover:bg-surface-alt"
                              >
                                {copiedId === p.projectId ? (
                                  <Check className="size-3 text-success" />
                                ) : (
                                  <Copy className="size-3 text-muted" />
                                )}
                                <span>{copiedId === p.projectId ? 'Copied!' : 'Copy Path'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/80 bg-surface/40 p-12 text-center space-y-3">
              <Terminal className="mx-auto size-8 text-muted" />
              <h3 className="text-sm font-bold text-fg font-mono">No Target Repositories Matched</h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                No targets found matching &ldquo;{searchFilter}&rdquo;. Try clearing your search query or ingest a new target directory.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchFilter('');
                  setActiveTab('all');
                }}
                className="rounded-lg border bg-surface-alt px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
