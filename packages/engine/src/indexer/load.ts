import { models } from '../db/collections';
import type { FileIR, FileKind, FileStatus, LinkedFile, LinkedRoute } from './types';

export interface FileRow {
  path: string;
  kind: FileKind;
  status: FileStatus;
  ir: FileIR | null;
  linked: LinkedFile | null;
}
export interface ProjectIR {
  project: Record<string, any>;
  files: FileRow[];
  /** every linked route across the project (C2 builds Route nodes from this) */
  routes: LinkedRoute[];
}

/** C1 → C2 contract: everything the graph builder needs, from Mongo. */
export async function loadProjectIR(projectId: string): Promise<ProjectIR> {
  const project = await models.projects.findOne({ projectId }).lean();
  if (!project) throw new Error(`Unknown project ${projectId}`);
  const docs = await models.files.find({ projectId }).sort({ path: 1 }).lean();
  const files: FileRow[] = docs.map((d: any) => ({
    path: d.path,
    kind: d.kind,
    status: d.status,
    ir: d.ir ?? null,
    linked: d.linked ?? null,
  }));
  const routes = files.flatMap((f) => f.linked?.routes ?? []);
  return { project, files, routes };
}
