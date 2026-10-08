import path from 'node:path';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { computeGitDiff } from './diff';
import type { FileChangeEvent, FileChangeKind, WatcherOptions } from './types';

const DEFAULT_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/*.log',
  '**/*.tmp',
];

export type ChangeListener = (batch: {
  changedFiles: string[];
  events: FileChangeEvent[];
}) => void | Promise<void>;

/**
 * File watcher on a project root with burst debouncing and git-polling fallback.
 */
export class ProjectWatcher {
  private projectRoot: string;
  private options: Required<WatcherOptions>;
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingEvents: Map<string, FileChangeEvent> = new Map();
  private listeners: ChangeListener[] = [];
  private lastGitHead: string | null = null;
  private lastKnownModified: Set<string> = new Set();
  private isRunning = false;

  constructor(projectRoot: string, options: WatcherOptions = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.options = {
      debounceMs: options.debounceMs ?? 300,
      pollIntervalMs: options.pollIntervalMs ?? 5000,
      ignored: options.ignored ?? DEFAULT_IGNORED,
      usePollingFallback: options.usePollingFallback ?? true,
    };
  }

  /**
   * Register a callback to be notified when a batch of file changes is debounced.
   */
  onChange(listener: ChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Start watching project files.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Record initial git state for fallback polling
    try {
      const initialDiff = await computeGitDiff(this.projectRoot);
      this.lastGitHead = initialDiff.head;
      this.lastKnownModified = new Set(initialDiff.allModified);
    } catch {
      // Ignored if not a git repository
    }

    // 1. Chokidar file watcher
    try {
      this.watcher = watch(this.projectRoot, {
        ignored: this.options.ignored,
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this.watcher.on('add', (filePath: string) => this.recordEvent('add', filePath));
      this.watcher.on('change', (filePath: string) => this.recordEvent('change', filePath));
      this.watcher.on('unlink', (filePath: string) => this.recordEvent('unlink', filePath));
      this.watcher.on('error', () => {
        // Fallback polling will continue to work even if filesystem watcher hits OS error
      });
    } catch {
      // If chokidar fails to initialize on this OS/directory, polling fallback takes over
    }

    // 2. Periodic polling fallback (simple-git diff)
    if (this.options.usePollingFallback) {
      this.pollTimer = setInterval(async () => {
        await this.pollGitState();
      }, this.options.pollIntervalMs);
    }
  }

  /**
   * Stop the watcher and clear all active timers.
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.pendingEvents.clear();
  }

  /**
   * Record a raw file event from chokidar and debounce delivery.
   */
  private recordEvent(kind: FileChangeKind, fullPath: string): void {
    const relPath = path.relative(this.projectRoot, fullPath).replace(/\\/g, '/');
    if (!relPath || relPath.startsWith('..')) return;

    this.pendingEvents.set(relPath, {
      kind,
      path: relPath,
      timestamp: new Date().toISOString(),
    });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushEvents();
    }, this.options.debounceMs);
  }

  /**
   * Flush all buffered change events to subscribers.
   */
  private flushEvents(): void {
    if (this.pendingEvents.size === 0) return;

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();
    const changedFiles = Array.from(new Set(events.map((e) => e.path))).sort();

    for (const listener of this.listeners) {
      try {
        listener({ changedFiles, events });
      } catch {
        // Prevent listener exception from crashing watcher
      }
    }
  }

  /**
   * Fallback check comparing git HEAD and status against previously recorded state.
   */
  private async pollGitState(): Promise<void> {
    try {
      const diff = await computeGitDiff(this.projectRoot, this.lastGitHead);
      const headChanged = diff.head !== this.lastGitHead;
      const currentModified = new Set(diff.allModified);

      // Check if modified files set differs
      let filesDiffer = false;
      if (currentModified.size !== this.lastKnownModified.size) {
        filesDiffer = true;
      } else {
        for (const file of currentModified) {
          if (!this.lastKnownModified.has(file)) {
            filesDiffer = true;
            break;
          }
        }
      }

      if (headChanged || filesDiffer) {
        this.lastGitHead = diff.head;
        this.lastKnownModified = currentModified;

        const filesToNotify = diff.allModified;
        if (filesToNotify.length > 0) {
          const events: FileChangeEvent[] = filesToNotify.map((p) => ({
            kind: diff.addedFiles.includes(p)
              ? 'add'
              : diff.deletedFiles.includes(p)
                ? 'unlink'
                : 'change',
            path: p,
            timestamp: new Date().toISOString(),
          }));

          for (const listener of this.listeners) {
            try {
              listener({ changedFiles: filesToNotify, events });
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      // Ignored
    }
  }
}
