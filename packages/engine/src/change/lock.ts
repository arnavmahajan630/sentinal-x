import { models } from '../db/collections';

const STALE_LOCK_MS = 10 * 60 * 1000;

/**
 * One active run per project: the scheduler's own watcher loop and manual
 * dashboard/CLI watch-or-assess calls must never process the same project at once.
 * A crashed run never deadlocks the project — locks older than STALE_LOCK_MS are
 * treated as released.
 */
export async function acquireProjectLock(projectId: string, runId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const res = await models.projects.findOneAndUpdate(
    {
      projectId,
      $or: [{ activeRunId: null }, { lockedAt: { $lte: staleBefore } }],
    },
    { $set: { activeRunId: runId, lockedAt: new Date() } },
  );
  return res !== null;
}

export async function releaseProjectLock(projectId: string, runId: string): Promise<void> {
  await models.projects.updateOne(
    { projectId, activeRunId: runId },
    { $set: { activeRunId: null, lockedAt: null } },
  );
}

export async function isProjectLocked(projectId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const doc = await models.projects
    .findOne({ projectId, activeRunId: { $ne: null }, lockedAt: { $gt: staleBefore } })
    .lean();
  return doc !== null;
}

/**
 * Long-lived ownership flag (distinct from the per-run `activeRunId` lock above): set
 * while the scheduler holds a `ProjectWatcher` for this project, so manual dashboard/
 * CLI watch starts can be rejected even between runs, not just mid-run.
 */
export async function setSchedulerOwned(projectId: string, owned: boolean): Promise<void> {
  await models.projects.updateOne({ projectId }, { $set: { schedulerOwned: owned } });
}

export async function isSchedulerOwned(projectId: string): Promise<boolean> {
  const doc = await models.projects.findOne({ projectId, schedulerOwned: true }).lean();
  return doc !== null;
}
