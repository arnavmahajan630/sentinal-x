import type { NodeId, NodeType } from './types';

export const nodeId = (type: NodeType, key: string): NodeId => `${type}:${key}`;
export const edgeId = (type: string, from: NodeId, to: NodeId): string => `${type}|${from}|${to}`;

export const projectNodeId = (projectId: string) => nodeId('Project', projectId);
export const fileNodeId = (path: string) => nodeId('File', path);
export const functionNodeId = (fnId: string) => nodeId('Function', fnId);
export const routeNodeId = (routeId: string) => nodeId('Route', routeId);
export const inputNodeId = (inputId: string) => nodeId('Input', inputId);
export const modelNodeId = (name: string) => nodeId('Model', name);
export const assetNodeId = (model: string, field: string) => nodeId('Asset', `${model}.${field}`);
export const databaseNodeId = (engine = 'mongodb') => nodeId('Database', engine);
export const dependencyNodeId = (pkg: string) => nodeId('Dependency', pkg);
export const envSecretNodeId = (name: string) => nodeId('Secret', `env:${name}`);
export const hardcodedSecretNodeId = (file: string, line: number) =>
  nodeId('Secret', `hardcoded:${file}:${line}`);
export const serviceNodeId = (name: string) => nodeId('ExternalService', name);
export const middlewareNodeId = (key: string) => nodeId('Middleware', key);

export function parseNodeId(id: NodeId): { type: NodeType; key: string } {
  const i = id.indexOf(':');
  return { type: id.slice(0, i) as NodeType, key: id.slice(i + 1) };
}
