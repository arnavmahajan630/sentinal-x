import { bus, EVENTS_CHANNEL } from '../bus';
import { models } from '../db/collections';
import { loadProjectIR } from '../indexer/load';
import { buildGraphModel } from './model';
import type { GraphModel, NodeId } from './types';
import { hashOf } from './util';

export interface Delta {
  nodes: number;
  edges: number;
}
export interface BuildGraphResult {
  projectId: string;
  nodes: number;
  edges: number;
  added: Delta;
  changed: Delta;
  removed: Delta;
  /** nodes added/changed/removed + surviving endpoints of changed edges — the C10 "stale set" */
  changedNodeIds: NodeId[];
  durationMs: number;
}

const CHUNK = 1000;
const chunks = <T>(a: T[], n = CHUNK): T[][] =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

const nodeHash = (n: GraphModel['nodes'][number]) =>
  hashOf({ type: n.type, key: n.key, props: n.props, loc: n.loc });
const edgeHash = (e: GraphModel['edges'][number]) =>
  hashOf({ type: e.type, from: e.from, to: e.to, props: e.props });

/**
 * Apply a desired graph to storage as a delta (upsert changed/new, delete removed).
 * Same path for the first build and every later patch → ids stay stable, no dangling edges.
 */
export async function applyGraphModel(
  projectId: string,
  model: GraphModel,
): Promise<Omit<BuildGraphResult, 'durationMs' | 'projectId'>> {
  const N = models.graph_nodes;
  const E = models.graph_edges;
  const [oldNodes, oldEdges] = await Promise.all([
    N.find({ projectId }, { id: 1, hash: 1, _id: 0 }).lean<{ id: string; hash?: string }[]>(),
    E.find({ projectId }, { id: 1, hash: 1, from: 1, to: 1, _id: 0 }).lean<
      { id: string; hash?: string; from: string; to: string }[]
    >(),
  ]);
  const oldN = new Map(oldNodes.map((d) => [d.id, d.hash]));
  const oldE = new Map(oldEdges.map((d) => [d.id, d]));

  const newNodeIds = new Set(model.nodes.map((n) => n.id));
  const addedN: string[] = [];
  const changedN: string[] = [];
  const nodeOps: any[] = [];
  for (const n of model.nodes) {
    const h = nodeHash(n);
    const prev = oldN.get(n.id);
    if (prev === h) continue;
    (prev === undefined ? addedN : changedN).push(n.id);
    nodeOps.push({
      updateOne: {
        filter: { projectId, id: n.id },
        update: {
          $set: {
            projectId,
            id: n.id,
            type: n.type,
            key: n.key,
            props: n.props,
            loc: n.loc ?? null,
            hash: h,
          },
        },
        upsert: true,
      },
    });
  }
  const removedN = [...oldN.keys()].filter((id) => !newNodeIds.has(id));

  const newEdgeIds = new Set(model.edges.map((e) => e.id));
  const addedE: string[] = [];
  const changedE: { from: string; to: string }[] = [];
  const edgeOps: any[] = [];
  for (const e of model.edges) {
    const h = edgeHash(e);
    const prev = oldE.get(e.id);
    if (prev?.hash === h) continue;
    if (!prev) addedE.push(e.id);
    changedE.push({ from: e.from, to: e.to });
    edgeOps.push({
      updateOne: {
        filter: { projectId, id: e.id },
        update: {
          $set: {
            projectId,
            id: e.id,
            type: e.type,
            from: e.from,
            to: e.to,
            props: e.props ?? null,
            hash: h,
          },
        },
        upsert: true,
      },
    });
  }
  const removedE = [...oldE.values()].filter((d) => !newEdgeIds.has(d.id));

  // edges first when removing (never leave an edge whose node is gone), nodes first when adding
  for (const c of chunks(removedE.map((d) => d.id)))
    await E.deleteMany({ projectId, id: { $in: c } });
  for (const c of chunks(nodeOps)) await N.bulkWrite(c, { ordered: false });
  for (const c of chunks(edgeOps)) await E.bulkWrite(c, { ordered: false });
  for (const c of chunks(removedN)) await N.deleteMany({ projectId, id: { $in: c } });

  const touched = new Set<string>([...addedN, ...changedN, ...removedN]);
  for (const e of changedE) {
    touched.add(e.from);
    touched.add(e.to);
  }
  for (const e of removedE) {
    touched.add(e.from);
    touched.add(e.to);
  }
  const changedNodeIds = [...touched]
    .filter((id) => newNodeIds.has(id) || removedN.includes(id))
    .sort();

  return {
    nodes: model.nodes.length,
    edges: model.edges.length,
    added: { nodes: addedN.length, edges: addedE.length },
    changed: { nodes: changedN.length, edges: changedE.length - addedE.length },
    removed: { nodes: removedN.length, edges: removedE.length },
    changedNodeIds,
  };
}

/** Build (or incrementally update) the security graph for an indexed project. */
export async function buildGraph(projectId: string): Promise<BuildGraphResult> {
  const t0 = Date.now();
  const pir = await loadProjectIR(projectId);
  const p = pir.project as any;
  const model = buildGraphModel({
    projectId,
    project: {
      name: p.name,
      path: p.path,
      gitHead: p.gitHead ?? null,
      gitBranch: p.gitBranch ?? null,
      stats: p.stats,
    },
    files: pir.files,
  });
  const res = await applyGraphModel(projectId, model);
  const durationMs = Date.now() - t0;
  await models.projects.updateOne(
    { projectId },
    { $set: { graph: { builtAt: new Date(), nodes: res.nodes, edges: res.edges } } },
  );
  const summary = `graph built: ${res.nodes} nodes, ${res.edges} edges (+${res.added.nodes}/~${res.changed.nodes}/-${res.removed.nodes} nodes)`;
  await models.security_events.create({
    projectId,
    ts: new Date(),
    type: 'graph.built',
    summary,
    nodes: res.nodes,
    edges: res.edges,
    added: res.added,
    changed: res.changed,
    removed: res.removed,
  });
  bus.publish(EVENTS_CHANNEL, {
    kind: 'graph.built',
    projectId,
    summary,
    nodes: res.nodes,
    edges: res.edges,
  });
  return { projectId, ...res, durationMs };
}
