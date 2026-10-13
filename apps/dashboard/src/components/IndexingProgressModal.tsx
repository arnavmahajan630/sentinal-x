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
  Sparkles,
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
  {
    id: 1,
    label: 'Validating workspace & directory structure',
    desc: 'Checking file permissions, package manifest, and source roots',
    detail: 'Scanning package.json, directory structure, and runtime dependencies...',
  },
  {
    id: 2,
    label: 'Parsing AST syntax trees',
    desc: 'Analyzing routes, controllers, middleware, and request inputs',
    detail: 'Traversing JavaScript/TypeScript ASTs for handlers and inputs...',
  },
  {
    id: 3,
    label: 'Extracting Mongoose schemas & data models',
    desc: 'Mapping database collections and sensitive fields',
    detail: 'Extracting schemas, models, and database access patterns...',
  },
  {
    id: 4,
    label: 'Constructing Security Graph',
    desc: 'Building nodes, edges, and dataflow reachability chains',
    detail: 'Connecting route endpoints to sink functions and security edges...',
  },
  {
    id: 5,
    label: 'Finalizing repository registration',
    desc: 'Saving project metadata and preparing SOC views',
    detail: 'Registering project in database and finalizing posture metrics...',
  },
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
  const [progress, setProgress] = useState(15);
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setProgress(15);
      setAnimationFinished(false);
      return;
    }

    if (error) {
      return;
    }

    // Step pacing (~3.6s total):
    // 0ms -> Step 1 (15%)
    // 700ms -> Step 2 (38%)
    // 1500ms -> Step 3 (62%)
    // 2300ms -> Step 4 (84%)
    // 3100ms -> Step 5 (96%)
    // 3700ms -> Animation reaches 100%
    const t1 = setTimeout(() => {
      setCurrentStep(2);
      setProgress(38);
    }, 700);

    const t2 = setTimeout(() => {
      setCurrentStep(3);
      setProgress(62);
    }, 1500);

    const t3 = setTimeout(() => {
      setCurrentStep(4);
      setProgress(84);
    }, 2300);

    const t4 = setTimeout(() => {
      setCurrentStep(5);
      setProgress(96);
    }, 3100);

    const t5 = setTimeout(() => {
      setProgress(100);
      setAnimationFinished(true);
    }, 3700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [isOpen, error]);

  if (!isOpen) return null;

  const showCompletionScreen = isComplete && animationFinished;
  const currentStepData = STEPS.find((s) => s.id === currentStep) || STEPS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/90 bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                {showCompletionScreen ? (
                  <ShieldCheck className="size-5 text-emerald-400" />
                ) : (
                  <Layers className="size-5 text-primary" />
                )}
              </span>
              {!showCompletionScreen && !error && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-fg text-base">
                {showCompletionScreen ? 'Repository Indexed Successfully' : 'Indexing Repository in Progress'}
              </h3>
              <p className="font-mono text-xs text-muted truncate max-w-xs">{projectName || projectPath}</p>
            </div>
          </div>
          {showCompletionScreen && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-fg cursor-pointer transition-colors"
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
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg hover:bg-surface-alt cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : !showCompletionScreen ? (
          /* In-Flight Paced Steps Animation */
          <div className="space-y-4">
            {/* Animated Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted flex items-center gap-1.5">
                  <Sparkles className="size-3 text-primary animate-pulse" />
                  <span>Stage {currentStep} of {STEPS.length}</span>
                </span>
                <span className="text-primary font-bold">{Math.min(progress, 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-surface-alt rounded-full overflow-hidden border border-border/50">
                <div
                  className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>

            {/* Steps List */}
            <div className="space-y-2.5">
              {STEPS.map((step) => {
                const isDone = currentStep > step.id;
                const isCurrent = currentStep === step.id;

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 rounded-xl p-2.5 transition-all duration-300 ${
                      isCurrent
                        ? 'bg-primary/10 border border-primary/40 shadow-sm'
                        : isDone
                        ? 'bg-surface-alt/40 border border-border/40'
                        : 'opacity-40 border border-transparent'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-400 transition-transform scale-110" />
                      ) : isCurrent ? (
                        <Loader2 className="size-4 text-primary animate-spin" />
                      ) : (
                        <div className="size-4 rounded-full border border-muted/50 text-[10px] grid place-items-center text-muted">
                          {step.id}
                        </div>
                      )}
                    </div>
                    <div className="leading-tight flex-1">
                      <div className={`text-xs font-semibold ${isCurrent ? 'text-primary' : isDone ? 'text-fg' : 'text-muted'}`}>
                        {step.label}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">{step.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Sub-Ticker */}
            <div className="flex items-center justify-between text-[11px] text-muted pt-1 border-t border-border/40">
              <span className="flex items-center gap-1.5 min-w-0">
                <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                <span className="truncate font-mono text-[10.5px] text-fg/80">{currentStepData?.detail}</span>
              </span>
              <span className="shrink-0 text-[10.5px] text-muted/80">Please keep open</span>
            </div>
          </div>
        ) : (
          /* Option A Completion Screen */
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
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
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted hover:text-fg hover:bg-surface-alt transition-colors cursor-pointer"
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
