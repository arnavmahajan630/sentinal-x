import { describe, expect, it } from 'vitest';
import type { Config } from '../../src/config';
import type { Finding } from '../../src/findings/model';
import { isFindingAffected, transitionFindings } from '../../src/change/transitions';
import type { VerificationRun } from '../../src/verification/engine';

const mockCfg: Config = {
  port: 4000,
  mongoUrl: 'mongodb://localhost:27017/sentinelx_test',
  llm: {
    provider: 'gemini',
    gemini: { model: 'x' },
    deepseek: { model: 'x', baseUrl: 'x' },
    ollama: { url: 'x', model: 'x' },
  },
  sandbox: {
    targetUrl: 'http://localhost:3001',
    seedUsersPath: 'sandbox/seed-users.json',
    verificationEnabled: true,
  },
};

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  const now = new Date().toISOString();
  return {
    id: 'f-1',
    projectId: 'test-p1',
    type: 'idor',
    severity: 'high',
    confidence: 'high',
    status: 'open',
    affectedNodes: ['Route:GET /api/orders/:id', 'Function:controllers/order.js#getOrder'],
    evidence: {
      request: { method: 'GET', path: '/api/orders/order-2' },
      response: { status: 200 },
      expected: '403 or 404',
      actual: '200 OK',
    },
    verificationResult: { runId: 'v-1', result: 'CONFIRMED', verifiedAt: now },
    agentRun: 'run-1',
    references: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('transitionFindings (Finding State Transitions)', () => {
  it('correctly detects whether a finding is affected by changed nodes', () => {
    const finding = makeFinding({
      affectedNodes: ['Route:GET /api/orders/:id', 'File:controllers/order.js'],
    });

    const affected = new Set(['Route:GET /api/orders/:id', 'Model:User']);
    const unaffected = new Set(['Route:POST /api/auth/login', 'Model:User']);

    expect(isFindingAffected(finding, affected)).toBe(true);
    expect(isFindingAffected(finding, unaffected)).toBe(false);
  });

  it('transitions open finding to resolved when verification is REJECTED', async () => {
    const finding = makeFinding({ id: 'f-idor', status: 'open' });

    const mockVerifier = async (): Promise<VerificationRun> => ({
      id: 'v-recheck-1',
      projectId: finding.projectId,
      runId: 'reverify-1',
      hypothesisId: 'h-1',
      template: 'idor',
      result: 'REJECTED',
      evidence: {
        request: { method: 'GET', path: '/api/orders/order-2' },
        response: { status: 403 },
        expected: '403 or 404',
        actual: '403 Forbidden',
      },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });

    const transitions = await transitionFindings(
      mockCfg,
      finding.projectId,
      ['Route:GET /api/orders/:id'],
      {
        candidateFindings: [finding],
        verifier: mockVerifier,
      },
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.findingId).toBe('f-idor');
    expect(transitions[0]!.fromStatus).toBe('open');
    expect(transitions[0]!.toStatus).toBe('resolved');
    expect(transitions[0]!.verificationResult).toBe('REJECTED');
  });

  it('keeps open finding as open when verification is CONFIRMED', async () => {
    const finding = makeFinding({ id: 'f-idor', status: 'open' });

    const mockVerifier = async (): Promise<VerificationRun> => ({
      id: 'v-recheck-2',
      projectId: finding.projectId,
      runId: 'reverify-2',
      hypothesisId: 'h-2',
      template: 'idor',
      result: 'CONFIRMED',
      evidence: {
        request: { method: 'GET', path: '/api/orders/order-2' },
        response: { status: 200 },
        expected: '403 or 404',
        actual: '200 OK',
      },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });

    const transitions = await transitionFindings(
      mockCfg,
      finding.projectId,
      ['Route:GET /api/orders/:id'],
      {
        candidateFindings: [finding],
        verifier: mockVerifier,
      },
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.fromStatus).toBe('open');
    expect(transitions[0]!.toStatus).toBe('open');
    expect(transitions[0]!.verificationResult).toBe('CONFIRMED');
  });

  it('transitions previously resolved finding to regressed when re-confirmed', async () => {
    const finding = makeFinding({ id: 'f-idor', status: 'resolved' });

    const mockVerifier = async (): Promise<VerificationRun> => ({
      id: 'v-recheck-3',
      projectId: finding.projectId,
      runId: 'reverify-3',
      hypothesisId: 'h-3',
      template: 'idor',
      result: 'CONFIRMED',
      evidence: {
        request: { method: 'GET', path: '/api/orders/order-2' },
        response: { status: 200 },
        expected: '403 or 404',
        actual: '200 OK',
      },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });

    const transitions = await transitionFindings(
      mockCfg,
      finding.projectId,
      ['Route:GET /api/orders/:id'],
      {
        candidateFindings: [finding],
        verifier: mockVerifier,
      },
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.fromStatus).toBe('resolved');
    expect(transitions[0]!.toStatus).toBe('regressed');
    expect(transitions[0]!.verificationResult).toBe('CONFIRMED');
  });

  it('does not transition findings that are not touched by the change', async () => {
    const finding = makeFinding({
      id: 'f-idor',
      status: 'open',
      affectedNodes: ['Route:GET /api/orders/:id'],
    });

    const transitions = await transitionFindings(
      mockCfg,
      finding.projectId,
      ['Route:POST /api/auth/login'], // completely different route
      {
        candidateFindings: [finding],
        verifier: async () => {
          throw new Error('Should not be called');
        },
      },
    );

    expect(transitions).toHaveLength(0);
  });
});
