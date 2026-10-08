import { useState } from 'react';
import {
  ChevronDown,
  FolderOpen,
  GitBranch,
  GitCommit,
  Moon,
  Play,
  Search,
  Sun,
  Loader2,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function TopBar({ onOpenProjectModal }: { onOpenProjectModal?: () => void }) {
  const { activeProject, allProjects, selectProject, runAnalysis, isAnalyzing } = useProject();
  const { theme, toggleTheme } = useTheme();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-surface/40 px-6">
      <button type="button" disabled className="sr-only" aria-hidden="false">
        Load project
      </button>
      {/* Left: Project Selector & Git Info */}
      <div className="flex items-center gap-3">
        {/* Project Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProjectDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border bg-surface-alt/60 px-3 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-alt hover:border-border/80"
          >
            <span className="size-2 rounded-full bg-danger animate-pulse" />
            <span className="max-w-[160px] truncate">
              {activeProject?.name || 'Select Project'}
            </span>
            <ChevronDown className="size-3.5 text-muted" />
          </button>

          {projectDropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-xl border bg-surface p-1.5 shadow-xl">
              <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Repositories ({allProjects.length})
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {allProjects.map((p) => (
                  <button
                    key={p.projectId}
                    type="button"
                    onClick={() => {
                      selectProject(p);
                      setProjectDropdownOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg/90 hover:bg-surface-alt',
                      activeProject?.projectId === p.projectId && 'bg-primary/10 text-primary font-medium',
                    )}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[11px] text-muted">{p.stats?.routes ?? 0} routes</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 border-t pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setProjectDropdownOpen(false);
                    onOpenProjectModal?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-primary/10"
                >
                  <FolderOpen className="size-3.5" />
                  Load Local Repository...
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Git Branch & Commit */}
        {activeProject && (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <div className="flex items-center gap-1 rounded-md border bg-surface-alt/30 px-2 py-1 font-mono text-[11.5px] text-fg/80">
              <GitBranch className="size-3 text-muted" />
              <span>{activeProject.gitBranch || 'main'}</span>
            </div>
            {activeProject.gitHead && (
              <div className="flex items-center gap-1 rounded-md border bg-surface-alt/30 px-2 py-1 font-mono text-[11.5px] text-muted">
                <GitCommit className="size-3 text-muted" />
                <span>{activeProject.gitHead.slice(0, 7)}</span>
              </div>
            )}
            <span className="hidden text-[11.5px] text-muted/70 lg:inline">
              Last analyzed {activeProject.indexedAt ? new Date(activeProject.indexedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'}
            </span>
          </div>
        )}
      </div>

      {/* Right: Search, Theme Toggle, Run Analysis */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative hidden w-64 md:block">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search routes, findings, agents..."
            className="w-full rounded-lg border bg-surface-alt/40 py-1.5 pl-8 pr-8 text-[12.5px] text-fg placeholder:text-muted/70 focus:border-primary/60 focus:outline-none"
          />
          <kbd className="absolute right-2.5 top-2 rounded border bg-surface px-1.5 py-0.5 text-[10px] text-muted">
            ⌘K
          </kbd>
        </div>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="grid size-8 place-items-center rounded-lg border bg-surface-alt/40 text-muted transition-colors hover:bg-surface-alt hover:text-fg"
        >
          {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>

        {/* Run Analysis CTA */}
        <button
          type="button"
          onClick={runAnalysis}
          disabled={!activeProject || isAnalyzing}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Play className="size-3.5 fill-current" />
              <span>Run Analysis</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
