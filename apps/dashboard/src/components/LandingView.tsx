import { useState, useMemo, useEffect } from 'react';
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
  FolderPlus,
  Play,
  RotateCcw,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useTheme } from '@/context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@/lib/api';
import { cn } from '@/lib/utils';
import { IndexingProgressModal, IndexingStats } from './IndexingProgressModal';
import { GitHubConnectModal } from './GitHubConnectModal';
import { GitUrlModal } from './GitUrlModal';
import { LocalFolderModal } from './LocalFolderModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

export function LandingView() {
  const navigate = useNavigate();
  const { allProjects, selectProject, loadProjectFromPath, cloneProject, deleteProjectById, isLoading } = useProject();
  const { theme, toggleTheme } = useTheme();

  // Filter & Search states
  const [searchFilter, setSearchFilter] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'github' | 'local'>('all');
  const [sortBy, setSortBy] = useState<'last-analyzed' | 'name' | 'findings'>('last-analyzed');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modal visibility states
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showLocalModal, setShowLocalModal] = useState(false);
  const [showGitUrlModal, setShowGitUrlModal] = useState(false);

  // In-flight Indexing Progress State
  const [indexingModalOpen, setIndexingModalOpen] = useState(false);
  const [indexingComplete, setIndexingComplete] = useState(false);
  const [indexingName, setIndexingName] = useState('');
  const [indexingPath, setIndexingPath] = useState('');
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [indexingStats, setIndexingStats] = useState<IndexingStats | null>(null);
  const [indexedProject, setIndexedProject] = useState<Project | null>(null);

  // Three-dots menu and delete modal state
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const [deleteTargetProject, setDeleteTargetProject] = useState<Project | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Click-outside listener to close the three-dots dropdown
  useEffect(() => {
    if (!activeMenuProjectId) return;
    const handleDocumentClick = () => setActiveMenuProjectId(null);
    window.addEventListener('click', handleDocumentClick);
    return () => window.removeEventListener('click', handleDocumentClick);
  }, [activeMenuProjectId]);

  // Starred projects persistence
  const [starredIds, setStarredIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage?.getItem('sx-starred-projects') : null;
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...starredIds, [id]: !starredIds[id] };
    setStarredIds(updated);
    try {
      window.localStorage?.setItem('sx-starred-projects', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleSelectProject = (project: Project) => {
    selectProject(project);
    navigate(`/overview?projectId=${encodeURIComponent(project.projectId)}`);
  };

  // 1. Ingest Local Directory
  const handleLoadLocal = async (path: string, name?: string) => {
    setIndexingName(name || path);
    setIndexingPath(path);
    setIndexingError(null);
    setIndexingStats(null);
    setIndexedProject(null);
    setIndexingComplete(false);
    setIndexingModalOpen(true);

    try {
      const res = await loadProjectFromPath(path, name);
      if (res?.project) {
        setIndexedProject(res.project);
        setIndexingStats({
          files: res.stats?.files,
          routes: res.stats?.routes,
          functions: res.stats?.functions,
          models: res.stats?.models,
          nodes: res.graph?.nodes?.length,
          edges: res.graph?.edges?.length,
        });
        setIndexingComplete(true);
      }
    } catch (err: any) {
      setIndexingError(err.message || 'Failed to index local repository');
    }
  };

  // 2. Ingest Git URL
  const handleCloneGit = async (gitUrl: string, name?: string, branch?: string) => {
    setIndexingName(name || gitUrl);
    setIndexingPath(gitUrl);
    setIndexingError(null);
    setIndexingStats(null);
    setIndexedProject(null);
    setIndexingComplete(false);
    setIndexingModalOpen(true);

    try {
      const res = await cloneProject(gitUrl, name, branch);
      if (res?.project) {
        setIndexedProject(res.project);
        setIndexingStats({
          files: res.stats?.files,
          routes: res.stats?.routes,
          functions: res.stats?.functions,
          models: res.stats?.models,
          nodes: res.graph?.nodes?.length,
          edges: res.graph?.edges?.length,
        });
        setIndexingComplete(true);
      }
    } catch (err: any) {
      setIndexingError(err.message || 'Failed to clone repository');
    }
  };

  // 3. Ingest from GitHub Connect
  const handleImportGitHubRepo = async (pathOrUrl: string, name: string, isRemote?: boolean) => {
    if (isRemote) {
      handleCloneGit(pathOrUrl, name);
    } else {
      handleLoadLocal(pathOrUrl, name);
    }
  };

  // Filter & sort exclusively real projects
  const filteredProjects = useMemo(() => {
    return allProjects
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
          p.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
          (p.description && p.description.toLowerCase().includes(searchFilter.toLowerCase())) ||
          (p.tags && p.tags.some((t) => t.toLowerCase().includes(searchFilter.toLowerCase())));

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
          return (b.findingsCount ?? 0) - (a.findingsCount ?? 0);
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return 0; // last-analyzed order preserved
      });
  }, [allProjects, searchFilter, filterType, sortBy, starredIds]);

  const githubCount = allProjects.filter((p) => p.type === 'github').length;
  const localCount = allProjects.filter((p) => p.type === 'local').length;

  return (
    <div className="min-h-screen bg-bg text-fg font-sans flex flex-col selection:bg-primary/30">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP NAV / HEADER                                                 */}
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
              <div className="text-[11px] font-medium text-muted">Application Security Platform</div>
            </div>
          </div>

          {/* Center: Search projects input with ⌘K badge */}
          <div className="relative hidden md:block max-w-md w-full">
            <Search className="absolute left-3.5 top-2.5 size-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search projects by name, path, or framework..."
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
              title="Admin User"
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
            Add your MERN projects, let AI agents analyze, verify, and track security — all in one place.
          </p>
        </div>

        {/* 3 PRIMARY ACTION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Action 1: Connect GitHub */}
          <div
            onClick={() => setShowGitHubModal(true)}
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
            onClick={() => setShowGitUrlModal(true)}
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
                {allProjects.length}
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
            {/* Embedded input for mobile */}
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

            {/* Sort Dropdown */}
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
                  'rounded-lg p-1.5 text-muted transition-colors cursor-pointer',
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
                  'rounded-lg p-1.5 text-muted transition-colors cursor-pointer',
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
        {/* 3. PROJECT CARDS OR CLEAN EMPTY STATE                               */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {filteredProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/90 bg-surface-alt/20 p-12 text-center space-y-4">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <FolderPlus className="size-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-lg font-bold text-fg">No Repositories Added Yet</h3>
              <p className="text-xs text-muted leading-relaxed">
                Sentinel-X is ready. Add a local MERN application folder, connect your GitHub account, or clone
                from a Git URL to begin automated AST indexing and vulnerability analysis.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLocalModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
              >
                <Folder className="size-3.5" />
                <span>Add Local Repository</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGitUrlModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-fg hover:bg-surface-alt transition-all cursor-pointer"
              >
                <LinkIcon className="size-3.5" />
                <span>Add from Git URL</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
                : 'space-y-3',
            )}
          >
            {filteredProjects.map((project) => {
              const isStarred = Boolean(starredIds[project.projectId]);
              const findingsCount = project.findingsCount ?? 0;
              const hasBeenRun = Boolean(project.hasBeenRun);

              return (
                <div
                  key={project.projectId}
                  onClick={() => handleSelectProject(project)}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-surface/90 p-5 transition-all hover:border-primary/50 hover:shadow-xl hover:bg-surface cursor-pointer"
                >
                  <div>
                    {/* Top: Icon, Titles, Star */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="grid size-10 place-items-center rounded-xl bg-surface-alt border border-border/60 text-fg shrink-0">
                          {project.type === 'github' ? (
                            <Github className="size-5" />
                          ) : (
                            <Folder className="size-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-fg text-[15px] group-hover:text-primary transition-colors truncate">
                            {project.name}
                          </h3>
                          <p className="font-mono text-[11px] text-muted truncate">{project.path}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => toggleStar(project.projectId, e)}
                        className={cn(
                          'p-1 text-muted hover:text-amber-400 transition-colors shrink-0 cursor-pointer',
                          isStarred && 'text-amber-400 fill-amber-400',
                        )}
                        title={isStarred ? 'Unstar' : 'Star'}
                      >
                        <Star className={cn('size-4.5', isStarred && 'fill-current')} />
                      </button>
                    </div>

                    {/* Description */}
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted line-clamp-2">
                      {project.description || 'MERN repository indexed by Sentinel-X agentic security engine.'}
                    </p>

                    {/* Technology Pills */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {(project.tags || ['Express', 'Node.js', 'MongoDB']).map((tag) => (
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
                      <span className="text-[11.5px] text-muted">
                        {project.analyzedAgo || (hasBeenRun ? 'Recently analyzed' : 'Never analyzed')}
                      </span>

                      {/* Findings Pill */}
                      {findingsCount > 0 ? (
                        <div className="flex items-center gap-1.5 text-danger font-medium text-[11.5px]">
                          <ShieldAlert className="size-3.5" />
                          <span>
                            {findingsCount} findings
                            {(project.criticalCount ?? 0) > 0 && ` · ${project.criticalCount} crit`}
                            {(project.highCount ?? 0) > 0 && ` · ${project.highCount} high`}
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
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold border border-border/90 bg-surface-alt/70 text-fg hover:bg-primary hover:text-white hover:border-transparent transition-all cursor-pointer shadow-sm"
                      >
                        <span>Open Project</span>
                        <ArrowRight className="size-3.5" />
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuProjectId((prev) => (prev === project.projectId ? null : project.projectId));
                          }}
                          className={cn(
                            'grid size-8 place-items-center rounded-xl border border-border/80 bg-surface-alt/50 text-muted hover:text-fg hover:bg-surface-alt transition-colors shrink-0 cursor-pointer',
                            activeMenuProjectId === project.projectId && 'bg-surface-alt text-fg border-primary/50',
                          )}
                          title="More options"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {activeMenuProjectId === project.projectId && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 bottom-full mb-2 w-44 rounded-xl border border-border/90 bg-surface p-1.5 shadow-2xl z-30 space-y-0.5 animate-in fade-in zoom-in-95 duration-150"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(project.path);
                                setCopiedId(project.projectId);
                                setTimeout(() => setCopiedId(null), 1500);
                                setActiveMenuProjectId(null);
                              }}
                              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-fg hover:bg-surface-alt transition-colors cursor-pointer text-left"
                            >
                              {copiedId === project.projectId ? (
                                <>
                                  <Check className="size-3.5 text-emerald-400" />
                                  <span className="text-emerald-400 font-medium">Path Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3.5 text-muted" />
                                  <span>Copy Path</span>
                                </>
                              )}
                            </button>

                            <div className="h-px bg-border/60 my-0.5" />

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuProjectId(null);
                                setDeleteTargetProject(project);
                              }}
                              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors cursor-pointer text-left font-medium"
                            >
                              <Trash2 className="size-3.5" />
                              <span>Un-index Project</span>
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
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. MODALS: GITHUB, LOCAL FOLDER, GIT URL & INDEXING PROGRESS        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <GitHubConnectModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        onImportRepo={handleImportGitHubRepo}
      />

      <LocalFolderModal
        isOpen={showLocalModal}
        onClose={() => setShowLocalModal(false)}
        onSubmit={handleLoadLocal}
      />

      <GitUrlModal
        isOpen={showGitUrlModal}
        onClose={() => setShowGitUrlModal(false)}
        onSubmit={handleCloneGit}
      />

      <IndexingProgressModal
        isOpen={indexingModalOpen}
        isComplete={indexingComplete}
        projectName={indexingName}
        projectPath={indexingPath}
        error={indexingError}
        stats={indexingStats}
        project={indexedProject}
        onOpenProject={(p) => {
          setIndexingModalOpen(false);
          handleSelectProject(p);
        }}
        onClose={() => setIndexingModalOpen(false)}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTargetProject)}
        project={deleteTargetProject}
        onClose={() => setDeleteTargetProject(null)}
        onConfirm={async () => {
          if (deleteTargetProject) {
            await deleteProjectById(deleteTargetProject.projectId);
          }
        }}
      />
    </div>
  );
}
