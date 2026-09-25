import type { GraphStore } from '../graph/store';
import type { Edge, EdgeType, Node, NodeId, NodeType } from '../graph/types';
import type { LocDTO } from './types';

/** call depth for authorization evidence (handler + callees) / for data reach (ops, jwt, secrets) */
export const AUTHZ_DEPTH = 2;
export const DATA_DEPTH = 3;

/**
 * In-memory index of one project's graph, loaded ONCE through the GraphStore abstraction
 * (`find({})` + `edges({})`). Graphs are small (hundreds–thousands of nodes) → no N+1 per query, deterministic.
 */
export class Snapshot {
  readonly nodes = new Map<NodeId, Node>();
  private byType = new Map<NodeType, Node[]>();
  private outE = new Map<NodeId, Edge[]>();
  private inE = new Map<NodeId, Edge[]>();
  private children = new Map<string, Node[]>(); // Function nodes by props.parent

  static async load(store: GraphStore): Promise<Snapshot> {
    const s = new Snapshot();
    const [nodes, edges] = await Promise.all([store.find({}), store.edges({})]);
    for (const n of nodes) {
      s.nodes.set(n.id, n);
      s.byType.set(n.type, [...(s.byType.get(n.type) ?? []), n]);
      if (n.type === 'Function' && n.props.parent)
        s.children.set(n.props.parent, [...(s.children.get(n.props.parent) ?? []), n]);
    }
    for (const e of edges) {
      s.outE.set(e.from, [...(s.outE.get(e.from) ?? []), e]);
      s.inE.set(e.to, [...(s.inE.get(e.to) ?? []), e]);
    }
    return s;
  }

  get = (id: NodeId) => this.nodes.get(id);
  ofType = (t: NodeType): Node[] => this.byType.get(t) ?? [];
  out(id: NodeId, type?: EdgeType): Edge[] {
    const es = this.outE.get(id) ?? [];
    return type ? es.filter((e) => e.type === type) : es;
  }
  in(id: NodeId, type?: EdgeType): Edge[] {
    const es = this.inE.get(id) ?? [];
    return type ? es.filter((e) => e.type === type) : es;
  }

  /** file of a Function node (props.file) or of a File node */
  fileOf(n: Node): string | undefined {
    return n.type === 'File' ? n.key : (n.props.file as string | undefined);
  }

  loc(n: Node | undefined, line?: number, col?: number): LocDTO | undefined {
    if (!n) return undefined;
    if (line !== undefined)
      return {
        file: this.fileOf(n) ?? n.loc?.file ?? '',
        line,
        ...(col !== undefined ? { col } : {}),
      };
    if (!n.loc) return undefined;
    return {
      file: n.loc.file,
      line: n.loc.line,
      col: n.loc.col,
      ...(n.loc.endLine ? { endLine: n.loc.endLine } : {}),
    };
  }

  /** fn + nested fns (factory-returned middleware, etc.) */
  subtree(fnNodeId: NodeId): Node[] {
    const root = this.nodes.get(fnNodeId);
    if (!root) return [];
    const out: Node[] = [];
    const walk = (n: Node) => {
      out.push(n);
      for (const c of this.children.get(n.key) ?? []) walk(c);
    };
    walk(root);
    return out;
  }

  /** node + CALLS-callees (Function→Function) up to `depth`; returns Function/File nodes with the depth reached */
  closure(startId: NodeId, depth: number): { node: Node; depth: number }[] {
    const seen = new Map<NodeId, number>();
    let frontier = [startId];
    seen.set(startId, 0);
    for (let d = 1; d <= depth; d++) {
      const next: NodeId[] = [];
      for (const id of frontier) {
        for (const e of this.out(id, 'CALLS')) {
          if (!e.to.startsWith('Function:') || seen.has(e.to)) continue;
          seen.set(e.to, d);
          next.push(e.to);
        }
      }
      frontier = next;
    }
    return [...seen]
      .map(([id, d]) => ({ node: this.nodes.get(id)!, depth: d }))
      .filter((x) => x.node);
  }

  /** Routes whose handler closure (depth) contains this Function, via reverse CALLS */
  routesReaching(fnNodeId: NodeId, depth = 5): Node[] {
    const routes = new Map<NodeId, Node>();
    const seen = new Set<NodeId>([fnNodeId]);
    let frontier = [fnNodeId];
    for (let d = 0; d <= depth && frontier.length; d++) {
      const next: NodeId[] = [];
      for (const id of frontier) {
        for (const e of this.in(id, 'CALLS')) {
          const from = this.nodes.get(e.from);
          if (!from || seen.has(from.id)) continue;
          seen.add(from.id);
          if (from.type === 'Route') routes.set(from.id, from);
          else if (from.type === 'Function') next.push(from.id);
        }
      }
      frontier = next;
    }
    return [...routes.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}
