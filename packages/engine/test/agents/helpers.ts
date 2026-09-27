import { EventBus } from '../../src/bus';
import type { BusMessage } from '../../src/bus';
import { KnowledgeRegistry } from '../../src/knowledge';
import { MemoryRunStore, runAgent } from '../../src/agents';
import type { AgentSpec, RunAgentOptions } from '../../src/agents';
import type { LlmMessage } from '../../src/llm/types';
import { fixtureEngine } from '../facts/helpers';
import { PLAYBOOKS_DIR } from '../knowledge/helpers';

export const registry = () => KnowledgeRegistry.fromDir(PLAYBOOKS_DIR);

export const testAgent: AgentSpec = {
  name: 'auth',
  systemPrompt: 'You are a test auth analyst.',
  playbooks: ['idor', 'missing-auth'],
  hypothesisTypes: ['idor', 'missing-auth', 'jwt-security', 'mass-assignment'],
  investigationTargets: ['dataflow'],
};

/** parse the JSON of the last tool message (`{call, ok, data|error}`) */
export function lastTool(messages: LlmMessage[]): any {
  const m = [...messages].reverse().find((x) => x.role === 'tool');
  return m ? JSON.parse(m.content) : undefined;
}

export async function harness(over: Partial<RunAgentOptions> = {}) {
  const { engine } = await fixtureEngine();
  const store = new MemoryRunStore();
  const bus = new EventBus();
  const agentMsgs: BusMessage[] = [];
  const globalMsgs: BusMessage[] = [];
  bus.subscribe('events', (m) => globalMsgs.push(m));
  const run = (opts: Partial<RunAgentOptions> & Pick<RunAgentOptions, 'provider'>) => {
    // subscribe to the agent channel lazily once we know the runId (steps are also in the store)
    return runAgent({
      projectId: 'fixture',
      agent: testAgent,
      goal: 'test goal',
      engine,
      registry: registry(),
      store,
      bus,
      retryDelaysMs: [0, 0],
      ...over,
      ...opts,
    });
  };
  return { engine, store, bus, agentMsgs, globalMsgs, run };
}
