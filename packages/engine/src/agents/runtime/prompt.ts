import type { Playbook } from '../../knowledge/types';
import { DEFAULT_SECTIONS } from './types';
import type { AgentSpec, Budget } from './types';
import type { SectionName } from '../../knowledge/types';

const RULES = `Rules (non-negotiable):
1. Ground everything in facts. Call the fact tools before claiming anything; never invent routes, functions, fields or evidence.
2. Every tool result carries a call number ("call": N). To propose a hypothesis you must cite the call numbers of the successful fact-tool results that support it (evidence).
3. You cannot confirm vulnerabilities. You may only record observations, propose hypotheses (proposeHypothesis), and request verification (requestVerification); a separate Verification Engine proves them.
4. Follow the playbook's investigation steps and RESPECT its false-positive rules: if a route has a blocking authorization check, or is public by design, do not propose; record a "safe" observation explaining why.
5. Prefer few, well-supported hypotheses over many weak ones. Rejected proposals come back with the reason: read it and correct or drop the idea.
6. You must call a tool on every turn. When you are done (or have nothing more to check), call finish.`;

export function renderPlaybook(p: Playbook, sections: SectionName[]): string {
  const body = sections
    .filter((s) => p.sections[s])
    .map((s) => `#### ${s}\n${p.sections[s]}`)
    .join('\n\n');
  return `### Playbook: ${p.type}@${p.version} — ${p.title}\n${p.summary}\nTools this playbook uses, in order: ${p.factQueries.join(', ') || '(reference)'}\n\n${body}`;
}

export function buildSystemPrompt(input: {
  spec: AgentSpec;
  goal: string;
  playbooks: Playbook[];
  budget: Budget;
  toolNames: string[];
}): string {
  const sections = input.spec.sections ?? DEFAULT_SECTIONS;
  const pbs = input.playbooks.length
    ? input.playbooks
        .map((p) =>
          renderPlaybook(
            p,
            p.kind === 'reference'
              ? (['Concepts', 'Reading the facts', 'Pitfalls'] as SectionName[])
              : sections,
          ),
        )
        .join('\n\n')
    : '(no playbook injected; use getPlaybooksForSignals / getPlaybook if you need one)';
  return [
    input.spec.systemPrompt.trim(),
    RULES,
    `Budget: at most ${input.budget.maxSteps} turns and ${input.budget.maxToolCalls} tool calls. Plan briefly on your first turn, then act. Available tools: ${input.toolNames.join(', ')}.`,
    `## Playbooks\n${pbs}`,
  ].join('\n\n');
}

export const initialUserMessage = (goal: string, context?: string) =>
  `Goal: ${goal}${context ? `\n\nContext:\n${context}` : ''}\n\nStart by querying the facts you need.`;

export const nudgeMessage = (n: number) =>
  `You did not call a tool. ${n >= 2 ? 'Last reminder: ' : ''}Call a fact tool to gather evidence, or call finish if you are done.`;
export const budgetWarning = (left: number) =>
  `Budget warning: ${left} step(s) left. Propose any grounded hypotheses now (or record observations) and call finish.`;
