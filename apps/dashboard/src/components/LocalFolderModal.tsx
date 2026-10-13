import { useState, useEffect } from 'react';
import {
  Folder,
  X,
  Play,
  Terminal,
  ChevronRight,
  FolderOpen,
  ArrowUp,
  FileCode,
  Loader2,
  Check,
} from 'lucide-react';
import { browseLocalDirectory } from '@/lib/api';

interface LocalFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (path: string, name?: string) => void;
}

export function LocalFolderModal({ isOpen, onClose, onSubmit }: LocalFolderModalProps) {
  const [inputPath, setInputPath] = useState('packages/engine/test/fixtures/vuln-mern');
  const [projectName, setProjectName] = useState('vulnerable-mern-app');
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserData, setBrowserData] = useState<{
    current: string;
    parent: string | null;
    directories: Array<{ name: string; path: string; hasPackageJson: boolean; isGit: boolean }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (showBrowser && !browserData) {
      loadDirectory();
    }
  }, [showBrowser]);

  if (!isOpen) return null;

  const loadDirectory = async (dir?: string) => {
    setBrowserLoading(true);
    try {
      const data = await browseLocalDirectory(dir);
      setBrowserData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to browse directory');
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPath.trim()) {
      setError('Please provide a filesystem directory path');
      return;
    }
    setError(null);
    onSubmit(inputPath.trim(), projectName.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/90 bg-surface p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Folder className="size-4.5" />
            </span>
            <div>
              <h3 className="font-bold text-fg text-base">Add Local Repository</h3>
              <p className="text-xs text-muted">Index and analyze a MERN project directory from your filesystem</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-fg">Project Directory Path</label>
              <button
                type="button"
                onClick={() => setShowBrowser((v) => !v)}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <FolderOpen className="size-3" />
                <span>{showBrowser ? 'Hide Directory Browser' : 'Browse Local Folders'}</span>
              </button>
            </div>
            <div className="relative">
              <Terminal className="absolute left-3 top-2.5 size-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/app/sandbox-target or packages/engine/test/fixtures/vuln-mern"
                className="w-full rounded-xl border border-border bg-surface-alt py-2 pl-9 pr-3 font-mono text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Interactive Server Filesystem Directory Browser */}
          {showBrowser && (
            <div className="rounded-xl border border-border/80 bg-surface-alt/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-muted border-b border-border/60 pb-1.5">
                <span className="truncate max-w-xs">{browserData?.current || 'Loading...'}</span>
                {browserData?.parent && (
                  <button
                    type="button"
                    onClick={() => loadDirectory(browserData.parent!)}
                    className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                  >
                    <ArrowUp className="size-3" />
                    <span>Up</span>
                  </button>
                )}
              </div>

              {browserLoading ? (
                <div className="py-4 flex justify-center text-primary">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {browserData?.directories.map((dir) => (
                    <div
                      key={dir.path}
                      className="flex items-center justify-between rounded-lg p-1.5 text-xs hover:bg-surface transition-colors cursor-pointer"
                      onClick={() => {
                        setInputPath(dir.path);
                        setProjectName(dir.name);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="size-3.5 text-primary shrink-0" />
                        <span className="truncate text-fg font-mono text-[11.5px]">{dir.name}</span>
                        {dir.hasPackageJson && (
                          <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 text-[9.5px]">
                            MERN
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadDirectory(dir.path);
                        }}
                        className="text-muted hover:text-fg p-0.5"
                        title="Enter directory"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">Project Name (Optional)</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="vulnerable-mern-app"
              className="w-full rounded-xl border border-border bg-surface-alt py-2 px-3 text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs font-mono text-danger bg-danger/10 p-2.5 rounded-lg border border-danger/30">
              {error}
            </p>
          )}

          {/* Quick preset */}
          <div className="rounded-xl border border-border/70 bg-surface-alt/40 p-3 text-xs text-muted flex items-center justify-between">
            <span>Sample Target App:</span>
            <button
              type="button"
              onClick={() => {
                setInputPath('packages/engine/test/fixtures/vuln-mern');
                setProjectName('vulnerable-mern-app');
              }}
              className="font-mono text-primary hover:underline text-[11px]"
            >
              vulnerable-mern-app fixture
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/80">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-3.5 py-1.5 text-xs text-muted hover:text-fg hover:bg-surface-alt"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 cursor-pointer"
            >
              <Play className="size-3.5 fill-current" />
              <span>Index Repository</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
