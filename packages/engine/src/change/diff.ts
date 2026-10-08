import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { GitDiffSummary } from './types';

/**
 * Normalizes file paths to posix relative paths
 */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Compute the diff of changed files in a project worktree.
 * If a `baseCommit` (e.g. last-indexed gitHead) is provided, diffs against that commit.
 * Also incorporates uncommitted worktree changes (modified, untracked, deleted) so edits
 * are picked up live before committing.
 */
export async function computeGitDiff(
  projectRoot: string,
  baseCommit?: string | null,
): Promise<GitDiffSummary> {
  const root = path.resolve(projectRoot);

  try {
    const git = simpleGit(root);
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      return {
        changedFiles: [],
        addedFiles: [],
        deletedFiles: [],
        allModified: [],
        head: null,
        baseHead: baseCommit ?? null,
      };
    }

    let head: string | null = null;
    try {
      head = (await git.revparse(['HEAD'])).trim();
    } catch {
      head = null;
    }

    const changed = new Set<string>();
    const added = new Set<string>();
    const deleted = new Set<string>();

    // 1. If baseCommit provided and valid, inspect commit-level diff
    if (baseCommit && head && baseCommit !== head) {
      try {
        const diffSummary = await git.diffSummary([baseCommit, 'HEAD']);
        for (const f of diffSummary.files) {
          const norm = toPosix(f.file);
          if ((f as any).inserted && !(f as any).deleted) {
            added.add(norm);
          } else if ((f as any).deleted && !(f as any).inserted) {
            deleted.add(norm);
          } else {
            changed.add(norm);
          }
        }
      } catch {
        // Fallback if baseCommit is invalid or not in current history
      }
    }

    // 2. Inspect uncommitted working directory changes
    try {
      const status = await git.status();

      // Created / untracked files
      for (const f of status.created) added.add(toPosix(f));
      for (const f of status.not_added) added.add(toPosix(f));

      // Modified files
      for (const f of status.modified) changed.add(toPosix(f));

      // Deleted files
      for (const f of status.deleted) deleted.add(toPosix(f));

      // Renamed files
      for (const f of status.renamed) {
        if (f.from) deleted.add(toPosix(f.from));
        if (f.to) added.add(toPosix(f.to));
      }
    } catch {
      // Ignored if status check fails
    }

    // Ensure mutually exclusive sets: if a file was deleted, don't keep in changed/added
    for (const d of deleted) {
      added.delete(d);
      changed.delete(d);
    }
    // If a file was newly added, remove from changed
    for (const a of added) {
      changed.delete(a);
    }

    const changedFiles = Array.from(changed).sort();
    const addedFiles = Array.from(added).sort();
    const deletedFiles = Array.from(deleted).sort();
    const allModified = Array.from(
      new Set([...changedFiles, ...addedFiles, ...deletedFiles]),
    ).sort();

    return {
      changedFiles,
      addedFiles,
      deletedFiles,
      allModified,
      head,
      baseHead: baseCommit ?? null,
    };
  } catch {
    return {
      changedFiles: [],
      addedFiles: [],
      deletedFiles: [],
      allModified: [],
      head: null,
      baseHead: baseCommit ?? null,
    };
  }
}
