import type { Finding } from '../findings/model';
import type { VerificationRun } from '../verification/engine';

export type FileChangeKind = 'add' | 'change' | 'unlink';

export interface FileChangeEvent {
  kind: FileChangeKind;
  /** Relative posix path from project root */
  path: string;
  timestamp: string;
}

export interface WatcherOptions {
  /** Debounce interval in ms for batching rapid filesystem events (default: 300) */
  debounceMs?: number;
  /** Polling interval in ms for git/filesystem polling fallback (default: 5000) */
  pollIntervalMs?: number;
  /** Ignore patterns for paths to exclude */
  ignored?: (string | RegExp)[];
  /** Whether to enable git/timestamp polling fallback (default: true) */
  usePollingFallback?: boolean;
}

export interface GitDiffSummary {
  changedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  allModified: string[];
  head: string | null;
  baseHead: string | null;
}

export interface ImpactAnalysisResult {
  changedFiles: string[];
  directlyAffectedNodeIds: string[];
  callerCalleeNodeIds: string[];
  allAffectedNodeIds: string[];
  affectedNodeTypes: string[];
  impactedRoutes: string[];
}

export interface FindingTransition {
  findingId: string;
  type: string;
  fromStatus: 'open' | 'resolved' | 'regressed' | 'rejected';
  toStatus: 'open' | 'resolved' | 'regressed' | 'rejected';
  reason: string;
  verificationRunId?: string;
  verificationResult?: 'CONFIRMED' | 'REJECTED' | 'INCONCLUSIVE';
  evidence?: unknown;
  timestamp: string;
}

export interface ChangeSetRecord {
  id: string;
  projectId: string;
  gitHead?: string | null;
  changedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  changedNodeIds: string[];
  affectedNodeTypes: string[];
  impactedRoutes: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reindexStats?: {
    filesIndexed: number;
    nodesChanged: number;
    edgesChanged: number;
    durationMs: number;
  };
  transitions: FindingTransition[];
  assessmentId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReindexChangeResult {
  projectId: string;
  changedFiles: string[];
  changedLinkedFiles: string[];
  removedFiles: string[];
  changedNodeIds: string[];
  impact: ImpactAnalysisResult;
  stats: {
    filesIndexed: number;
    nodesCount: number;
    edgesCount: number;
    durationMs: number;
  };
}

export interface ProcessChangeOptions {
  /** Override the list of changed files (skips git diff if provided) */
  changedFiles?: string[];
  /** Whether to run relevant specialist agents (default: true) */
  runAgents?: boolean;
  /** Whether to execute sandbox verifications (default: depends on config) */
  enableVerification?: boolean;
  /** Custom verifier for testing / mocking verification outcomes */
  verifier?: (finding: Finding) => Promise<VerificationRun>;
  /** Optional cancellation signal */
  signal?: AbortSignal;
}
