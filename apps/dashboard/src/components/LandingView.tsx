import { useState } from 'react';
import {
  Folder,
  Github,
  Link,
  Plus,
  Search,
  ArrowRight,
  Loader2,
  Sparkles,
  ShieldAlert,
  Layers,
  Terminal,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { cn } from '@/lib/utils';

export function LandingView() {
  const { allProjects, selectProject, loadProjectFromPath, isLoading } = useProject();
  const [localPathInput, setLocalPathInput] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const handleLoadPath = async (pathToLoad: string) => {
    if (!pathToLoad.trim()) return;
    setErrorMsg(null);
    try {
      await loadProjectFromPath(pathToLoad.trim());
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to index project directory');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLoadPath(localPathInput);
  };

  // Quick preset paths depending on container vs local
  const handleQuickLoadDemo = () => {
    // Try container fixture path first, or workspace path
    const candidatePath = '/app/sandbox-target';
    handleLoadPath(candidatePath);
  };

  const filteredProjects = allProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.path.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* HERO BANNER                                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface/70 p-8 shadow-sm backdrop-blur-md">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 size-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
            <Layers className="size-3.5" />
            <span>Sentinel-X SOC Platform</span>
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-fg md:text-4xl">
            Secure What{' '}
            <span className="bg-gradient-to-r from-primary via-indigo-400 to-secondary bg-clip-text text-transparent">
              You Build
            </span>
          </h1>

          <p className="mt-2 text-[14.5px] font-medium text-muted">
            Analyze. Understand. Verify. Track.
          </p>

          <p className="mt-3 text-[13.5px] leading-relaxed text-muted/90">
            A self-hosted, agentic application-security platform for MERN apps. Connect a repository below to build its AST-driven security model, execute live agent investigations, and verify exploits against an isolated sandbox.
          </p>

          {/* Quick Start Action */}
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
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3 CORE ACTION CARDS (GitHub / Local / Git URL)                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted">
          Connect a Repository
        </h2>

        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 1. Connect GitHub (Deferred to N13) */}
          <div className="relative flex flex-col justify-between rounded-2xl border bg-surface-alt/30 p-5 opacity-60">
            <span className="absolute right-4 top-4 rounded-full bg-surface-alt px-2.5 py-0.5 text-[10px] font-semibold text-muted">
              GitHub (N13)
            </span>
            <div>
              <div className="grid size-10 place-items-center rounded-xl bg-surface-alt text-muted">
                <Github className="size-5" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-fg">Connect GitHub</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Import and sync your remote GitHub repositories with automatic PR analysis and webhooks.
              </p>
            </div>
            <div className="mt-5 flex items-center text-[12px] font-medium text-muted">
              Available in Extension N13
            </div>
          </div>

          {/* 2. Add Local Repository (Active & Live) */}
          <div
            onClick={() => setShowPathInput(true)}
            className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-primary/50 bg-primary/5 p-5 transition-all hover:border-primary hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/5"
          >
            <div>
              <div className="grid size-10 place-items-center rounded-xl bg-primary text-white shadow-md shadow-primary/20">
                <Plus className="size-5" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-fg">Add Local Repository</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Index a MERN application directly from the filesystem to extract routes, middleware, and models.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-1.5 text-[12.5px] font-semibold text-primary group-hover:underline">
              <span>Select or Type Path</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* 3. Add from Git URL (Deferred to N13) */}
          <div className="relative flex flex-col justify-between rounded-2xl border bg-surface-alt/30 p-5 opacity-60">
            <span className="absolute right-4 top-4 rounded-full bg-surface-alt px-2.5 py-0.5 text-[10px] font-semibold text-muted">
              Git URL (N13)
            </span>
            <div>
              <div className="grid size-10 place-items-center rounded-xl bg-surface-alt text-muted">
                <Link className="size-5" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-fg">Add from Git URL</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                Clone and analyze any public or private git repository using token or SSH authentication.
              </p>
            </div>
            <div className="mt-5 flex items-center text-[12px] font-medium text-muted">
              Available in Extension N13
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CUSTOM PATH INPUT FORM                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showPathInput && (
        <form
          onSubmit={handleFormSubmit}
          className="rounded-2xl border border-primary/40 bg-surface/80 p-5 shadow-sm"
        >
          <div className="text-[14px] font-semibold text-fg">Project Root Directory Path</div>
          <div className="mt-1 text-[12px] text-muted">
            Provide the directory path containing your MERN backend (package.json, Express routes).
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={localPathInput}
              onChange={(e) => setLocalPathInput(e.target.value)}
              placeholder="e.g. /app/sandbox-target or /workspace/packages/engine/test/fixtures/vuln-mern"
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
            <div className="mt-2.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-[12px] font-medium text-danger">
              {errorMsg}
            </div>
          )}
        </form>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* INDEXED REPOSITORIES LIST                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {allProjects.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted">
              Indexed Repositories ({filteredProjects.length})
            </h2>
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 size-3.5 text-muted" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-lg border bg-surface-alt/30 py-1 pl-8 pr-3 text-[12px] text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredProjects.map((p) => (
              <div
                key={p.projectId}
                className="flex flex-col justify-between rounded-2xl border bg-surface/60 p-4 transition-all hover:border-border/80 hover:bg-surface/90"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-fg text-[14px]">{p.name}</span>
                    <span className="rounded-md border bg-surface-alt/50 px-2 py-0.5 font-mono text-[11px] text-muted">
                      {p.gitBranch || 'main'}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11.5px] text-muted">
                    {p.path}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                      Express
                    </span>
                    <span className="rounded-md bg-secondary/10 px-2 py-0.5 text-[10.5px] font-medium text-secondary">
                      React
                    </span>
                    <span className="rounded-md bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
                      MongoDB
                    </span>
                    {p.stats && (
                      <span className="rounded-md bg-surface-alt px-2 py-0.5 text-[10.5px] text-muted">
                        {p.stats.routes} routes · {p.stats.files} files
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="text-[11px] text-muted">
                    {p.indexedAt ? `Indexed ${new Date(p.indexedAt).toLocaleDateString()}` : 'Ready'}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectProject(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-1.5 text-[12px] font-semibold text-fg hover:bg-primary hover:text-white transition-colors"
                  >
                    <span>Open Project</span>
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
