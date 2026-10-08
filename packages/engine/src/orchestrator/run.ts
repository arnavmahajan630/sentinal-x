import type { AgentName } from '../agents/runtime/types';
import { getRelevantAgents } from './relevance';
import { Supervisor } from './supervisor';
import type {
  AssessmentOptions,
  AssessmentResult,
  ChangeSetInput,
} from './types';

/**
 * Run a full security assessment across all specialist agents,
 * execute sandbox verifications, mint confirmed findings, and
 * compose attack paths.
 */
export async function runAssessment(
  projectId: string,
  options: Partial<AssessmentOptions> = {},
): Promise<AssessmentResult> {
  const supervisor = new Supervisor();
  return supervisor.execute(
    projectId,
    'full',
    ['auth', 'dataflow', 'attack-path'],
    options,
  );
}

/**
 * Run a single specialist agent on demand (e.g. from the dashboard or CLI),
 * drain any verification requests it produces, and return the result.
 */
export async function runAgentOnDemand(
  projectId: string,
  agentName: AgentName,
  options: Partial<AssessmentOptions> & { goal?: string } = {},
): Promise<AssessmentResult> {
  const supervisor = new Supervisor();
  const goals = options.goal
    ? { ...options.goals, [agentName]: options.goal }
    : options.goals;
  return supervisor.execute(
    projectId,
    'agent',
    [agentName],
    { ...options, goals },
  );
}

/**
 * Event-triggered re-analysis: selects only the agents relevant to
 * the modified files and graph node types.
 */
export async function onChange(
  projectId: string,
  changeSet: ChangeSetInput,
  options: Partial<AssessmentOptions> = {},
): Promise<AssessmentResult> {
  const relevantAgents = getRelevantAgents(changeSet);
  const supervisor = new Supervisor();
  return supervisor.execute(
    projectId,
    'change',
    relevantAgents,
    options,
  );
}
