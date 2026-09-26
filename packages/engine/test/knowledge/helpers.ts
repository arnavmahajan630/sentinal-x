import path from 'node:path';
import { KnowledgeRegistry } from '../../src/knowledge';

export const PLAYBOOKS_DIR = path.resolve(__dirname, '../../../../playbooks');
export const realRegistry = () => KnowledgeRegistry.fromDir(PLAYBOOKS_DIR);

/** minimal valid vulnerability playbook source for synthetic tests */
export function vulnMd(
  over: Record<string, string> = {},
  sections?: Record<string, string>,
): string {
  const fm: Record<string, string> = {
    type: 'demo',
    title: 'Demo playbook',
    kind: 'vulnerability',
    agent: 'auth',
    owasp: 'A01:2025',
    cwe: '[1]',
    severityBase: 'high',
    verifierTemplate: 'idor',
    verification: 'dynamic',
    factQueries: '[getRoute, getDataflow]',
    signals: '[authorization:unknown]',
    requires: '[]',
    summary: 'Demo summary text long enough.',
    ...over,
  };
  const body =
    sections ??
    Object.fromEntries(
      [
        'Threat',
        'Preconditions',
        'Signals',
        'Investigation strategy',
        'False-positive rules',
        'Relevant graph relationships',
        'Verification strategy',
        'Evidence requirements',
        'Remediation guidance',
      ].map((n) => [
        n,
        `${n} text that is long enough to pass the minimum length check. authorization:unknown getRoute getDataflow`,
      ]),
    );
  return `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n\n${Object.entries(body)
    .map(([n, t]) => `## ${n}\n${t}`)
    .join('\n\n')}\n`;
}
