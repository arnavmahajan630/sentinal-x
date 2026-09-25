import { edgeId, nodeId } from './ids';
import type { GraphStore } from './store';
import type {
  Direction,
  Edge,
  EdgeInput,
  EdgeQuery,
  EdgeType,
  GraphModel,
  Node,
  NodeId,
  NodeInput,
  NodeQuery,
} from './types';

const arr = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const getPath = (o: any, path: string): unknown =>
  path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const matchProps = (props: Record<string, any> | undefined, q?: Record<string, unknown>) =>
  Object.entries(q ?? {}).every(([k, v]) => getPath(props ?? {}, k) === v);

/**
 * `GraphStore` over plain memory. Same semantics as `MongoGraphStore` (proved by the shared contract tests):
 * fast, Mongo-free tests and proof that the abstraction is swappable.
 */
export class InMemoryGraphStore implements GraphStore {
  private nodes = new Map<NodeId, Node>();
  private edgeMap = new Map<string, Edge>();

  constructor(
    readonly projectId: string,
    model?: GraphModel,
  ) {
    for (const n of model?.nodes ?? []) this.nodes.set(n.id, { ...n, projectId });
    for (const e of model?.edges ?? []) this.edgeMap.set(e.id, { ...e, projectId });
  }

  async addNode(n: NodeInput): Promise<NodeId> {
    const id = nodeId(n.type, n.key);
    this.nodes.set(id, {
      id,
      projectId: this.projectId,
      type: n.type,
      key: n.key,
      props: n.props ?? {},
      ...(n.loc ? { loc: n.loc } : {}),
    });
    return id;
  }

  async addEdge(e: EdgeInput): Promise<void> {
    const id = edgeId(e.type, e.from, e.to);
    this.edgeMap.set(id, {
      id,
      projectId: this.projectId,
      type: e.type,
      from: e.from,
      to: e.to,
      ...(e.props ? { props: e.props } : {}),
    });
  }

  async node(id: NodeId): Promise<Node | null> {
    return this.nodes.get(id) ?? null;
  }

  async edgesOf(
    id: NodeId,
    opts: { type?: EdgeType | EdgeType[]; dir?: Direction } = {},
  ): Promise<Edge[]> {
    const dir = opts.dir ?? 'out';
    const t = arr(opts.type);
    return [...this.edgeMap.values()]
      .filter((e) => (dir === 'out' ? e.from : e.to) === id && (!t || t.includes(e.type)))
      .sort(byId);
  }

  async edges(q: EdgeQuery): Promise<Edge[]> {
    const t = arr(q.type);
    let out = [...this.edgeMap.values()]
      .filter(
        (e) =>
          (!t || t.includes(e.type)) &&
          (!q.from || e.from === q.from) &&
          (!q.to || e.to === q.to) &&
          matchProps(e.props, q.props),
      )
      .sort(byId);
    if (q.limit) out = out.slice(0, q.limit);
    return out;
  }

  async neighbors(id: NodeId, edgeType?: EdgeType, dir: Direction = 'out'): Promise<Node[]> {
    const es = await this.edgesOf(id, { type: edgeType, dir });
    const ids = [...new Set(es.map((e) => (dir === 'out' ? e.to : e.from)))];
    return ids.map((i) => this.nodes.get(i)).filter((n): n is Node => !!n);
  }

  async find(q: NodeQuery): Promise<Node[]> {
    const t = arr(q.type);
    let out = [...this.nodes.values()]
      .filter(
        (n) =>
          (!t || t.includes(n.type)) &&
          (q.key === undefined || n.key === q.key) &&
          (!q.keyPrefix || n.key.startsWith(q.keyPrefix)) &&
          matchProps(n.props, q.props),
      )
      .sort(byId);
    if (q.limit) out = out.slice(0, q.limit);
    return out;
  }

  async pathDetail(
    from: NodeId,
    to: NodeId,
    edgeTypes?: EdgeType[],
    maxDepth = 8,
  ): Promise<{ nodes: Node[]; edges: Edge[] } | null> {
    if (from === to) {
      const n = this.nodes.get(from);
      return n ? { nodes: [n], edges: [] } : null;
    }
    const prev = new Map<NodeId, Edge>();
    const seen = new Set<NodeId>([from]);
    let frontier: NodeId[] = [from];
    for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
      const fs = new Set(frontier);
      const es = [...this.edgeMap.values()]
        .filter((e) => fs.has(e.from) && (!edgeTypes?.length || edgeTypes.includes(e.type)))
        .sort(byId);
      const next: NodeId[] = [];
      for (const e of es) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        prev.set(e.to, e);
        next.push(e.to);
        if (e.to === to) {
          const edges: Edge[] = [];
          const ids: NodeId[] = [to];
          for (let cur = to; cur !== from;) {
            const pe = prev.get(cur)!;
            edges.unshift(pe);
            ids.unshift(pe.from);
            cur = pe.from;
          }
          const nodes = ids.map((i) => this.nodes.get(i)).filter((n): n is Node => !!n);
          return nodes.length === ids.length ? { nodes, edges } : null;
        }
      }
      frontier = next;
    }
    return null;
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
    const s = new Set(nodeIds);
    for (const [id, e] of this.edgeMap) if (s.has(e.from) || s.has(e.to)) this.edgeMap.delete(id);
    for (const id of s) this.nodes.delete(id);
  }

  async stats() {
    const count = (xs: { type: string }[]) =>
      xs.reduce<Record<string, number>>((a, x) => ((a[x.type] = (a[x.type] ?? 0) + 1), a), {});
    const byNodeType = count([...this.nodes.values()]);
    const byEdgeType = count([...this.edgeMap.values()]);
    return { nodes: this.nodes.size, edges: this.edgeMap.size, byNodeType, byEdgeType };
  }
}
