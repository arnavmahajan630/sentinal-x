import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2, X, Folder, Github, ShieldAlert } from 'lucide-react';
import type { Project } from '@/lib/api';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  project: Project | null;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  project,
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !project) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to un-index project');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/90 bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-danger/10 text-danger border border-danger/20">
              <Trash2 className="size-5" />
            </span>
            <div>
              <h3 className="font-bold text-fg text-base">Un-index Project</h3>
              <p className="text-xs text-muted">Remove repository from database</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-fg disabled:opacity-50 cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Target Project Card */}
        <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3.5 space-y-2">
          <div className="flex items-center gap-2.5">
            {project.type === 'github' ? (
              <Github className="size-4 text-fg" />
            ) : (
              <Folder className="size-4 text-primary" />
            )}
            <span className="font-bold text-sm text-fg truncate">{project.name}</span>
          </div>
          <div className="font-mono text-xs text-muted truncate bg-surface/70 border border-border/60 rounded-lg px-2.5 py-1">
            {project.path}
          </div>
          {(project.findingsCount ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-danger font-medium pt-0.5">
              <ShieldAlert className="size-3.5" />
              <span>{project.findingsCount} associated security findings will be purged</span>
            </div>
          )}
        </div>

        {/* Warning Note */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
          <AlertTriangle className="size-4.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-fg leading-relaxed">
            <span className="font-semibold text-amber-400">Database Purge Only:</span> This will permanently
            remove this project, its Security Graph, routes, and findings from Sentinel-X. Files on your disk
            at <code className="font-mono text-[11px] text-fg/90">{project.path}</code> will not be modified or deleted.
          </div>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger font-mono">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted hover:text-fg hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-danger/90 transition-all cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Un-indexing...</span>
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                <span>Un-index & Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
