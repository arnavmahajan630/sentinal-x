import { useState } from 'react';
import {
  Folder,
  Github,
  Link as LinkIcon,
  Plus,
  Search,
  X,
  ArrowRight,
  Loader2,
  FolderGit2,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useNavigate } from 'react-router-dom';
import { LocalFolderModal } from './LocalFolderModal';
import { GitUrlModal } from './GitUrlModal';
import { GitHubConnectModal } from './GitHubConnectModal';
import { IndexingProgressModal, IndexingStats } from './IndexingProgressModal';
import type { Project } from '@/lib/api';

export function ProjectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { allProjects, selectProject, loadProjectFromPath, cloneProject, isLoading } = useProject();

  const [searchFilter, setSearchFilter] = useState('');
  const [showLocalModal, setShowLocalModal] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);

  // In-flight Indexing Progress State
  const [indexingModalOpen, setIndexingModalOpen] = useState(false);
  const [indexingComplete, setIndexingComplete] = useState(false);
  const [indexingName, setIndexingName] = useState('');
  const [indexingPath, setIndexingPath] = useState('');
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [indexingStats, setIndexingStats] = useState<IndexingStats | null>(null);
  const [indexedProject, setIndexedProject] = useState<Project | null>(null);

  if (!isOpen) return null;

  const handleOpenProject = (p: Project) => {
    selectProject(p);
    onClose();
    navigate(`/overview?projectId=${encodeURIComponent(p.projectId)}`);
  };

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

  const filteredProjects = allProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.path.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border/90 bg-surface shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Folder className="size-4" />
              </span>
              <div>
                <h2 className="text-[16px] font-bold text-fg">Project Repositories</h2>
                <p className="text-[12px] text-muted">Select, connect, or index a project to analyze</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-alt hover:text-fg cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Action Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* GitHub */}
              <div
                onClick={() => setShowGitHubModal(true)}
                className="group cursor-pointer flex flex-col justify-between rounded-xl border border-border/80 bg-surface-alt/30 p-4 transition-all hover:border-primary/50 hover:bg-surface-alt/60"
              >
                <div>
                  <Github className="size-6 text-fg group-hover:text-primary transition-colors" />
                  <h3 className="mt-3 text-[14px] font-semibold text-fg">Connect GitHub</h3>
                  <p className="mt-1 text-[11.5px] text-muted leading-relaxed">
                    Import and sync repositories from your GitHub account.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-primary">
                  <span>Connect Account</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>

              {/* Add Local Repository */}
              <div
                onClick={() => setShowLocalModal(true)}
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
                <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-primary">
                  <span>Choose Folder</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>

              {/* Git URL */}
              <div
                onClick={() => setShowGitModal(true)}
                className="group cursor-pointer flex flex-col justify-between rounded-xl border border-border/80 bg-surface-alt/30 p-4 transition-all hover:border-primary/50 hover:bg-surface-alt/60"
              >
                <div>
                  <LinkIcon className="size-6 text-fg group-hover:text-primary transition-colors" />
                  <h3 className="mt-3 text-[14px] font-semibold text-fg">Add from Git URL</h3>
                  <p className="mt-1 text-[11.5px] text-muted leading-relaxed">
                    Clone and analyze an arbitrary public or private repository.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-primary">
                  <span>Enter URL</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>

            {/* Search & Existing Projects */}
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 size-3.5 text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search indexed repositories..."
                    className="w-full rounded-lg border border-border/80 bg-surface-alt/30 py-1.5 pl-8 pr-4 text-[12.5px] text-fg placeholder:text-muted/60 focus:border-primary/60 focus:outline-none"
                  />
                </div>
                <span className="text-[12px] text-muted">
                  {filteredProjects.length} repository(s)
                </span>
              </div>

              {/* Projects Grid */}
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredProjects.map((p) => (
                  <div
                    key={p.projectId}
                    className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface-alt/20 p-4 transition-colors hover:border-primary/40 hover:bg-surface-alt/40"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-fg text-[14px] truncate">{p.name}</span>
                        <span className="rounded-md border border-border/60 bg-surface px-2 py-0.5 font-mono text-[11px] text-muted shrink-0">
                          {p.type === 'github' ? 'GitHub' : 'Local'}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[11.5px] text-muted">{p.path}</div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(p.tags || ['Express', 'Node.js', 'MongoDB']).map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-surface border border-border/70 px-2 py-0.5 text-[10.5px] font-mono text-muted"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                      <span className="text-[11px] text-muted">
                        {p.hasBeenRun
                          ? `${p.findingsCount ?? 0} findings`
                          : 'Never analyzed (0 findings)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenProject(p)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-1.5 text-[12px] font-semibold text-fg hover:bg-primary hover:text-white transition-colors cursor-pointer"
                      >
                        <span>Open Project</span>
                        <ArrowRight className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {filteredProjects.length === 0 && (
                  <div className="col-span-2 py-10 text-center text-muted text-xs">
                    No repositories added yet. Choose an option above to ingest your first project.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <LocalFolderModal
        isOpen={showLocalModal}
        onClose={() => setShowLocalModal(false)}
        onSubmit={handleLoadLocal}
      />

      <GitUrlModal
        isOpen={showGitModal}
        onClose={() => setShowGitModal(false)}
        onSubmit={handleCloneGit}
      />

      <GitHubConnectModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        onImportRepo={(pathOrUrl, name, isRemote) => {
          if (isRemote) {
            handleCloneGit(pathOrUrl, name);
          } else {
            handleLoadLocal(pathOrUrl, name);
          }
        }}
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
          handleOpenProject(p);
        }}
        onClose={() => setIndexingModalOpen(false)}
      />
    </>
  );
}
