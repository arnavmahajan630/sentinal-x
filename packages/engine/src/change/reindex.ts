import { refreshProject } from '../indexer';
import { buildGraph } from '../graph';
import { analyzeImpact } from './impact';
import type { ReindexChangeResult } from './types';

/**
 * Perform incremental re-indexing and graph update for a modified project.
 * Uses C1's hash-diff `refreshProject` (re-extracting only modified files and re-linking)
 * followed by C2's diff-apply `buildGraph` to compute `changedNodeIds`.
 * Then computes graph impact across callers and callees.
 */
export async function reindexChange(
  projectId: string,
  options: { force?: boolean } = {},
): Promise<ReindexChangeResult> {
  const t0 = Date.now();

  // 1. Partial re-index of files
  const idxRes = await refreshProject(projectId, { force: options.force });

  // 2. Diff-apply graph update
  const graphRes = await buildGraph(projectId);

  // 3. Combine changed and linked files
  const allChangedFiles = Array.from(
    new Set([...idxRes.changed, ...idxRes.changedLinked, ...idxRes.removed]),
  ).sort();

  // 4. Compute impact on the graph
  const impact = await analyzeImpact(projectId, allChangedFiles, graphRes.changedNodeIds);

  const durationMs = Date.now() - t0;

  return {
    projectId,
    changedFiles: idxRes.changed,
    changedLinkedFiles: idxRes.changedLinked,
    removedFiles: idxRes.removed,
    changedNodeIds: graphRes.changedNodeIds,
    impact,
    stats: {
      filesIndexed: idxRes.stats.indexed,
      nodesCount: graphRes.nodes,
      edgesCount: graphRes.edges,
      durationMs,
    },
  };
}
