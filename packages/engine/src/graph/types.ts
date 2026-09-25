import type { Loc } from '../indexer/types';

export const NODE_TYPES = [
  'Project',
  'File',
  'Function',
  'Route',
  'Middleware',
  'Input',
  'Model',
  'Database',
  'Dependency',
  'Secret',
  'ExternalService',
  'Asset',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  'CONTAINS',
  'CALLS',
  'FLOWS_TO',
  'PROTECTED_BY',
  'ACCESSES',
  'DEPENDS_ON',
  'EXPOSES',
  'USES',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/** Deterministic: `"<Type>:<key>"` (see ids.ts). Unique within a project. */
export type NodeId = string;

export interface Node {
  id: NodeId;
  projectId: string;
  type: NodeType;
  key: string;
  props: Record<string, any>;
  loc?: Loc;
}

export interface Edge {
  /** `"<TYPE>|<from>|<to>"` — duplicates between the same pair merge into one edge */
  id: string;
  projectId: string;
  type: EdgeType;
  from: NodeId;
  to: NodeId;
  props?: Record<string, any>;
}

export interface NodeInput {
  type: NodeType;
  key: string;
  props?: Record<string, any>;
  loc?: Loc;
}
export interface EdgeInput {
  type: EdgeType;
  from: NodeId;
  to: NodeId;
  props?: Record<string, any>;
}

export interface NodeQuery {
  type?: NodeType | NodeType[];
  key?: string;
  keyPrefix?: string;
  /** exact match on `props.<path>` (dot paths allowed) */
  props?: Record<string, unknown>;
  limit?: number;
}
export interface EdgeQuery {
  type?: EdgeType | EdgeType[];
  from?: NodeId;
  to?: NodeId;
  props?: Record<string, unknown>;
  limit?: number;
}
export type Direction = 'out' | 'in';

/** Draft produced by the pure model builder (projectId is added when persisting). */
export type NodeDraft = Omit<Node, 'projectId'>;
export type EdgeDraft = Omit<Edge, 'projectId'>;

export interface GraphModel {
  nodes: NodeDraft[];
  edges: EdgeDraft[];
}

// ─── documented prop shapes (props stay `Record<string, any>` for storage/queries) ───
export type Tier = 'credential' | 'financial' | 'pii' | 'pii-broad';
export type AuthEnforcement = 'enforcing' | 'weak' | 'none';
export type MiddlewareKind = 'auth' | 'role' | 'validation' | 'other';

export interface RouteProps {
  method: string;
  path: string;
  fullPath: string;
  file: string;
  handler?: string; // fnId
  mounted: boolean;
  dynamic?: boolean;
  protected: boolean;
  authEnforcement: AuthEnforcement;
  authMiddleware: string[];
  roleGuards: { name: string; args?: string[] }[];
  exposesUserId: boolean;
  exposesSensitive: string[]; // Asset node ids
  inputs: string[]; // canonical, e.g. req.params.id
}
export interface MiddlewareProps {
  name: string;
  external: boolean;
  factory?: string;
  args?: string[];
  kind: MiddlewareKind;
  authLike: boolean;
  enforcing: boolean;
  roleGuard: boolean;
  traits?: Record<string, boolean>;
  fnId?: string;
}
export interface AssetProps {
  model: string;
  field: string;
  tier: Tier;
  weight: number;
  type?: string;
  selectFalse?: boolean;
  ref?: string;
}
