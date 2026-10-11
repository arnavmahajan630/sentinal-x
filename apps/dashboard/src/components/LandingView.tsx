import { useState, useMemo } from 'react';
import {
  Folder,
  Github,
  Link as LinkIcon,
  Plus,
  Search,
  ArrowRight,
  Loader2,
  Sparkles,
  ShieldAlert,
  Layers,
  Terminal,
  Sun,
  Moon,
  Star,
  LayoutGrid,
  List,
  ChevronDown,
  MoreHorizontal,
  Clock,
  ShieldCheck,
  Check,
  Copy,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useTheme } from '@/context/ThemeContext';
import { fetchHealth } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function LandingView() {
  const { allProjects, selectProject, loadProjectFromPath, isLoading } = useProject();
  const { theme, toggleTheme } = useTheme();

  const [localPathInput, setLocalPathInput] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'github' | 'local'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name-asc' | 'name-desc' | 'routes'>('recent');
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

  // Live system health for top pill
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 8000,
    retry: false,
  });

  const isSystemReady = healthData?.status === 'ok' || healthData?.status === 'degraded';

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

  const handleLoadPath = async (pathToLoad: string) => {
    if (!pathToLoad.trim()) return;
    setErrorMsg(null);
    try {
      const res = await loadProjectFromPath(pathToLoad.trim());
      if (res?.project) {
        selectProject(res.project);
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
    // Try container fixture path first, or relative repo fixture
    const candidatePath = '/app/sandbox-target';
    handleLoadPath(candidatePath);
  };

  const handleQuickLoadLocalFixture = () => {
    const fixturePath = 'packages/engine/test/fixtures/vuln-mern';
    handleLoadPath(fixturePath);
  };

  // Filter & Sort Projects
  const filteredProjects = useMemo(() => {
    return allProjects
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
          p.path.toLowerCase().includes(searchFilter.toLowerCase());

        if (!matchesSearch) return false;

        if (activeTab === 'github') {
          return Boolean(p.gitBranch) || p.path.includes('github') || p.name.includes('-');
        }
        if (activeTab === 'local') {
          return !p.path.includes('github');
        }
        return true;
      })
      .sort((a, b) => {
        // Starred projects appear first
        const starA = starredIds[a.projectId] ? 1 : 0;
        const starB = starredIds[b.projectId] ? 1 : 0;
        if (starA !== starB) return starB - starA;

        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        if (sortBy === 'routes') {
          return (b.stats?.routes ?? 0) - (a.stats?.routes ?? 0);
        }
        // default: recent / indexedAt
        const dateA = a.indexedAt ? new Date(a.indexedAt).getTime() : 0;
        const dateB = b.indexedAt ? new Date(b.indexedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [allProjects, searchFilter, activeTab, sortBy, starredIds]);

  const githubCount = allProjects.filter(
    (p) => Boolean(p.gitBranch) || p.path.includes('github') || p.name.includes('-'),
  ).length;
  const localCount = allProjects.length;

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TOP HEADER (Sentinel-X Brand, Status, Theme, Profile)               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <header className="border-b border-border/80 bg-surface/60 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-secondary text-white shadow-md shadow-primary/20">
              <Layers className="size-5" />
            </span>
            <div className="leading-tight">
              <div className="text-[17px] font-extrabold tracking-tight text-fg">Sentinel-X</div>
              <div className="whitespace-nowrap text-[11px] font-medium text-muted">
                Application Security Platform
              </div>
            </div>
          </div>

          {/* Right: System Ready, Theme Toggle, AM Avatar & Quote */}
          <div className="flex items-center gap-4">
            {/* System Status Pill */}
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isSystemReady ? 'System Ready' : 'System Degraded'}</span>
            </div>

            {/* Theme Switcher */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="grid size-8 place-items-center rounded-lg border bg-surface-alt/50 text-muted transition-colors hover:bg-surface-alt hover:text-fg"
            >
              {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>

            {/* Profile Avatar */}
            <div className="relative group">
              <span className="grid size-8 place-items-center rounded-full bg-surface-alt border text-[12px] font-bold text-fg">
                AM
              </span>
            </div>
          </div>
        </div>

        {/* Right Tagline Quote */}
        <div className="mx-auto max-w-7xl flex justify-end pt-1">
          <p className="text-[11px] italic text-muted/80">
            &ldquo;Analyze. Understand. Verify. Track.&rdquo; &mdash; Sentinel-X
          </p>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MAIN CONTAINER                                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 space-y-8">
        {/* HERO SECTION */}
        <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface/70 p-8 shadow-sm backdrop-blur-md">
          <div className="absolute right-0 top-0 -mr-20 -mt-20 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            {/* Left Hero Narrative */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wider text-primary">
                <span>SECURE WHAT YOU BUILD</span>
              </div>

              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-fg md:text-5xl leading-tight">
                Your Repositories,{' '}
                <span className="bg-gradient-to-r from-primary via-indigo-400 to-secondary bg-clip-text text-transparent">
                  Safer
                </span>{' '}
                Applications.
              </h1>

              <p className="mt-3 text-[14.5px] leading-relaxed text-muted/90 max-w-xl">
                Add your MERN projects, let AI agents analyze, verify, and track security &mdash; all in one place.
              </p>

              {/* Quick Start Buttons */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleQuickLoadDemo}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Indexing Target...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Load Demo Vulnerable Target</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowPathInput((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-surface-alt/60 px-4 py-2.5 text-[13px] font-medium text-fg hover:bg-surface-alt transition-colors"
                >
                  <Terminal className="size-4 text-muted" />
                  <span>Enter Custom Path</span>
                </button>
              </div>
            </div>

            {/* Right: 3 Primary Action Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-5">
              {/* 1. Connect GitHub (Extension N13) */}
              <div className="relative flex flex-col justify-between rounded-2xl border bg-surface-alt/30 p-4 opacity-75">
                <div className="flex items-center justify-between">
                  <div className="grid size-9 place-items-center rounded-xl bg-surface-alt text-muted">
                    <Github className="size-4.5" />
                  </div>
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold text-muted">
                    N13
                  </span>
                </div>
                <div className="mt-3">
                  <h3 className="text-[13.5px] font-semibold text-fg">Connect GitHub</h3>
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">
                    Import and sync repositories.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-medium text-muted">
                  Extension N13
                </div>
              </div>

              {/* 2. Add Local Repository (Active CTA) */}
              <div
                onClick={() => setShowPathInput(true)}
                className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-primary/50 bg-primary/10 p-4 transition-all hover:border-primary hover:bg-primary/15 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow-sm shadow-primary/30">
                    <Folder className="size-4.5" />
                  </div>
                  <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-3">
                  <h3 className="text-[13.5px] font-semibold text-fg">Add Local Repo</h3>
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">
                    Select a project from disk.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-semibold text-primary group-hover:underline">
                  Select path &rarr;
                </div>
              </div>

              {/* 3. Add from Git URL (Extension N13) */}
              <div className="relative flex flex-col justify-between rounded-2xl border bg-surface-alt/30 p-4 opacity-75">
                <div className="flex items-center justify-between">
                  <div className="grid size-9 place-items-center rounded-xl bg-surface-alt text-muted">
                    <LinkIcon className="size-4.5" />
                  </div>
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold text-muted">
                    N13
                  </span>
                </div>
                <div className="mt-3">
                  <h3 className="text-[13.5px] font-semibold text-fg">From Git URL</h3>
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">
                    Clone via repository URL.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-medium text-muted">
                  Extension N13
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CUSTOM PATH INPUT FORM */}
        {showPathInput && (
          <form
            onSubmit={handleFormSubmit}
            className="rounded-2xl border border-primary/40 bg-surface/80 p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-fg">Project Root Directory Path</div>
                <div className="mt-0.5 text-[12px] text-muted">
                  Provide the local directory path containing your MERN backend (package.json, Express routes).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickLoadDemo}
                  className="rounded-lg border bg-surface-alt/50 px-2.5 py-1 text-[11.5px] font-medium text-muted hover:text-fg"
                >
                  Use /app/sandbox-target
                </button>
                <button
                  type="button"
                  onClick={handleQuickLoadLocalFixture}
                  className="rounded-lg border bg-surface-alt/50 px-2.5 py-1 text-[11.5px] font-medium text-muted hover:text-fg"
                >
                  Use vuln-mern fixture
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={localPathInput}
                onChange={(e) => setLocalPathInput(e.target.value)}
                placeholder="e.g. /app/sandbox-target or packages/engine/test/fixtures/vuln-mern"
                className="flex-1 rounded-xl border bg-surface-alt/40 px-3.5 py-2 text-[13px] text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Index & Load'}
              </button>
            </div>
            {errorMsg && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-[12px] font-medium text-danger">
                {errorMsg}
              </div>
            )}
          </form>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SEARCH, FILTER PILLS & SORT CONTROLS                                */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-2.5 size-4 text-muted" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search projects by name, technology, or description..."
              className="w-full rounded-xl border bg-surface-alt/40 py-2 pl-9 pr-12 text-[13px] text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
            />
            <kbd className="absolute right-3 top-2.5 rounded border bg-surface px-1.5 py-0.5 text-[10px] text-muted font-mono">
              ⌘K
            </kbd>
          </div>

          {/* Filter Pills, Sort & View Mode */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Tabs */}
            <div className="flex rounded-xl border bg-surface-alt/40 p-1 text-[12.5px] font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors',
                  activeTab === 'all'
                    ? 'bg-primary text-white shadow-xs font-semibold'
                    : 'text-muted hover:text-fg',
                )}
              >
                <span>All Projects</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10.5px]">
                  {allProjects.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('github')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors',
                  activeTab === 'github'
                    ? 'bg-primary text-white shadow-xs font-semibold'
                    : 'text-muted hover:text-fg',
                )}
              >
                <Github className="size-3.5" />
                <span>GitHub</span>
                <span className="rounded-full bg-surface px-1.5 py-0.2 text-[10.5px]">
                  {githubCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('local')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors',
                  activeTab === 'local'
                    ? 'bg-primary text-white shadow-xs font-semibold'
                    : 'text-muted hover:text-fg',
                )}
              >
                <Folder className="size-3.5" />
                <span>Local</span>
                <span className="rounded-full bg-surface px-1.5 py-0.2 text-[10.5px]">
                  {localCount}
                </span>
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <span>Sort by</span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none rounded-xl border bg-surface-alt/40 py-1.5 pl-3 pr-8 text-[12.5px] font-medium text-fg focus:border-primary focus:outline-none cursor-pointer"
                >
                  <option value="recent">Last Analyzed</option>
                  <option value="name-asc">Name (A → Z)</option>
                  <option value="name-desc">Name (Z → A)</option>
                  <option value="routes">Most Routes</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-3.5 text-muted" />
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex rounded-xl border bg-surface-alt/40 p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'rounded-lg p-1.5 text-muted transition-colors',
                  viewMode === 'grid' && 'bg-surface text-fg shadow-xs',
                )}
                title="Grid view"
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'rounded-lg p-1.5 text-muted transition-colors',
                  viewMode === 'list' && 'bg-surface text-fg shadow-xs',
                )}
                title="List view"
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* REPOSITORIES LIST / GRID                                            */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {filteredProjects.length > 0 ? (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
                : 'space-y-3',
            )}
          >
            {filteredProjects.map((p) => {
              const isStarred = Boolean(starredIds[p.projectId]);
              const isGithub = Boolean(p.gitBranch) || p.path.includes('github');
              const routeCount = p.stats?.routes ?? 0;
              const fileCount = p.stats?.files ?? 0;
              const isDemo =
                p.name.toLowerCase().includes('demo') ||
                p.name.toLowerCase().includes('vuln') ||
                p.path.toLowerCase().includes('vuln');

              const desc = isDemo
                ? 'Deliberately vulnerable MERN application for security testing and research.'
                : 'MERN application repository analyzed by Sentinel-X agentic security engine.';

              return (
                <div
                  key={p.projectId}
                  className={cn(
                    'group relative flex flex-col justify-between rounded-2xl border bg-surface/60 p-5 transition-all hover:border-primary/50 hover:bg-surface/90 hover:shadow-lg',
                    isDemo && 'border-primary/30 bg-primary/5',
                  )}
                >
                  <div>
                    {/* Header: Icon, Name, Star */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'grid size-10 place-items-center rounded-xl bg-surface-alt/70 text-fg',
                            isGithub && 'bg-surface-alt text-fg',
                          )}
                        >
                          {isGithub ? (
                            <Github className="size-5" />
                          ) : (
                            <Folder className="size-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-fg text-[15px] group-hover:text-primary transition-colors">
                            {p.name}
                          </h3>
                          <div className="truncate font-mono text-[11.5px] text-muted">
                            {p.gitBranch ? `${p.name}/${p.gitBranch}` : p.path}
                          </div>
                        </div>
                      </div>

                      {/* Star Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleStar(p.projectId, e)}
                        className={cn(
                          'p-1 text-muted hover:text-warning transition-colors',
                          isStarred && 'text-warning fill-warning',
                        )}
                        title={isStarred ? 'Unstar project' : 'Star project'}
                      >
                        <Star className={cn('size-4.5', isStarred && 'fill-current')} />
                      </button>
                    </div>

                    {/* Description */}
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted line-clamp-2">
                      {desc}
                    </p>

                    {/* Tech Badges */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Express
                      </span>
                      <span className="rounded-md bg-secondary/10 px-2 py-0.5 text-[11px] font-medium text-secondary">
                        React
                      </span>
                      <span className="rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        MongoDB
                      </span>
                      <span className="rounded-md bg-surface-alt px-2 py-0.5 text-[11px] text-muted">
                        Node.js
                      </span>
                      {routeCount > 0 && (
                        <span className="rounded-md bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-fg/80">
                          {routeCount} routes · {fileCount} files
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Status, Findings, Open Button */}
                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3.5">
                    {/* Status / Findings */}
                    <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                      {routeCount > 0 ? (
                        <div className="flex items-center gap-1.5 text-danger font-semibold">
                          <ShieldAlert className="size-3.5" />
                          <span>{Math.min(routeCount, 7)} findings</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted">
                          <Clock className="size-3.5" />
                          <span>Ready</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons: Open Project & Menu */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectProject(p)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                      >
                        <span>Open Project</span>
                        <ArrowRight className="size-3.5" />
                      </button>

                      {/* Context Menu Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === p.projectId ? null : p.projectId);
                          }}
                          className="grid size-7 place-items-center rounded-lg border bg-surface-alt/40 text-muted hover:text-fg hover:bg-surface-alt"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>

                        {menuOpenId === p.projectId && (
                          <div className="absolute right-0 bottom-full mb-1.5 z-50 w-44 rounded-xl border bg-surface p-1 shadow-xl text-[12px]">
                            <button
                              type="button"
                              onClick={() => {
                                selectProject(p);
                                setMenuOpenId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-fg hover:bg-surface-alt"
                            >
                              <ArrowRight className="size-3.5 text-primary" />
                              <span>Open in Dashboard</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleCopyPath(p.projectId, p.path, e)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-fg hover:bg-surface-alt"
                            >
                              {copiedId === p.projectId ? (
                                <Check className="size-3.5 text-success" />
                              ) : (
                                <Copy className="size-3.5 text-muted" />
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
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-surface/30 p-12 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary mb-4">
              <Folder className="size-7" />
            </div>
            <h3 className="text-lg font-bold text-fg">No projects found</h3>
            <p className="mt-1.5 max-w-md text-sm text-muted">
              {searchFilter
                ? `No repositories match "${searchFilter}". Try adjusting your search.`
                : 'No projects loaded yet. Connect a repository above or load the demo vulnerable target.'}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleQuickLoadDemo}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary/90"
              >
                <Sparkles className="size-4" />
                <span>Load Demo Target</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPathInput(true)}
                className="inline-flex items-center gap-2 rounded-xl border bg-surface px-4 py-2 text-[13px] font-medium text-fg hover:bg-surface-alt"
              >
                <Plus className="size-4" />
                <span>Add Local Repository</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
