import type { Severity } from '../knowledge/types';
import type { TemplateEvidence } from '../verification/templates/types';

export interface AttackPath {
  findingIds: string[];
  nodes: string[];
  edges: { from: string; to: string; type: string }[];
  narrative: string;
}

export interface Finding {
  id: string;
  projectId: string;
  type: string;
  severity: Severity;
  confidence: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'regressed' | 'rejected';
  affectedNodes: string[];
  evidence: TemplateEvidence;
  verificationResult: { runId: string; result: 'CONFIRMED'; verifiedAt: string };
  attackPath?: AttackPath;
  agentRun: string;
  references: { owasp?: string; apiTop10?: string; cwe?: number[] };
  createdAt: string;
  updatedAt: string;
}
