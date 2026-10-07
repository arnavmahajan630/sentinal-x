import { describe, expect, expectTypeOf, it } from 'vitest';
import { FACT_TOOLS } from '../../src/facts/tools';
import { KNOWLEDGE_TOOLS } from '../../src/knowledge';
import {
  EMIT_TOOL_NAMES,
  buildAgentTools,
  buildSystemPrompt,
  demoAgent,
  renderPlaybook,
} from '../../src/agents';
import type { AgentToolName, FactToolName, KnowledgeToolName } from '../../src/agents';
import { DEFAULT_BUDGET } from '../../src/agents';
import { registry } from './helpers';

describe('agent tool set', () => {
  const tools = buildAgentTools();
  const names = tools.map((t) => t.name as string);

  it('= fact tools + knowledge tools + exactly 6 emit tools; names unique', () => {
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => FACT_TOOLS.some((t) => t.name === n))).toHaveLength(
      FACT_TOOLS.length,
    );
    expect(names.filter((n) => KNOWLEDGE_TOOLS.some((t) => t.name === n))).toHaveLength(
      KNOWLEDGE_TOOLS.length,
    );
    expect(names.filter((n) => (EMIT_TOOL_NAMES as readonly string[]).includes(n))).toEqual([
      ...EMIT_TOOL_NAMES,
    ]);
    expect(names).toHaveLength(FACT_TOOLS.length + KNOWLEDGE_TOOLS.length + EMIT_TOOL_NAMES.length);
  });

  it('agents can propose but never create or confirm findings', () => {
    // getFindings (C8) is a sanctioned read of already-confirmed findings, and
    // attachAttackPath (C8) only attaches a chain narrative to a finding another agent's
    // run already proved CONFIRMED — neither creates or confirms one, so both are excluded
    // from this "no creation/confirmation tool" check rather than making the regex loose.
    const sanctioned = new Set(['getFindings', 'attachAttackPath']);
    expect(
      names.filter((n) => !sanctioned.has(n)).some((n) => /finding|confirm|verified|resolve/i.test(n)),
    ).toBe(false);
    expect(names).toContain('proposeHypothesis');
    expect(names).toContain('requestVerification');
    expect(names).toContain('getFindings');
    expect(names).toContain('attachAttackPath');
  });

  it('literal name types are in sync with the registries (type-level guard)', () => {
    expectTypeOf<AgentToolName>().not.toEqualTypeOf<string>();
    // @ts-expect-error there is no createFinding tool name
    const bad: AgentToolName = 'createFinding';
    void bad;
    const factNames = new Set(FACT_TOOLS.map((t) => t.name));
    const declared: FactToolName[] = [
      'getRoutes',
      'getRoute',
      'getMiddlewareChain',
      'getCallGraph',
      'getDataflow',
      'getModelAccess',
      'getDependency',
      'getSensitiveAssets',
      'getUnprotectedRoutes',
      'getRoutesTouchingModel',
      'getAuthorizationGaps',
      'getJwtUsage',
      'getSecrets',
      'getExposure',
      'getFindings',
      'getAttackPath',
    ];
    expect([...factNames].sort()).toEqual([...declared].sort());
    const kdeclared: KnowledgeToolName[] = [
      'getPlaybook',
      'getPlaybooksForSignals',
      'listPlaybooks',
      'getSignalCatalog',
    ];
    expect(KNOWLEDGE_TOOLS.map((t) => t.name).sort()).toEqual([...kdeclared].sort());
  });

  it('every tool has a description and an object schema the LLM can use', () => {
    for (const t of tools) {
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(typeof t.schema.safeParse, t.name).toBe('function');
    }
  });
});

describe('system prompt', () => {
  const reg = registry();
  it('contains the non-negotiable rules, budget, tool names and injected playbook sections', () => {
    const p = buildSystemPrompt({
      spec: demoAgent,
      goal: 'g',
      playbooks: [reg.getPlaybook('missing-auth'), reg.getPlaybook('authorization')],
      budget: DEFAULT_BUDGET,
      toolNames: ['getRoute', 'finish'],
    });
    expect(p).toContain(demoAgent.systemPrompt.slice(0, 40));
    expect(p).toContain('You cannot confirm vulnerabilities');
    expect(p).toContain('at most 12 turns');
    expect(p).toContain('getRoute, finish');
    expect(p).toContain('Playbook: missing-auth@');
    expect(p).toContain('#### Investigation strategy');
    expect(p).toContain('#### False-positive rules');
    expect(p).not.toContain('#### Remediation guidance'); // not in the default injected sections
    expect(p).toContain('Playbook: authorization@'); // reference: Concepts/Reading the facts/Pitfalls
    expect(p).toContain('#### Reading the facts');
  });

  it('section selection is configurable; no playbook → pointer to the knowledge tools', () => {
    const md = renderPlaybook(reg.getPlaybook('idor'), ['Threat']);
    expect(md).toContain('#### Threat');
    expect(md).not.toContain('#### Investigation strategy');
    expect(
      buildSystemPrompt({
        spec: demoAgent,
        goal: 'g',
        playbooks: [],
        budget: DEFAULT_BUDGET,
        toolNames: [],
      }),
    ).toContain('getPlaybooksForSignals');
  });
});
