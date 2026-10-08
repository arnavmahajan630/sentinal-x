import type { AgentName } from '../agents/runtime/types';
import type { ChangeSetInput } from './types';

const AUTH_FILE_PATTERNS = [
  'route',
  'auth',
  'middleware',
  'jwt',
  'token',
  'session',
  'permission',
  'role',
  'guard',
  'access',
];

const DATAFLOW_FILE_PATTERNS = [
  'model',
  'schema',
  'db',
  'database',
  'query',
  'mongo',
  'input',
  'dto',
  'secret',
  'param',
];

/**
 * Determine which specialist detection agents are relevant for a given set of changed files / graph nodes.
 * Used by `onChange` during targeted re-analysis.
 */
export function getRelevantAgents(changeSet: ChangeSetInput): AgentName[] {
  const agents = new Set<AgentName>();
  const types = new Set((changeSet.affectedNodeTypes ?? []).map((t) => t.toLowerCase()));
  const files = changeSet.changedFiles.map((f) => f.toLowerCase());
  const nodeIds = (changeSet.changedNodeIds ?? []).map((id) => id.toLowerCase());

  // 1. Auth agent relevance
  const touchesAuthTypes = types.has('route') || types.has('middleware');
  const touchesAuthFiles = files.some((f) => AUTH_FILE_PATTERNS.some((pat) => f.includes(pat)));
  const touchesAuthNodes = nodeIds.some((id) => id.startsWith('route:') || id.startsWith('middleware:'));

  if (touchesAuthTypes || touchesAuthFiles || touchesAuthNodes) {
    agents.add('auth');
  }

  // 2. Dataflow agent relevance
  const touchesDataflowTypes =
    types.has('model') ||
    types.has('input') ||
    types.has('database') ||
    types.has('secret') ||
    types.has('asset');
  const touchesDataflowFiles = files.some((f) => DATAFLOW_FILE_PATTERNS.some((pat) => f.includes(pat)));
  const touchesDataflowNodes = nodeIds.some(
    (id) =>
      id.startsWith('model:') ||
      id.startsWith('input:') ||
      id.startsWith('database:') ||
      id.startsWith('secret:') ||
      id.startsWith('asset:'),
  );

  if (touchesDataflowTypes || touchesDataflowFiles || touchesDataflowNodes) {
    agents.add('dataflow');
  }

  // Fallback: If no specific heuristics match (e.g. unknown helper or wide refactor), run both
  if (agents.size === 0) {
    agents.add('auth');
    agents.add('dataflow');
  }

  return Array.from(agents);
}

/**
 * Check whether the attack-path agent should run after detection/verification.
 * The attack-path agent is only meaningful if there are open confirmed findings to compose.
 */
export function shouldRunAttackPath(openConfirmedFindingsCount: number): boolean {
  return openConfirmedFindingsCount > 0;
}
