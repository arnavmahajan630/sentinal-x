import { useState } from 'react';
import {
  Link as LinkIcon,
  X,
  Play,
  Loader2,
  FolderGit2,
  ExternalLink,
  Terminal,
} from 'lucide-react';

interface GitUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (gitUrl: string, name?: string, branch?: string) => void;
}

export function GitUrlModal({ isOpen, onClose, onSubmit }: GitUrlModalProps) {
  const [gitUrl, setGitUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [branch, setBranch] = useState('main');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim()) {
      setError('Please provide a Git repository URL');
      return;
    }
    setError(null);
    onSubmit(gitUrl.trim(), projectName.trim() || undefined, branch.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/90 bg-surface p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-secondary/10 text-secondary border border-secondary/20">
              <LinkIcon className="size-4.5" />
            </span>
            <div>
              <h3 className="font-bold text-fg text-base">Add from Git URL</h3>
              <p className="text-xs text-muted">Clone and index any remote public or private repository</p>
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
            <label className="block text-xs font-semibold text-fg mb-1">Git Repository URL</label>
            <div className="relative">
              <Terminal className="absolute left-3 top-2.5 size-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/organization/repository.git"
                className="w-full rounded-xl border border-border bg-surface-alt py-2 pl-9 pr-3 font-mono text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-fg mb-1">Project Name (Optional)</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Auto-detected from URL"
                className="w-full rounded-xl border border-border bg-surface-alt py-2 px-3 text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full rounded-xl border border-border bg-surface-alt py-2 px-3 font-mono text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-mono text-danger bg-danger/10 p-2.5 rounded-lg border border-danger/30">
              {error}
            </p>
          )}

          <div className="rounded-xl border border-border/70 bg-surface-alt/40 p-3 text-xs text-muted flex items-center justify-between">
            <span>Quick test sample:</span>
            <button
              type="button"
              onClick={() => {
                setGitUrl('https://github.com/OWASP/NodeGoat.git');
                setProjectName('NodeGoat');
              }}
              className="font-mono text-primary hover:underline text-[11px]"
            >
              OWASP/NodeGoat.git
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
              <span>Clone & Index</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
