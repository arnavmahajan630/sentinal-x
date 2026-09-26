import { z } from 'zod';
import { runTool, toLlmToolList } from '../tools/registry';
import type { ToolDef, ToolResult } from '../tools/registry';
import type { LlmTool } from '../llm/types';
import type { KnowledgeRegistry } from './registry';
import { SIGNAL_CATALOG } from './signals';
import { REFERENCE_SECTIONS, VULN_SECTIONS } from './types';
import type { Playbook } from './types';

export type KnowledgeTool = ToolDef<KnowledgeRegistry>;

const agent = z.enum(['auth', 'dataflow', 'shared']).optional();
const sectionNames = [...new Set<string>([...VULN_SECTIONS, ...REFERENCE_SECTIONS])] as [
  string,
  ...string[],
];

const meta = (p: Playbook) => ({
  type: p.type,
  title: p.title,
  kind: p.kind,
  agent: p.agent,
  summary: p.summary,
  severityBase: p.severityBase,
  verifierTemplate: p.verifierTemplate,
  verification: p.verification,
  owasp: p.owasp,
  cwe: p.cwe,
  version: p.version,
});

/** Agent-facing tools over the playbook registry (same contract/shape as FACT_TOOLS). */
export const KNOWLEDGE_TOOLS: KnowledgeTool[] = [
  {
    name: 'getPlaybook',
    description:
      'Fetch one security playbook (how to investigate + what proves it). Pass `sections` to fetch only some sections and save tokens (e.g. ["Investigation strategy","False-positive rules"]).',
    schema: z.object({
      type: z.string().describe("playbook type, e.g. 'idor'"),
      sections: z.array(z.enum(sectionNames)).optional(),
    }),
    run: async (reg, a) => {
      const p = reg.getPlaybook(a.type);
      const want: string[] | undefined = a.sections;
      const sections = Object.fromEntries(
        Object.entries(p.sections).filter(([k]) => !want || want.includes(k)),
      );
      return {
        ...meta(p),
        factQueries: p.factQueries,
        signals: p.signals,
        requires: p.requires,
        appliesTo: p.appliesTo,
        sections,
      };
    },
  },
  {
    name: 'getPlaybooksForSignals',
    description:
      'Which playbooks apply to these fact signals (see getSignalCatalog). Ranked; returns compact summaries with the matched signals. Reference playbooks are appended when relevant.',
    schema: z.object({
      signals: z.array(z.string()).min(1),
      agent,
      limit: z.number().int().min(1).max(20).optional(),
    }),
    run: async (reg, a) => {
      const matches = reg.matchPlaybooks(a.signals, { agent: a.agent, limit: a.limit });
      return {
        signals: a.signals,
        unknownSignals: a.signals.filter((s: string) => !(s in SIGNAL_CATALOG)),
        matches: matches.map((m) => ({ ...meta(m.playbook), matched: m.matched, score: m.score })),
      };
    },
  },
  {
    name: 'listPlaybooks',
    description: 'List available playbooks (compact metadata).',
    schema: z.object({ agent, kind: z.enum(['vulnerability', 'reference']).optional() }),
    run: async (reg, a) => reg.listPlaybooks(a).map(meta),
  },
  {
    name: 'getSignalCatalog',
    description:
      'The fixed vocabulary of fact signals used to select playbooks, with what each means.',
    schema: z.object({}),
    run: async () => Object.entries(SIGNAL_CATALOG).map(([signal, m]) => ({ signal, ...m })),
  },
];

export const toKnowledgeLlmTools = (names?: string[]): LlmTool[] =>
  toLlmToolList(KNOWLEDGE_TOOLS, names);
export const runKnowledgeTool = (
  reg: KnowledgeRegistry,
  name: string,
  args: unknown,
): Promise<ToolResult> => runTool(KNOWLEDGE_TOOLS, reg, name, args);
