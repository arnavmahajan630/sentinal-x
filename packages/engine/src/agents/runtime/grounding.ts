import type { FactEngine } from '../../facts/engine';
import { FACT_TOOLS } from '../../facts/tools';
import type { KnowledgeRegistry } from '../../knowledge/registry';
import {
  SIGNAL_CATALOG,
  signalsFromJwtUsage,
  signalsFromRoute,
  signalsFromSecrets,
} from '../../knowledge/signals';
import type { Playbook, Severity, VerificationKind } from '../../knowledge/types';
import { suggest } from '../../tools/suggest';
import type { Hypothesis, HypothesisSubject, ToolCallRecord } from './types';

export interface GroundingDeps {
  engine: FactEngine;
  registry: KnowledgeRegistry;
  /** tool calls executed so far in THIS run */
  calls: ToolCallRecord[];
  /** playbook types this agent may propose */
  allowedTypes: string[];
  /** hypotheses already proposed in this run */
  existing: Hypothesis[];
}
export interface ProposalInput {
  type: string;
  subject: HypothesisSubject;
  evidence: number[];
}
export interface Grounded {
  type: string;
  subject: HypothesisSubject;
  title: string;
  affectedNodes: string[];
  signals: string[];
  playbook: string;
  verifierTemplate: string | null;
  verification: VerificationKind;
  severityHint: Severity;
}
export type GroundingResult =
  | { ok: true; grounded: Grounded }
  | { ok: false; error: { code: string; message: string; suggestions?: string[] } };

const reject = (code: string, message: string, suggestions?: string[]): GroundingResult => ({
  ok: false,
  error: { code, message, ...(suggestions?.length ? { suggestions } : {}) },
});

const FACT_NAMES = new Set(FACT_TOOLS.map((t) => t.name));
const ROUTE_SCOPED = new Set(['getRoute', 'getDataflow', 'getMiddlewareChain', 'getExposure']);
const LISTING = new Set([
  'getRoutes',
  'getUnprotectedRoutes',
  'getAuthorizationGaps',
  'getRoutesTouchingModel',
  'getModelAccess',
  'getSensitiveAssets',
  'getExposure',
  'getCallGraph',
]);

/** which kind of subject a playbook is about (from the domain of its signals) */
export function subjectKindOf(p: Playbook): 'route' | 'jwt' | 'secret' | undefined {
  const sources = new Set([...p.signals, ...p.requires].map((s) => SIGNAL_CATALOG[s]?.source));
  return (['route', 'jwt', 'secret'] as const).find((k) => sources.has(k));
}

const subjectLabel = (s: HypothesisSubject) =>
  s.kind === 'route' ? s.route : s.kind === 'jwt' ? `${s.fn}${s.line ? `:${s.line}` : ''}` : s.id;
const outputText = (c: ToolCallRecord) => JSON.stringify(c.output ?? '');

/**
 * Grounding guard for `proposeHypothesis` (pure; all facts come through the FactEngine).
 * A proposal is accepted only if the subject exists, the playbook's signals actually fire for it (so playbook
 * false-positive rules are enforced mechanically), the cited evidence is real (successful fact calls of this run,
 * at least one about the subject), and it is not a duplicate. The runtime — not the model — derives affected nodes.
 */
