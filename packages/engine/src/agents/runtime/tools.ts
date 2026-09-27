import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FactEngine } from '../../facts/engine';
import { FACT_TOOLS } from '../../facts/tools';
import { KNOWLEDGE_TOOLS } from '../../knowledge/tools';
import type { KnowledgeRegistry } from '../../knowledge/registry';
import { ToolError } from '../../tools/errors';
import { combineTools } from '../../tools/registry';
import type { ToolDef } from '../../tools/registry';
import type { RunEmitter } from './events';
import { groundHypothesis } from './grounding';
import type { RunStore } from './store';
import { EMIT_TOOL_NAMES } from './types';
import type {
  AgentSpec,
  AgentToolName,
  Hypothesis,
  InvestigationRequest,
  Observation,
  ToolCallRecord,
  VerificationRequest,
} from './types';

/** Everything a running agent's tools can touch. Mutable per-run state lives here. */
export interface RunCtx {
  runId: string;
  projectId: string;
  spec: AgentSpec;
  goal: string;
  engine: FactEngine;
  registry: KnowledgeRegistry;
  store: RunStore;
  emitter: RunEmitter;
  allowedTypes: string[];
  calls: ToolCallRecord[];
  observations: Observation[];
  hypotheses: Hypothesis[];
  verificationRequests: VerificationRequest[];
  investigationRequests: InvestigationRequest[];
  finished?: { outcome: 'findings' | 'none' | 'inconclusive'; summary: string };
}

export type AgentTool = Omit<ToolDef<RunCtx>, 'name'> & { name: AgentToolName };

const subject = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('route'),
    route: z.string().describe("Route id, e.g. 'GET /api/orders/:id'"),
  }),
  z.object({
    kind: z.literal('jwt'),
    fn: z.string().describe("Function id 'file#name' from getJwtUsage"),
    line: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('secret'),
    id: z.string().describe("Secret id from getSecrets, e.g. 'Secret:env:JWT_SECRET'"),
  }),
]);
const evidence = z
  .array(z.number().int().positive())
  .describe('call numbers ("call": N) of successful fact-tool results that support this');

const iso = () => new Date().toISOString();
const fail = (
  code: ConstructorParameters<typeof ToolError>[0],
  msg: string,
  suggestions?: string[],
) => new ToolError(code, msg, suggestions);

