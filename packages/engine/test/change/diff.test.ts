import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { computeGitDiff } from '../../src/change/diff';

describe('computeGitDiff', () => {
  it('returns empty diff for a non-git directory without throwing', async () => {
    const nonGitPath = path.resolve('packages/engine/test/fixtures/vuln-mern');
    const diff = await computeGitDiff(nonGitPath);

    expect(diff.head).toBeNull();
    expect(diff.changedFiles).toEqual([]);
    expect(diff.addedFiles).toEqual([]);
    expect(diff.deletedFiles).toEqual([]);
  });

  it('computes git diff for current repository worktree', async () => {
    const root = path.resolve('.');
    const diff = await computeGitDiff(root);

    expect(diff.head).toBeDefined();
    expect(typeof diff.head).toBe('string');
    expect(Array.isArray(diff.allModified)).toBe(true);
    expect(Array.isArray(diff.changedFiles)).toBe(true);
  });
});
