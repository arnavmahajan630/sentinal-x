import type { VerificationRequest } from '../../agents/runtime/types';
import type { SandboxClient } from '../client';

export interface TemplateEvidence {
  request: unknown;
  response: unknown;
  expected: string;
  actual: string;
}
export interface TemplateResult {
  result: 'CONFIRMED' | 'REJECTED' | 'INCONCLUSIVE';
  evidence: TemplateEvidence;
}
export type Template = (
  client: SandboxClient,
  req: VerificationRequest,
) => Promise<TemplateResult>;

export function methodAndPath(route: string): { method: string; path: string } {
  const trimmed = route.trim();
  const i = trimmed.indexOf(' ');
  if (i === -1) {
    const isMutation = trimmed.includes('POST') || trimmed.includes('PUT') || trimmed.includes('DELETE');
    return { method: isMutation ? 'POST' : 'GET', path: trimmed };
  }
  return { method: trimmed.slice(0, i).toUpperCase(), path: trimmed.slice(i + 1).trim() };
}

/** replace the first `:param` segment with a concrete id (known limitation: single-id routes only). */
export function substituteId(pathTemplate: string, id: string): string {
  return pathTemplate.replace(/:[^/]+/, id);
}

export function inconclusive(detail: string): TemplateResult {
  return {
    result: 'INCONCLUSIVE',
    evidence: { request: undefined, response: undefined, expected: '', actual: detail },
  };
}