export async function groundHypothesis(
  deps: GroundingDeps,
  input: ProposalInput,
): Promise<GroundingResult> {
  const { engine, registry, calls } = deps;

  // (a) playbook type
  let playbook: Playbook;
  try {
    playbook = registry.getPlaybook(input.type);
  } catch (e: any) {
    return reject(
      'not_found',
      e.message,
      suggest(
        input.type,
        registry.listPlaybooks({ kind: 'vulnerability' }).map((p) => p.type),
      ),
    );
  }
  if (playbook.kind !== 'vulnerability')
    return reject(
      'invalid_argument',
      `"${input.type}" is a reference playbook, not a vulnerability class`,
    );
  if (!deps.allowedTypes.includes(playbook.type))
    return reject(
      'not_allowed',
      `This agent may not propose "${playbook.type}". Allowed: ${deps.allowedTypes.join(', ')}`,
      deps.allowedTypes,
    );
  const want = subjectKindOf(playbook);
  if (want && input.subject.kind !== want)
    return reject(
      'invalid_argument',
      `"${playbook.type}" is about a ${want} subject, got ${input.subject.kind}`,
    );

  // (b) subject exists + (c) signals it produces
  let signals: string[];
  let affected: string[] = [];
  let canonical: HypothesisSubject = input.subject;
  let covers: (c: ToolCallRecord) => Promise<boolean>;
  try {
    if (input.subject.kind === 'route') {
      const route = await engine.getRoute(input.subject.route);
      canonical = { kind: 'route', route: route.id };
      signals = signalsFromRoute(route);
      affected = [
        `Route:${route.id}`,
        ...(route.handler ? [`Function:${route.handler}`] : []),
        ...route.models.map((m) => `Model:${m}`),
        ...new Set([...route.sensitiveFields, ...route.exposesSensitive].map((a) => `Asset:${a}`)),
      ];
      covers = async (c) => {
        if (ROUTE_SCOPED.has(c.tool) && (c.args as any)?.route) {
          try {
            return (await engine.getRoute((c.args as any).route)).id === route.id;
          } catch {
            return false;
          }
        }
        return LISTING.has(c.tool) && outputText(c).includes(JSON.stringify(route.id));
      };
    } else if (input.subject.kind === 'jwt') {
      const { fn, line } = input.subject;
      const usage = (await engine.getJwtUsage()).find(
        (u) => (u.fn === fn || u.fn.endsWith(`#${fn}`)) && (!line || u.line === line),
      );
      if (!usage)
        return reject(
          'not_found',
          `No JWT operation at ${fn}${line ? `:${line}` : ''}`,
          suggest(
            fn,
            (await engine.getJwtUsage()).map((u) => `${u.fn}:${u.line}`),
          ),
        );
      canonical = { kind: 'jwt', fn: usage.fn, line: usage.line };
      signals = signalsFromJwtUsage(usage);
      affected = [
        `Function:${usage.fn}`,
        ...usage.usedByRoutes.slice(0, 20).map((r) => `Route:${r}`),
      ];
      covers = async (c) =>
        c.tool === 'getJwtUsage' && outputText(c).includes(JSON.stringify(usage.fn));
    } else {
      const secretRef = (input.subject as { kind: 'secret'; id: string }).id;
      const secrets = await engine.getSecrets();
      const s = secrets.find((x) => x.id === secretRef || x.id === `Secret:${secretRef}`);
      if (!s)
        return reject(
          'not_found',
          `No secret "${secretRef}"`,
          suggest(
            secretRef,
            secrets.map((x) => x.id),
          ),
        );
      canonical = { kind: 'secret', id: s.id };
      signals = signalsFromSecrets([s]);
      affected = [
        s.id,
        ...s.usedBy.filter((u) => u.node.includes('#')).map((u) => `Function:${u.node}`),
      ];
      covers = async (c) => c.tool === 'getSecrets' && outputText(c).includes(JSON.stringify(s.id));
    }
  } catch (e: any) {
    return reject(e.code ?? 'invalid_argument', e.message, e.suggestions);
  }

  // signal gate
  const matches = registry.matchPlaybooks(signals, { includeReferences: false });
  if (!matches.some((m) => m.playbook.type === playbook.type)) {
    const need = [
      ...(playbook.requires.length ? [`all of: ${playbook.requires.join(', ')}`] : []),
      ...(playbook.signals.length ? [`any of: ${playbook.signals.join(', ')}`] : []),
    ].join('; ');
    return reject(
      'not_supported_by_facts',
      `The facts for ${subjectLabel(canonical)} do not support "${playbook.type}". It needs ${need}. This subject has: ${signals.join(', ') || '(no signals)'}. Record a "safe" observation instead if it is a false positive.`,
    );
  }

  // evidence
  if (!input.evidence.length)
    return reject(
      'invalid_argument',
      'evidence must cite at least one successful fact-tool call number from this run',
    );
  const cited: ToolCallRecord[] = [];
  for (const n of input.evidence) {
    const c = calls.find((x) => x.seq === n);
    if (!c) return reject('invalid_evidence', `Evidence #${n} is not a tool call of this run`);
    if (!c.ok)
      return reject(
        'invalid_evidence',
        `Evidence #${n} (${c.tool}) failed; cite successful calls only`,
      );
    if (!FACT_NAMES.has(c.tool))
      return reject(
        'invalid_evidence',
        `Evidence #${n} (${c.tool}) is not a fact query; cite fact-tool results`,
      );
    cited.push(c);
  }
  let about = false;
  for (const c of cited)
    if (await covers(c)) {
      about = true;
      break;
    }
  if (!about)
    return reject(
      'invalid_evidence',
      `None of the cited calls (#${input.evidence.join(', #')}) is about ${subjectLabel(canonical)}. Query it first (e.g. getRoute) and cite that call.`,
    );

  // (e) duplicates
  const key = (t: string, s: HypothesisSubject) => `${t}|${JSON.stringify(s)}`;
  if (deps.existing.some((h) => key(h.type, h.subject) === key(playbook.type, canonical)))
    return reject(
      'duplicate',
      `Already proposed ${playbook.type} for ${subjectLabel(canonical)} in this run`,
    );

  return {
    ok: true,
    grounded: {
      type: playbook.type,
      subject: canonical,
      title: `${playbook.title}: ${subjectLabel(canonical)}`,
      affectedNodes: [...new Set(affected)].sort(),
      signals,
      playbook: `${playbook.type}@${playbook.version}`,
      verifierTemplate: playbook.verifierTemplate,
      verification: playbook.verification,
      severityHint: playbook.severityBase,
    },
  };
}
