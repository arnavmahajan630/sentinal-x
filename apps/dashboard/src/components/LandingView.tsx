import { useState, useMemo } from 'react';
import {
  Folder,
  Github,
  Search,
  ArrowRight,
  Sun,
  Moon,
  Star,
  LayoutGrid,
  List,
  ChevronDown,
  MoreHorizontal,
  Link as LinkIcon,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Check,
  Loader2,
  Terminal,
  Play,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useTheme } from '@/context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { DEMO_PROJECTS, DemoProjectItem } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export function LandingView() {
  const navigate = useNavigate();
  const { allProjects, activeProject, selectProject, loadProjectFromPath, isLoading } = useProject();
  const { theme, toggleTheme } = useTheme();

  const [searchFilter, setSearchFilter] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'github' | 'local'>('all');
  const [sortBy, setSortBy] = useState<'last-analyzed' | 'name' | 'findings'>('last-analyzed');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showLocalModal, setShowLocalModal] = useState(false);
  const [localInputPath, setLocalInputPath] = useState('/app/sandbox-target');
  const [localError, setLocalError] = useState<string | null>(null);

  const [starredIds, setStarredIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sx-starred-projects');
      return saved ? JSON.parse(saved) : { 'demo-vuln-mern': true };
    } catch {
      return { 'demo-vuln-mern': true };
    }
  });

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...starredIds, [id]: !starredIds[id] };
    setStarredIds(updated);
    try {
      localStorage.setItem('sx-starred-projects', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleSelectProject = (project: any) => {
    selectProject(project);
    navigate('/overview');
  };

  const handleLoadCustomPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInputPath.trim()) return;
    setLocalError(null);
    try {
      const res = await loadProjectFromPath(localInputPath.trim());
      if (res?.project) {
        selectProject(res.project);
        setShowLocalModal(false);
        navigate('/overview');
      }
    } catch (err: any) {
      setLocalError(err.message || 'Failed to load local repository');
    }
  };

  // Combine real backend projects with demo catalog from landing-ui.png
  const combinedProjects = useMemo(() => {
    const list: DemoProjectItem[] = [...DEMO_PROJECTS];
    for (const p of allProjects) {
      if (!list.some((d) => d.projectId === p.projectId || d.name === p.name)) {
        list.push({
          ...p,
          description: 'Local workspace indexed by Sentinel-X agentic security engine.',
          tags: ['Express', 'Node.js', 'TypeScript'],
          analyzedAgo: 'Recently analyzed',
          findingsCount: p.stats?.routes ? Math.min(p.stats.routes, 5) : 0,
          criticalCount: 0,
          highCount: 1,
          mediumCount: 2,
          lowCount: 0,
          type: 'local',
          isStarred: false,
        });
      }
    }
    return list;
  }, [allProjects]);

  const filteredProjects = useMemo(() => {
    return combinedProjects
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
          p.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
          p.description.toLowerCase().includes(searchFilter.toLowerCase());

        if (!matchesSearch) return false;
        if (filterType === 'github') return p.type === 'github';
        if (filterType === 'local') return p.type === 'local';
        return true;
      })
      .sort((a, b) => {
        const starA = starredIds[a.projectId] ? 1 : 0;
        const starB = starredIds[b.projectId] ? 1 : 0;
        if (starA !== starB) return starB - starA;

        if (sortBy === 'findings') {
          return b.findingsCount - a.findingsCount;
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return 0; // last-analyzed order preserved
      });
  }, [combinedProjects, searchFilter, filterType, sortBy, starredIds]);

  const githubCount = combinedProjects.filter((p) => p.type === 'github').length;
  const localCount = combinedProjects.filter((p) => p.type === 'local').length;

  return (
    <div className="min-h-screen bg-bg text-fg font-sans flex flex-col selection:bg-primary/30">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP NAV / HEADER (from images/landing-ui.png)                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <header className="border-b border-border/80 bg-surface/80 backdrop-blur-md px-8 py-3.5 sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          {/* Logo & Brand Title */}
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-secondary text-white shadow-md shadow-primary/25">
              <Layers className="size-5" />
            </span>
            <div className="leading-tight">
              <div className="text-[17px] font-extrabold tracking-tight text-fg">Sentinel-X</div>
              <div className="text-[11px] font-medium text-muted">
                Application Security Platform
              </div>
            </div>
          </div>

          {/* Center: Search projects input with ⌘K badge */}
          <div className="relative hidden md:block max-w-md w-full">
            <Search className="absolute left-3.5 top-2.5 size-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search projects..."
              className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-2 pl-10 pr-10 text-xs text-fg placeholder:text-muted/60 focus:border-primary/80 focus:bg-surface-alt/90 focus:outline-none transition-all"
            />
            <span className="absolute right-3 top-2.5 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted">
              ⌘K
            </span>
          </div>

          {/* Right: System Ready, Theme Toggle, AM Avatar, Quote */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Ready</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="grid size-9 place-items-center rounded-xl border border-border bg-surface-alt/50 text-muted transition-colors hover:bg-surface-alt hover:text-fg"
            >
              {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>

            <div
              className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm"
              title="Arnav (Admin)"
            >
              AM
            </div>

            <div className="hidden xl:block max-w-[200px] border-l border-border pl-4 text-right">
              <p className="text-[11px] italic text-muted leading-tight">
                “Analyze. Understand. Verify. Track.”
              </p>
              <p className="text-[10px] text-muted/60 mt-0.5">— Sentinel-X</p>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. MAIN WORKSPACE                                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-8 space-y-8">
        {/* HERO SECTION */}
        <div className="space-y-3 pt-2">
          <div className="inline-block text-[11px] font-bold tracking-widest text-primary uppercase font-mono">
            SECURE WHAT YOU BUILD
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-fg">
            Your Repositories, <span className="gradient-safer">Safer</span> Applications.
          </h1>
          <p className="text-[15px] text-muted max-w-2xl leading-relaxed">
            Add your MERN projects, let AI agents analyze, verify, and track security — all in one
            place.
          </p>
        </div>

        {/* 3 PRIMARY ACTION CARDS (images/landing-ui.png) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Action 1: Connect GitHub */}
          <div
            onClick={() => handleSelectProject(DEMO_PROJECTS[0])}
            className="group relative flex items-center justify-between rounded-2xl border border-border/80 bg-surface/90 p-5 transition-all hover:border-primary/50 hover:bg-surface hover:shadow-lg card-glow cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-surface-alt text-fg group-hover:text-primary transition-colors border border-border/60">
                <Github className="size-6" />
              </div>
              <div>
                <h3 className="font-bold text-fg text-base group-hover:text-primary transition-colors">
                  Connect GitHub
                </h3>
                <p className="text-xs text-muted mt-0.5">Import and sync your repositories</p>
              </div>
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-surface-alt/60 text-muted group-hover:bg-primary group-hover:text-white transition-all">
              <ArrowRight className="size-4" />
            </div>
          </div>

          {/* Action 2: Add Local Repository */}
          <div
            onClick={() => setShowLocalModal(true)}
            className="group relative flex items-center justify-between rounded-2xl border border-border/80 bg-surface/90 p-5 transition-all hover:border-primary/50 hover:bg-surface hover:shadow-lg card-glow cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors border border-primary/20">
                <Folder className="size-6" />
              </div>
              <div>
                <h3 className="font-bold text-fg text-base group-hover:text-primary transition-colors">
                  Add Local Repository
                </h3>
                <p className="text-xs text-muted mt-0.5">Select a project from your machine</p>
              </div>
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-surface-alt/60 text-muted group-hover:bg-primary group-hover:text-white transition-all">
              <ArrowRight className="size-4" />
            </div>
          </div>

          {/* Action 3: Add from Git URL */}
          <div
            onClick={() => setShowLocalModal(true)}
            className="group relative flex items-center justify-between rounded-2xl border border-border/80 bg-surface/90 p-5 transition-all hover:border-primary/50 hover:bg-surface hover:shadow-lg card-glow cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-secondary/10 text-secondary transition-colors border border-secondary/20">
                <LinkIcon className="size-6" />
              </div>
              <div>
                <h3 className="font-bold text-fg text-base group-hover:text-primary transition-colors">
                  Add from Git URL
                </h3>
                <p className="text-xs text-muted mt-0.5">Clone a repository using a URL</p>
              </div>
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-surface-alt/60 text-muted group-hover:bg-primary group-hover:text-white transition-all">
              <ArrowRight className="size-4" />
            </div>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pt-2">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer',
                filterType === 'all'
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border/80 bg-surface-alt/40 text-muted hover:text-fg hover:bg-surface-alt',
              )}
            >
              <span>All Projects</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10.5px]',
                  filterType === 'all' ? 'bg-white/20 text-white' : 'bg-surface text-muted',
                )}
              >
                {combinedProjects.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterType('github')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer',
                filterType === 'github'
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border/80 bg-surface-alt/40 text-muted hover:text-fg hover:bg-surface-alt',
              )}
            >
              <Github className="size-3.5" />
              <span>GitHub</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10.5px]',
                  filterType === 'github' ? 'bg-white/20 text-white' : 'bg-surface text-muted',
                )}
              >
                {githubCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterType('local')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer',
                filterType === 'local'
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border/80 bg-surface-alt/40 text-muted hover:text-fg hover:bg-surface-alt',
              )}
            >
              <Folder className="size-3.5" />
              <span>Local</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10.5px]',
                  filterType === 'local' ? 'bg-white/20 text-white' : 'bg-surface text-muted',
                )}
              >
                {localCount}
              </span>
            </button>
          </div>

          {/* Search, Sort Dropdown & View Mode */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Embedded input for mobile / small screen */}
            <div className="relative md:hidden w-full">
              <Search className="absolute left-3.5 top-2.5 size-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-2 pl-10 pr-4 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Sort by Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none rounded-xl border border-border/80 bg-surface-alt/40 py-2 pl-3.5 pr-8 text-xs font-medium text-fg focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="last-analyzed">Last Analyzed</option>
                <option value="name">Name (A → Z)</option>
                <option value="findings">Most Findings</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-3.5 text-muted" />
            </div>

            {/* Grid vs List View Toggle */}
            <div className="flex rounded-xl border border-border/80 bg-surface-alt/40 p-1">
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

        {/* 6 PROJECT CARDS GRID (matching images/landing-ui.png) */}
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
              : 'space-y-3',
          )}
        >
          {filteredProjects.map((project) => {
            const isStarred = Boolean(starredIds[project.projectId]);
            const isTargetVuln = project.name === 'vulnerable-mern-app';

            return (
              <div
                key={project.projectId}
                onClick={() => handleSelectProject(project)}
                className={cn(
                  'group relative flex flex-col justify-between rounded-2xl border bg-surface/90 p-5 transition-all hover:shadow-xl cursor-pointer',
                  isTargetVuln
                    ? 'border-primary/40 bg-gradient-to-b from-surface via-surface to-primary/5 shadow-md shadow-primary/10'
                    : 'border-border/80 hover:border-border hover:bg-surface',
                )}
              >
                <div>
                  {/* Top: Icon, Titles, Star */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-surface-alt border border-border/60 text-fg">
                        {project.type === 'github' ? (
                          <Github className="size-5" />
                        ) : (
                          <Folder className="size-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-fg text-[15px] group-hover:text-primary transition-colors">
                          {project.name}
                        </h3>
                        <p className="font-mono text-[11px] text-muted">{project.path}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => toggleStar(project.projectId, e)}
                      className={cn(
                        'p-1 text-muted hover:text-amber-400 transition-colors shrink-0',
                        isStarred && 'text-amber-400 fill-amber-400',
                      )}
                      title={isStarred ? 'Unstar' : 'Star'}
                    >
                      <Star className={cn('size-4.5', isStarred && 'fill-current')} />
                    </button>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted line-clamp-2">
                    {project.description}
                  </p>

                  {/* Technology Pills */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg bg-surface-alt border border-border/70 px-2 py-0.5 text-[11px] font-mono text-fg/80"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer: Status, Analyzed Ago, Open Button */}
                <div className="mt-5 border-t border-border/60 pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11.5px] text-muted">{project.analyzedAgo}</span>

                    {/* Findings Pill */}
                    {project.findingsCount > 0 ? (
                      <div className="flex items-center gap-1.5 text-danger font-medium text-[11.5px]">
                        <ShieldAlert className="size-3.5" />
                        <span>
                          {project.findingsCount} findings
                          {project.criticalCount > 0 && ` · ${project.criticalCount} critical`}
                          {project.highCount > 0 && ` · ${project.highCount} high`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11.5px]">
                        <ShieldCheck className="size-3.5" />
                        <span>No findings</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleSelectProject(project)}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all cursor-pointer shadow-sm',
                        isTargetVuln
                          ? 'bg-primary hover:bg-primary/90 text-white'
                          : 'border border-border/90 bg-surface-alt/70 text-fg hover:bg-primary hover:text-white hover:border-transparent',
                      )}
                    >
                      <span>Open Project</span>
                      <ArrowRight className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-xl border border-border/80 bg-surface-alt/50 text-muted hover:text-fg hover:bg-surface-alt transition-colors shrink-0"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* LOCAL REPOSITORY INGESTION MODAL                                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showLocalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2.5">
                <Folder className="size-5 text-primary" />
                <h3 className="font-bold text-fg text-base">Add Local Target Repository</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLocalModal(false)}
                className="text-muted hover:text-fg text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Specify a local filesystem path or docker mount containing a Node.js/MERN project for
              AST indexing, taint flow analysis, and exploit verification.
            </p>

            <form onSubmit={handleLoadCustomPath} className="space-y-3">
              <div className="relative">
                <Terminal className="absolute left-3.5 top-3 size-4 text-primary pointer-events-none" />
                <input
                  type="text"
                  value={localInputPath}
                  onChange={(e) => setLocalInputPath(e.target.value)}
                  placeholder="/app/sandbox-target or relative project directory"
                  className="w-full rounded-xl border border-border bg-surface-alt py-2.5 pl-10 pr-3 font-mono text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>

              {localError && (
                <p className="text-xs font-mono text-danger bg-danger/10 p-2.5 rounded-lg border border-danger/30">
                  {localError}
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setLocalInputPath('packages/engine/test/fixtures/vuln-mern')}
                  className="text-[11px] font-mono text-primary hover:underline"
                >
                  Load Fixture Sample
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLocalModal(false)}
                    className="rounded-xl border border-border px-3.5 py-1.5 text-xs text-muted hover:text-fg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5 fill-current" />
                        <span>Index Repository</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
