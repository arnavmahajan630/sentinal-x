export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export type PlaybookKind = 'vulnerability' | 'reference';
export type PlaybookAgent = 'auth' | 'dataflow' | 'shared';
export type VerificationKind = 'dynamic' | 'static' | 'undecided' | 'none';

/** Fixed section order for each kind (validated by the loader). */
export const VULN_SECTIONS = [
  'Threat',
  'Preconditions',
  'Signals',
  'Investigation strategy',
  'False-positive rules',
  'Relevant graph relationships',
  'Verification strategy',
  'Evidence requirements',
  'Remediation guidance',
] as const;
export const REFERENCE_SECTIONS = ['Purpose', 'Concepts', 'Reading the facts', 'Pitfalls'] as const;
export type SectionName = (typeof VULN_SECTIONS)[number] | (typeof REFERENCE_SECTIONS)[number];

export interface PlaybookMeta {
  type: string;
  title: string;
  kind: PlaybookKind;
  agent: PlaybookAgent;
  owasp: string;
  apiTop10?: string;
  cwe: number[];
  severityBase: Severity;
  verifierTemplate: string | null;
  verification: VerificationKind;
  factQueries: string[];
  signals: string[];
  requires: string[];
  appliesTo: string[];
  summary: string;
}

export interface Playbook extends PlaybookMeta {
  /** section name → markdown text (without the heading) */
  sections: Partial<Record<SectionName, string>>;
  /** full markdown body (without front-matter) */
  body: string;
  /** sha1 of the raw file */
  hash: string;
  /** first 8 hex of hash — record as `type@version` in agent runs */
  version: string;
  /** file name relative to the playbooks dir */
  file: string;
}
