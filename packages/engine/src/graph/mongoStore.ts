import { models } from '../db/collections';
import { edgeId, nodeId } from './ids';
import type { GraphStore } from './store';
import type {
  Direction,
  Edge,
  EdgeInput,
  EdgeQuery,
  EdgeType,
  Node,
  NodeId,
  NodeInput,
  NodeQuery,
} from './types';
import { hashOf } from './util';

const arr = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

export function toNode(d: any): Node {
  return {
    id: d.id,
    projectId: d.projectId,
    type: d.type,
    key: d.key,
    props: d.props ?? {},
    ...(d.loc ? { loc: d.loc } : {}),
  };
}
export function toEdge(d: any): Edge {
  return {
    id: d.id,
    projectId: d.projectId,
    type: d.type,
    from: d.from,
    to: d.to,
    ...(d.props ? { props: d.props } : {}),
  };
}

export class MongoGraphStore implements GraphStore {
  private N = models.graph_nodes;
  private E = models.graph_edges;
  constructor(readonly projectId: string) {}

  async addNode(n: NodeInput): Promise<NodeId> {
    const id = nodeId(n.type, n.key);
    const doc = {
      projectId: this.projectId,
      id,
      type: n.type,
      key: n.key,
      props: n.props ?? {},
      ...(n.loc ? { loc: n.loc } : {}),
    };
    await this.N.updateOne(
      { projectId: this.projectId, id },
      {
        $set: {
          ...doc,
          hash: hashOf({ type: n.type, key: n.key, props: n.props ?? {}, loc: n.loc }),
        },
      },
      { upsert: true },
    );
    return id;
  }

  async addEdge(e: EdgeInput): Promise<void> {
    const id = edgeId(e.type, e.from, e.to);
    await this.E.updateOne(
      { projectId: this.projectId, id },
      {
        $set: {
          projectId: this.projectId,
          id,
          type: e.type,
          from: e.from,
          to: e.to,
          ...(e.props ? { props: e.props } : {}),
          hash: hashOf({ type: e.type, from: e.from, to: e.to, props: e.props }),
        },
      },
      { upsert: true },
    );
  }

  async node(id: NodeId): Promise<Node | null> {
    const d = await this.N.findOne({ projectId: this.projectId, id }).lean();
    return d ? toNode(d) : null;
  }

  private async nodesByIds(ids: NodeId[]): Promise<Map<NodeId, Node>> {
    if (!ids.length) return new Map();
    const docs = await this.N.find({ projectId: this.projectId, id: { $in: ids } }).lean();
    return new Map(docs.map((d: any) => [d.id, toNode(d)]));
  }

  async edgesOf(
    id: NodeId,
    opts: { type?: EdgeType | EdgeType[]; dir?: Direction } = {},
  ): Promise<Edge[]> {
    const dir = opts.dir ?? 'out';
    const q: Record<string, any> = {
      projectId: this.projectId,
      [dir === 'out' ? 'from' : 'to']: id,
    };
    const t = arr(opts.type);
    if (t) q.type = { $in: t };
    return (await this.E.find(q).sort({ id: 1 }).lean()).map(toEdge);
  }

  async edges(q: EdgeQuery): Promise<Edge[]> {
    const f: Record<string, any> = { projectId: this.projectId };
    const t = arr(q.type);
    if (t) f.type = { $in: t };
    if (q.from) f.from = q.from;
    if (q.to) f.to = q.to;
    for (const [k, v] of Object.entries(q.props ?? {})) f[`props.${k}`] = v;
    let cur = this.E.find(f).sort({ id: 1 });
    if (q.limit) cur = cur.limit(q.limit);
    return (await cur.lean()).map(toEdge);
  }

  async neighbors(id: NodeId, edgeType?: EdgeType, dir: Direction = 'out'): Promise<Node[]> {
    const es = await this.edgesOf(id, { type: edgeType, dir });
    const ids = [...new Set(es.map((e) => (dir === 'out' ? e.to : e.from)))];
    const byId = await this.nodesByIds(ids);
    return ids.map((i) => byId.get(i)).filter((n): n is Node => !!n);
  }

  async find(q: NodeQuery): Promise<Node[]> {
    const f: Record<string, any> = { projectId: this.projectId };
    const t = arr(q.type);
    if (t) f.type = { $in: t };
    if (q.key !== undefined) f.key = q.key;
    if (q.keyPrefix) f.key = { $regex: `^${q.keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
    for (const [k, v] of Object.entries(q.props ?? {})) f[`props.${k}`] = v;
    let cur = this.N.find(f).sort({ id: 1 });
    if (q.limit) cur = cur.limit(q.limit);
    return (await cur.lean()).map(toNode);
  }

  async pathDetail(
    from: NodeId,
    to: NodeId,
    edgeTypes?: EdgeType[],
    maxDepth = 8,
  ): Promise<{ nodes: Node[]; edges: Edge[] } | null> {
    if (from === to) {
      const n = await this.node(from);
      return n ? { nodes: [n], edges: [] } : null;
    }
    const prev = new Map<NodeId, Edge>(); // node → edge used to reach it
    const seen = new Set<NodeId>([from]);
    let frontier: NodeId[] = [from];
    for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
      const q: Record<string, any> = { projectId: this.projectId, from: { $in: frontier } };
      if (edgeTypes?.length) q.type = { $in: edgeTypes };
      const es = (await this.E.find(q).sort({ id: 1 }).lean()).map(toEdge);
      const next: NodeId[] = [];
      for (const e of es) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        prev.set(e.to, e);
        next.push(e.to);
        if (e.to === to) return this.materialize(from, to, prev);
      }
      frontier = next;
    }
    return null;
  }

  private async materialize(from: NodeId, to: NodeId, prev: Map<NodeId, Edge>) {
    const edges: Edge[] = [];
    const ids: NodeId[] = [to];
    for (let cur = to; cur !== from;) {
      const e = prev.get(cur)!;
      edges.unshift(e);
      ids.unshift(e.from);
      cur = e.from;
    }
    const byId = await this.nodesByIds(ids);
    const nodes = ids.map((i) => byId.get(i)).filter((n): n is Node => !!n);
    return nodes.length === ids.length ? { nodes, edges } : null;
  }

  async path(
    from: NodeId,
    to: NodeId,
    edgeTypes?: EdgeType[],
    maxDepth = 8,
  ): Promise<Node[] | null> {
    return (await this.pathDetail(from, to, edgeTypes, maxDepth))?.nodes ?? null;
  }

  async removeSubtree(nodeIds: NodeId[]): Promise<void> {
    if (!nodeIds.length) return;
    await this.E.deleteMany({
      projectId: this.projectId,
      $or: [{ from: { $in: nodeIds } }, { to: { $in: nodeIds } }],
    });
    await this.N.deleteMany({ projectId: this.projectId, id: { $in: nodeIds } });
  }

  async stats() {
    const [nodes, edges] = await Promise.all([
      this.N.aggregate([
        { $match: { projectId: this.projectId } },
        { $group: { _id: '$type', n: { $sum: 1 } } },
      ]),
      this.E.aggregate([
        { $match: { projectId: this.projectId } },
        { $group: { _id: '$type', n: { $sum: 1 } } },
      ]),
    ]);
    const toMap = (rows: any[]) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const byNodeType = toMap(nodes);
    const byEdgeType = toMap(edges);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    return { nodes: sum(byNodeType), edges: sum(byEdgeType), byNodeType, byEdgeType };
  }
}
