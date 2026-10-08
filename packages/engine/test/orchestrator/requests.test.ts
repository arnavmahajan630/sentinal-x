import { describe, expect, it } from 'vitest';
import type { Hypothesis, InvestigationRequest, VerificationRequest } from '../../src/agents/runtime/types';
import type { Config } from '../../src/config';
import {
  deduplicateInvestigationRequests,
  drainVerificationRequests,
  subjectKey,
  verificationKey,
} from '../../src/orchestrator/requests';
import { fixtureEngine } from '../facts/helpers';

describe('orchestrator request protocol & deduplication', () => {
  it('generates consistent subject keys', () => {
    expect(subjectKey({ kind: 'route', route: 'GET /api/orders/:id' })).toBe(
      'route:GET /api/orders/:id',
    );
    expect(subjectKey({ kind: 'jwt', fn: 'verifyToken', line: 15 })).toBe(
      'jwt:verifyToken:15',
    );
    expect(subjectKey({ kind: 'secret', id: 'Secret:JWT_SECRET' })).toBe(
      'secret:Secret:JWT_SECRET',
    );
    expect(subjectKey({ kind: 'chain', findingIds: ['f2', 'f1'] })).toBe(
      'chain:f1,f2',
    );
  });

  it('generates deterministic verification keys', () => {
    const req: VerificationRequest = {
      id: 'req-1',
      runId: 'run-1',
      hypothesisId: 'hyp-1',
      template: 'idor',
      subject: { kind: 'route', route: 'GET /api/orders/:id' },
      affectedNodes: ['Route:GET /api/orders/:id'],
      requestedAt: new Date().toISOString(),
    };
    expect(verificationKey(req)).toBe('idor::route::route:GET /api/orders/:id');
  });

  it('deduplicates identical investigation requests and filters unallowed targets', () => {
    const requests: InvestigationRequest[] = [
      {
        id: '1',
        runId: 'r1',
        from: 'auth',
        target: 'dataflow',
        question: 'Does req.body reach findOne?',
        refs: [],
        requestedAt: 'now',
      },
      {
        id: '2',
        runId: 'r1',
        from: 'auth',
        target: 'dataflow',
        question: 'does req.body reach findone?  ', // same trimmed/lowercased question
        refs: [],
        requestedAt: 'now',
      },
      {
        id: '3',
        runId: 'r1',
        from: 'auth',
        target: 'unknown-agent', // not allowed
        question: 'Does this exist?',
        refs: [],
        requestedAt: 'now',
      },
      {
        id: '4',
        runId: 'r1',
        from: 'dataflow',
        target: 'auth',
        question: 'Is this route protected?',
        refs: [],
        requestedAt: 'now',
      },
    ];

    const deduplicated = deduplicateInvestigationRequests(requests);
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.map((r) => r.id)).toEqual(['1', '4']);
  });

  it('synthesizes INCONCLUSIVE verification runs when verification is disabled or target url is missing', async () => {
    const { engine } = await fixtureEngine();
    const cfg: Config = {
      port: 4000,
      mongoUrl: 'mongodb://localhost:27017/sentinelx',
      llm: {
        provider: 'gemini',
        gemini: { model: 'gemini-3.8-flash' },
        deepseek: { model: 'deepseek-chat', baseUrl: '' },
        ollama: { url: '', model: '' },
      },
      sandbox: {
        targetUrl: undefined, // no target url
        seedUsersPath: '',
        verificationEnabled: false,
      },
    };

    const req: VerificationRequest = {
      id: 'req-1',
      runId: 'run-1',
      hypothesisId: 'hyp-1',
      template: 'idor',
      subject: { kind: 'route', route: 'GET /api/orders/:id' },
      affectedNodes: ['Route:GET /api/orders/:id'],
      requestedAt: new Date().toISOString(),
    };

    const hyp: Hypothesis = {
      id: 'hyp-1',
      runId: 'run-1',
      projectId: 'fixture',
      agent: 'auth',
      type: 'idor',
      subject: { kind: 'route', route: 'GET /api/orders/:id' },
      title: 'Potential IDOR',
      rationale: 'Missing ownership check',
      confidence: 'high',
      evidence: [1],
      affectedNodes: ['Route:GET /api/orders/:id'],
      signals: ['auth:route:missing_ownership_check'],
      playbook: 'idor@1.0.0',
      verifierTemplate: 'idor',
      verification: 'dynamic',
      severityHint: 'high',
      status: 'verification-requested',
      verificationRequest: req,
      ts: new Date().toISOString(),
    };

    // Pass duplicate hypothesis as well
    const hyp2 = { ...hyp, id: 'hyp-2' };

    const result = await drainVerificationRequests(cfg, 'fixture', engine, [hyp, hyp2], {
      enableVerification: false,
    });

    // Should deduplicate to 1 run
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]!.result).toBe('INCONCLUSIVE');
    expect(result.findings).toHaveLength(0);
  });
});
