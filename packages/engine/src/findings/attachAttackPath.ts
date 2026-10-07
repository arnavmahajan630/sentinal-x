import { models } from '../db/collections';
import type { AttackPath, Finding } from './model';

/**
 * Attaches a composed attack path to an existing Finding (C8's Attack-Path agent). The
 * mechanical "may this chain be attached" guard lives in the `attachAttackPath` agent
 * tool (agents/runtime/tools.ts), not here — this function is a pure, trusted write.
 */
export async function attachAttackPath(
  projectId: string,
  findingId: string,
  path: AttackPath,
): Promise<Finding> {
  const doc = await models.findings
    .findOneAndUpdate(
      { projectId, id: findingId },
      { $set: { attackPath: path, updatedAt: new Date().toISOString() } },
      { new: true },
    )
    .lean();
  if (!doc) throw new Error(`Finding "${findingId}" not found`);
  return doc as unknown as Finding;
}
