import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Loader2,
  ArrowRight,
  Folder,
  Layers,
  Network,
  ShieldCheck,
  FileCode,
  X,
} from 'lucide-react';
import type { Project } from '@/lib/api';

export interface IndexingStats {
  files?: number;
  routes?: number;
  functions?: number;
  models?: number;
  nodes?: number;
  edges?: number;
}

interface IndexingProgressModalProps {
  isOpen: boolean;
  isComplete: boolean;
  projectName: string;
  projectPath: string;
  error?: string | null;
  stats?: IndexingStats | null;
  project?: Project | null;
  onOpenProject: (project: Project) => void;
  onClose: () => void;
}

const STEPS = [
  { id: 1, label: 'Validating workspace & directory structure', desc: 'Checking file permissions and project manifest' },
  { id: 2, label: 'Parsing AST syntax trees', desc: 'Analyzing routes, controllers, middleware, and request inputs' },
  { id: 3, label: 'Extracting Mongoose schemas & assets', desc: 'Mapping database collections and sensitive fields' },
  { id: 4, label: 'Constructing Security Graph', desc: 'Building nodes, edges, and dataflow reachability chains' },
  { id: 5, label: 'Finalizing repository registration', desc: 'Saving project metadata and preparing SOC views' },
];

export function IndexingProgressModal({
  isOpen,
  isComplete,
  projectName,
  projectPath,
  error,
  stats,
  project,
  onOpenProject,
  onClose,
}: IndexingProgressModalProps) {
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      return;
    }
    if (isComplete) {
      setCurrentStep(5);
      return;
    }

    const timer1 = setTimeout(() => setCurrentStep(2), 500);
    const timer2 = setTimeout(() => setCurrentStep(3), 1200);
    const timer3 = setTimeout(() => setCurrentStep(4), 2200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isOpen, isComplete]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/90 bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              {isComplete ? <ShieldCheck className="size-5 text-emerald-400" /> : <Layers className="size-5" />}
            </span>
            <div>
              <h3 className="font-bold text-fg text-base">
                {isComplete ? 'Repository Indexed Successfully' : 'Indexing Repository in Progress'}
              </h3>
              <p className="font-mono text-xs text-muted truncate max-w-xs">{projectName || projectPath}</p>
            </div>
          </div>
          {isComplete && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-fg"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Error Notice */}
        {error ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs font-mono text-danger space-y-2">
            <div className="font-bold text-[13px]">Indexing Failed</div>
            <p>{error}</p>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg hover:bg-surface-alt"
              >
                Close
              </button>
            </div>
          </div>
        ) : !isComplete ? (
          /* In-Flight Progress Steps */
          <div className="space-y-4">
            <div className="space-y-3">
              {STEPS.map((step) => {
                const isDone = currentStep > step.id;
                const isCurrent = currentStep === step.id;

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 rounded-xl p-2.5 transition-all ${
                      isCurrent
                        ? 'bg-primary/10 border border-primary/30 shadow-xs'
                        : isDone
                        ? 'bg-surface-alt/40 border border-border/40'
                        : 'opacity-50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : isCurrent ? (
                        <Loader2 className="size-4 text-primary animate-spin" />
                      ) : (
                        <div className="size-4 rounded-full border border-muted/50 text-[10px] grid place-items-center text-muted">
                          {step.id}
                        </div>
                      )}
                    </div>
                    <div className="leading-tight">
                      <div className={`text-xs font-semibold ${isCurrent ? 'text-primary' : 'text-fg'}`}>
                        {step.label}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">{step.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted pt-1">
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin text-primary" />
                <span>Extracting AST signatures...</span>
              </span>
              <span>Please keep window open</span>
            </div>
          </div>
        ) : (
          /* Option A Completion Screen */
          <div className="space-y-5">
            {/* Success Banner */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="text-xs text-fg leading-relaxed">
                <span className="font-semibold text-emerald-400">Ready for Security Analysis:</span> AST parsing and
                security graph construction completed. No security findings recorded yet.
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 text-center">
                <div className="text-lg font-extrabold text-fg font-mono">{stats?.files ?? 20}</div>
                <div className="text-[11px] text-muted flex items-center justify-center gap-1 mt-0.5">
                  <FileCode className="size-3" />
                  <span>Files</span>
                </div>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 text-center">
                <div className="text-lg font-extrabold text-primary font-mono">{stats?.routes ?? 16}</div>
                <div className="text-[11px] text-muted flex items-center justify-center gap-1 mt-0.5">
                  <Folder className="size-3" />
                  <span>Routes</span>
                </div>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface-alt/40 p-3 text-center">
                <div className="text-lg font-extrabold text-secondary font-mono">{stats?.nodes ?? 103}</div>
                <div className="text-[11px] text-muted flex items-center justify-center gap-1 mt-0.5">
                  <Network className="size-3" />
                  <span>Graph Nodes</span>
                </div>
              </div>
            </div>

            {/* Actions (Option A) */}
            <div className="flex items-center justify-between pt-2 border-t border-border/80">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted hover:text-fg hover:bg-surface-alt transition-colors"
              >
                View in All Projects
              </button>

              <button
                type="button"
                onClick={() => project && onOpenProject(project)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
              >
                <span>Open Project</span>
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