function emitTools(): AgentTool[] {
  return [
    {
      name: 'recordObservation',
      description:
        'Record a finding of the investigation: kind "fact" (something notable), "safe" (why a candidate is NOT a problem, e.g. a blocking ownership check exists) or "note". Cite evidence call numbers.',
      schema: z.object({
        kind: z.enum(['fact', 'safe', 'note']).default('note'),
        text: z.string().min(3).max(500),
        evidence: evidence.optional(),
      }),
      run: async (ctx, a) => {
        for (const n of a.evidence ?? [])
          if (!ctx.calls.some((c) => c.seq === n))
            throw fail('invalid_evidence', `Evidence #${n} is not a tool call of this run`);
        const o: Observation = {
          id: randomUUID(),
          runId: ctx.runId,
          projectId: ctx.projectId,
          agent: ctx.spec.name,
          kind: a.kind,
          text: a.text,
          evidence: a.evidence ?? [],
          ts: iso(),
        };
        ctx.observations.push(o);
        await ctx.store.saveObservation(o);
        await ctx.emitter.step('observation', `${a.kind}: ${a.text}`, o);
        return { recorded: true, id: o.id };
      },
    },
    {
      name: 'proposeHypothesis',
      description:
        'Propose a suspected vulnerability (never a confirmed one). Must name a real route/JWT operation/secret, a playbook type, and cite call numbers of successful fact-tool results about it. The runtime rejects proposals the facts do not support and fills affected nodes itself.',
      schema: z.object({
        type: z.string().describe("playbook type, e.g. 'idor'"),
        subject,
        evidence,
        rationale: z.string().min(20).max(800),
        confidence: z.enum(['low', 'medium', 'high']),
      }),
      run: async (ctx, a) => {
        const res = await groundHypothesis(
          {
            engine: ctx.engine,
            registry: ctx.registry,
            calls: ctx.calls,
            allowedTypes: ctx.allowedTypes,
            existing: ctx.hypotheses,
          },
          { type: a.type, subject: a.subject, evidence: a.evidence },
        );
        if (!res.ok) {
          await ctx.emitter.step('hypothesis.rejected', `${a.type}: ${res.error.message}`, {
            proposal: a,
            error: res.error,
          });
          throw fail(res.error.code as any, res.error.message, res.error.suggestions);
        }
        const g = res.grounded;
        const h: Hypothesis = {
          id: randomUUID(),
          runId: ctx.runId,
          projectId: ctx.projectId,
          agent: ctx.spec.name,
          ...g,
          rationale: a.rationale,
          confidence: a.confidence,
          evidence: a.evidence,
          status: 'proposed',
          ts: iso(),
        };
        ctx.hypotheses.push(h);
        await ctx.store.saveHypothesis(h);
        await ctx.emitter.step('hypothesis', h.title, h);
        ctx.emitter.global('hypothesis.proposed', {
          hypothesisId: h.id,
          type: h.type,
          title: h.title,
          agent: h.agent,
          affectedNodes: h.affectedNodes,
        });
        return {
          hypothesisId: h.id,
          type: h.type,
          affectedNodes: h.affectedNodes,
          playbook: h.playbook,
          verifierTemplate: h.verifierTemplate,
          next: h.verifierTemplate
            ? 'You may call requestVerification with this hypothesisId.'
            : `No verifier template exists for ${h.type} yet (verification: ${h.verification}); it stays a proposal.`,
        };
      },
    },
    {
      name: 'requestVerification',
      description:
        'Queue a proposed hypothesis for verification by the Verification Engine (a real controlled check in the sandbox). Only hypotheses of this run whose playbook has a verifier template can be verified.',
      schema: z.object({ hypothesisId: z.string() }),
      run: async (ctx, a) => {
        const h = ctx.hypotheses.find((x) => x.id === a.hypothesisId);
        if (!h)
          throw fail(
            'not_found',
            `No hypothesis "${a.hypothesisId}" in this run`,
            ctx.hypotheses.map((x) => x.id),
          );
        if (!h.verifierTemplate)
          throw fail(
            'rejected',
            `No verifier template for ${h.type} yet (verification: ${h.verification}). The hypothesis stays proposed.`,
          );
        if (h.verificationRequest)
          throw fail('duplicate', `Verification already requested for ${h.id}`);
        const req: VerificationRequest = {
          id: randomUUID(),
          runId: ctx.runId,
          hypothesisId: h.id,
          template: h.verifierTemplate,
          subject: h.subject,
          affectedNodes: h.affectedNodes,
          requestedAt: iso(),
        };
        h.verificationRequest = req;
        h.status = 'verification-requested';
        ctx.verificationRequests.push(req);
        await ctx.store.updateHypothesis(h.id, {
          verificationRequest: req,
          status: 'verification-requested',
        });
        await ctx.emitter.step('verification.requested', `verify ${h.type}: ${h.title}`, req);
        ctx.emitter.global('verification.requested', {
          requestId: req.id,
          hypothesisId: h.id,
          template: req.template,
        });
        return { queued: true, requestId: req.id, template: req.template };
      },
    },
    {
      name: 'requestInvestigation',
      description:
        'Ask another specialist agent to look at something (queued; the orchestrator routes it). Agents never call each other directly.',
      schema: z.object({
        agent: z.string(),
        question: z.string().min(10).max(400),
        refs: z.array(z.string()).max(10).optional(),
      }),
      run: async (ctx, a) => {
        const allowed = ctx.spec.investigationTargets ?? [];
        if (!allowed.includes(a.agent))
          throw fail(
            'not_allowed',
            `Agent "${a.agent}" is not an allowed target. Allowed: ${allowed.join(', ') || '(none)'}`,
            allowed,
          );
        const r: InvestigationRequest = {
          id: randomUUID(),
          runId: ctx.runId,
          from: ctx.spec.name,
          target: a.agent,
          question: a.question,
          refs: a.refs ?? [],
          requestedAt: iso(),
        };
        ctx.investigationRequests.push(r);
        await ctx.emitter.step('investigation.requested', `ask ${a.agent}: ${a.question}`, r);
        ctx.emitter.global('investigation.requested', { requestId: r.id, target: r.target });
        return { queued: true, requestId: r.id };
      },
    },
    {
      name: 'finish',
      description:
        'End the investigation. outcome: "findings" (you proposed hypotheses), "none" (nothing suspicious after checking) or "inconclusive". Give a short summary.',
      schema: z.object({
        outcome: z.enum(['findings', 'none', 'inconclusive']),
        summary: z.string().min(3).max(1200),
      }),
      run: async (ctx, a) => {
        ctx.finished = { outcome: a.outcome, summary: a.summary };
        return { finished: true };
      },
    },
  ];
}

/** fact + knowledge + emit tools for one run. Names are unique and typed (`AgentToolName`). */
export function buildAgentTools(): AgentTool[] {
  const fact: ToolDef<RunCtx>[] = FACT_TOOLS.map((t) => ({
    ...t,
    run: (c: RunCtx, a: unknown) => t.run(c.engine, a),
  }));
  const knowledge: ToolDef<RunCtx>[] = KNOWLEDGE_TOOLS.map((t) => ({
    ...t,
    run: (c: RunCtx, a: unknown) => t.run(c.registry, a),
  }));
  const emit = emitTools();
  const all = combineTools<RunCtx>(fact, knowledge, emit as unknown as ToolDef<RunCtx>[]);
  // sanity: emit names match the declared literal list
  if (JSON.stringify(emit.map((t) => t.name)) !== JSON.stringify([...EMIT_TOOL_NAMES]))
    throw new Error('emit tool names out of sync with EMIT_TOOL_NAMES');
  return all as AgentTool[];
}
