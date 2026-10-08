import { useState } from 'react';
import {
  Folder,
  Github,
  Link,
  Plus,
  Search,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';

export function ProjectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { allProjects, selectProject, loadProjectFromPath, isLoading } = useProject();
  const [localPathInput, setLocalPathInput] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen) return null;

  const handleLoadLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPathInput.trim()) return;
    setErrorMsg(null);
    try {
      await loadProjectFromPath(localPathInput.trim());
      setShowPathInput(false);
      setLocalPathInput('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to index project directory');
    }
  };

  const filteredProjects = allProjects.filter((p) =>
    p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.path.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Folder className="size-4" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-fg">Project Repositories</h2>
              <p className="text-[12px] text-muted">Select or index a project to analyze</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-alt hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Action Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* GitHub - Non-core disabled */}
            <div className="relative flex flex-col justify-between rounded-xl border bg-surface-alt/30 p-4 opacity-60">
              <span className="absolute right-3 top-3 rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-medium text-muted">
                GitHub (N13)
              </span>
              <div>
                <Github className="size-6 text-muted" />
                <h3 className="mt-3 text-[14px] font-semibold text-fg">Connect GitHub</h3>
                <p className="mt-1 text-[11.5px] text-muted leading-relaxed">
                  Import and sync your remote GitHub repositories.
                </p>
              </div>
              <div className="mt-4 flex items-center text-[12px] font-medium text-muted">
                Available in N13
              </div>
            </div>

            {/* Add Local Repository - Live */}
            <div
              onClick={() => setShowPathInput(true)}
              className="group cursor-pointer flex flex-col justify-between rounded-xl border border-primary/40 bg-primary/5 p-4 transition-all hover:border-primary hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/5"
            >
              <div>
                <span className="grid size-8 place-items-center rounded-lg bg-primary text-white">
                  <Plus className="size-4.5" />
                </span>
                <h3 className="mt-3 text-[14px] font-semibold text-fg">Add Local Repository</h3>
                <p className="mt-1 text-[11.5px] text-muted leading-relaxed">
                  Index a MERN project directory directly from your local filesystem.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-primary group-hover:underline">
                <span>Select Folder</span>
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>

            {/* Git URL - Non-core disabled */}
            <div className="relative flex flex-col justify-between rounded-xl border bg-surface-alt/30 p-4 opacity-60">
              <span className="absolute right-3 top-3 rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-medium text-muted">
                Git URL (N13)
              </span>
              <div>
                <Link className="size-6 text-muted" />
                <h3 className="mt-3 text-[14px] font-semibold text-fg">Add from Git URL</h3>
                <p className="mt-1 text-[11.5px] text-muted leading-relaxed">
                  Clone and analyze an arbitrary public or private repository.
                </p>
              </div>
              <div className="mt-4 flex items-center text-[12px] font-medium text-muted">
                Available in N13
              </div>
            </div>
          </div>

          {/* Local Path Input Form */}
          {showPathInput && (
            <form onSubmit={handleLoadLocal} className="rounded-xl border border-primary/50 bg-surface-alt/60 p-4">
              <div className="text-[13px] font-semibold text-fg">Enter Project Directory Path</div>
              <div className="mt-1 text-[11.5px] text-muted">
                Provide the absolute path to a MERN application root directory.
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={localPathInput}
                  onChange={(e) => setLocalPathInput(e.target.value)}
                  placeholder="e.g. D:\Sentinal X\packages\engine\test\fixtures\vuln-mern"
                  className="flex-1 rounded-lg border bg-surface px-3 py-2 text-[13px] text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Index & Load'}
                </button>
              </div>
              {errorMsg && <div className="mt-2 text-[12px] font-medium text-danger">{errorMsg}</div>}
            </form>
          )}

          {/* Search & Existing Projects */}
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-3.5 text-muted" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search indexed repositories..."
                  className="w-full rounded-lg border bg-surface-alt/30 py-1.5 pl-8 pr-4 text-[12.5px] text-fg placeholder:text-muted/60 focus:border-primary/60 focus:outline-none"
                />
              </div>
              <span className="text-[12px] text-muted">
                {filteredProjects.length} project(s)
              </span>
            </div>

            {/* Projects Grid */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredProjects.map((p) => (
                <div
                  key={p.projectId}
                  className="flex flex-col justify-between rounded-xl border bg-surface-alt/20 p-4 transition-colors hover:border-border/80 hover:bg-surface-alt/40"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-fg text-[14px]">{p.name}</span>
                      <span className="rounded-md border bg-surface-alt/50 px-2 py-0.5 font-mono text-[11px] text-muted">
                        {p.gitBranch || 'main'}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11.5px] text-muted">{p.path}</div>

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
                      onClick={() => {
                        selectProject(p);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-1.5 text-[12px] font-semibold text-fg hover:bg-primary hover:text-white transition-colors"
                    >
                      <span>Open Project</span>
                      <ArrowRight className="size-3" />
                    </button>
                  </div>
                </div>
              ))}

              {filteredProjects.length === 0 && (
                <div className="col-span-2 py-8 text-center text-muted">
                  No indexed repositories found. Add a local repository above to begin.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
