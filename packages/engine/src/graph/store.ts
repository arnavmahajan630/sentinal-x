import type {
  Direction,
  Edge,
  EdgeQuery,
  EdgeType,
  Node,
  NodeId,
  NodeInput,
  NodeQuery,
  EdgeInput,
} from './types';

/**
 * Graph-query abstraction (storage swappable). Bound to ONE project. Consumers (C3+) never touch Mongo.
 * Locked core methods + additive `edgesOf/edges/pathDetail/stats` (edge props carry ops / order / exposure details).
 */
export interface GraphStore {
  readonly projectId: string;
  /** upsert (ids are deterministic: `<Type>:<key>`) */
  addNode(n: NodeInput): Promise<NodeId>;
  addEdge(e: EdgeInput): Promise<void>;
  node(id: NodeId): Promise<Node | null>;
  /** default direction: 'out' */
  neighbors(id: NodeId, edgeType?: EdgeType, dir?: Direction): Promise<Node[]>;
  find(q: NodeQuery): Promise<Node[]>;
  /** directed BFS over the given edge types (default: all), bounded depth; null when unreachable */
  path(from: NodeId, to: NodeId, edgeTypes?: EdgeType[], maxDepth?: number): Promise<Node[] | null>;
  /** removes the nodes and every incident edge */
  removeSubtree(nodeIds: NodeId[]): Promise<void>;

  // additive
  edgesOf(id: NodeId, opts?: { type?: EdgeType | EdgeType[]; dir?: Direction }): Promise<Edge[]>;
  edges(q: EdgeQuery): Promise<Edge[]>;
  pathDetail(
    from: NodeId,
    to: NodeId,
    edgeTypes?: EdgeType[],
    maxDepth?: number,
  ): Promise<{ nodes: Node[]; edges: Edge[] } | null>;
  stats(): Promise<{
    nodes: number;
    edges: number;
    byNodeType: Record<string, number>;
    byEdgeType: Record<string, number>;
  }>;
}
