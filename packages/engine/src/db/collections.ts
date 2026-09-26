import mongoose, { Schema } from 'mongoose';
import type { Model, SchemaDefinition } from 'mongoose';

/**
 * All collections are registered here (empty is fine) so indexes exist before data does.
 * Schemas are intentionally loose (`strict:false`): later phases own their document shapes and
 * tighten them; C0 only fixes names, project scoping and the hot-path indexes.
 */
type IndexSpec = Record<string, 1 | -1>;

function define(
  name: string,
  fields: SchemaDefinition,
  indexes: IndexSpec[] = [],
  unique: IndexSpec[] = [],
): Model<any> {
  const schema = new Schema(fields, { strict: false, timestamps: true, collection: name });
  for (const idx of indexes) schema.index(idx);
  for (const idx of unique) schema.index(idx, { unique: true });
  return mongoose.models[name] ?? mongoose.model(name, schema);
}

const projectScoped = { projectId: { type: String, index: false, required: true } };
const runScoped = { runId: { type: String, required: true } };

export const models = {
  projects: define(
    'projects',
    { projectId: String, path: String, gitHead: String, status: String },
    [],
    [{ projectId: 1 }],
  ),
  files: define('files', { ...projectScoped, path: String }, [], [{ projectId: 1, path: 1 }]),
  graph_nodes: define(
    'graph_nodes',
    {
      ...projectScoped,
      id: { type: String, required: true },
      type: String,
      key: String,
      hash: String,
      props: Schema.Types.Mixed,
      loc: Schema.Types.Mixed,
    },
    [{ projectId: 1, type: 1 }],
    [{ projectId: 1, id: 1 }],
  ),
  graph_edges: define(
    'graph_edges',
    {
      ...projectScoped,
      id: { type: String, required: true },
      type: String,
      from: String,
      to: String,
      hash: String,
      props: Schema.Types.Mixed,
    },
    [
      { projectId: 1, type: 1, from: 1 },
      { projectId: 1, to: 1, type: 1 },
    ],
    [{ projectId: 1, id: 1 }],
  ),
  agent_runs: define('agent_runs', { ...projectScoped, status: String }),
  agent_steps: define('agent_steps', { ...runScoped, ts: Date, seq: Number }, [
    { runId: 1, ts: 1 },
  ]),
  tool_calls: define('tool_calls', { ...runScoped }, [{ runId: 1 }]),
  observations: define('observations', { ...projectScoped, runId: String }),
  hypotheses: define('hypotheses', { ...projectScoped, runId: String }),
  verification_runs: define('verification_runs', { ...projectScoped }),
  findings: define('findings', { ...projectScoped, status: String }, [{ projectId: 1, status: 1 }]),
  security_events: define('security_events', { ...projectScoped, ts: Date }, [
    { projectId: 1, ts: -1 },
  ]),
  change_sets: define('change_sets', { ...projectScoped }),
  security_knowledge: define(
    'security_knowledge',
    { type: { type: String, required: true } },
    [],
    [{ type: 1 }],
  ),
} as const;

export const COLLECTION_NAMES = Object.keys(models) as (keyof typeof models)[];

/** Create every collection + index. Idempotent; call once after connect. */
export async function initCollections(): Promise<void> {
  await Promise.all(Object.values(models).map((m) => m.createCollection().catch(() => undefined)));
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));
}
