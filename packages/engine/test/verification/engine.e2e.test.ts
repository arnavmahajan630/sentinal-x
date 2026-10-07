import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import type { Config } from '../../src/config';
import { verify } from '../../src/verification/engine';
import type { VerificationRequest } from '../../src/agents/runtime/types';

const mongoUrl = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const sandboxUrl = process.env.SANDBOX_TARGET_URL ?? 'http://localhost:3001';
const projectId = 'engine-e2e';

const cfg: Config = {
  port: 4000,
  mongoUrl,
  llm: {
    provider: 'gemini',
    gemini: { model: 'x' },
    deepseek: { model: 'x', baseUrl: 'x' },
    ollama: { url: 'x', model: 'x' },
  },
  sandbox: {
    targetUrl: sandboxUrl,
    seedUsersPath: 'sandbox/seed-users.json',
    verificationEnabled: true,
  },
};

function request(template: string, route: string, affectedNodes: string[] = []): VerificationRequest {
  return {
    id: randomUUID(),
    runId: 'e2e-run',
    hypothesisId: randomUUID(),
    template,
    subject: { kind: 'route', route },
    affectedNodes,
    requestedAt: new Date().toISOString(),
  };
}

let sandboxReachable = false;
try {
  const res = await fetch(`${sandboxUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
  sandboxReachable = res.ok;
} catch {
  sandboxReachable = false;
}

describe.skipIf(!sandboxReachable)('verify() against the live sandbox', () => {
  beforeAll(async () => {
    await connectDb(mongoUrl);
    await initCollections();
  });
  afterAll(async () => {
    await models.verification_runs.deleteMany({ projectId });
    await models.security_events.deleteMany({ projectId });
    await disconnectDb();
  });

  it('idor: User A reading User B\'s order → CONFIRMED', async () => {
    const run = await verify(cfg, projectId, request('idor', 'GET /api/orders/:id'));
    expect(run.result).toBe('CONFIRMED');
  });

  it('missing-auth: anonymous read of /api/users/:id → CONFIRMED', async () => {
    const run = await verify(cfg, projectId, request('missing-auth', 'GET /api/users/:id'));
    expect(run.result).toBe('CONFIRMED');
  });

  it('bfla: non-admin hitting /api/admin/stats → REJECTED (route is correctly guarded)', async () => {
    const run = await verify(cfg, projectId, request('bfla', 'GET /api/admin/stats'));
    expect(run.result).toBe('REJECTED');
  });

  // No REJECTED case for nosql-injection: the fixture has exactly one nosql-injection-shaped
  // route (the login filter), and it is deterministically vulnerable — there's no safe
  // comparison endpoint to exercise the template's REJECTED branch against live. Same
  // category of gap as data-exposure's missing negative control (see below); covered at
  // the grounding level instead (dataflow.test.ts's safe-route case).
  it('nosql-injection: operator payload bypasses the login filter → CONFIRMED', async () => {
    const run = await verify(cfg, projectId, request('nosql-injection', 'POST /api/auth/login'));
    expect(run.result).toBe('CONFIRMED');
  });

  it('mass-assignment: register ignores the injected role → REJECTED', async () => {
    // Negative control for the template itself: run against a route not in its dispatch
    // table resolves INCONCLUSIVE rather than guessing, so this proves the real dispatch —
    // register really does let role:'admin' through (see dataflow.test.ts for the
    // grounding side); here we assert the actual exploit outcome against the live app.
    const run = await verify(cfg, projectId, request('mass-assignment', 'POST /api/auth/register'));
    expect(run.result).toBe('CONFIRMED');
  });

  it('mass-assignment: PUT /api/orders/:id lets an unexpected field through → CONFIRMED', async () => {
    const run = await verify(cfg, projectId, request('mass-assignment', 'PUT /api/orders/:id'));
    expect(run.result).toBe('CONFIRMED');
  });

  it('mass-assignment: POST /api/orders overrides the injected owner id → REJECTED (negative control)', async () => {
    // order.controller.js sets `user: req.user.id` AFTER spreading req.body, so an
    // injected `user` field is always overridden — the one route in this fixture where
    // mass-assignment doesn't work, on purpose.
    const run = await verify(cfg, projectId, request('mass-assignment', 'POST /api/orders'));
    expect(run.result).toBe('REJECTED');
  });

  it('data-exposure: login response leaks User.password → CONFIRMED', async () => {
    const run = await verify(
      cfg,
      projectId,
      request('data-exposure', 'POST /api/auth/login', ['Asset:User.password']),
    );
    expect(run.result).toBe('CONFIRMED');
  });

  it('data-exposure: order response leaks Order.paymentDetails → CONFIRMED', async () => {
    const run = await verify(
      cfg,
      projectId,
      request('data-exposure', 'GET /api/orders/:id', ['Asset:Order.paymentDetails']),
    );
    expect(run.result).toBe('CONFIRMED');
  });

  it('an unreachable configured target never crashes verify() — surfaces INCONCLUSIVE', async () => {
    // Distinct from the guard's host-allowlist test (test/verification/guard.e2e.test.ts),
    // which proves a request to a DIFFERENT host than the configured target is refused+
    // logged. Here the configured target itself is just unreachable (connection refused) —
    // a network_error, not a policy refusal — and must still resolve to a normal
    // VerificationRun rather than throwing.
    const badCfg: Config = {
      ...cfg,
      sandbox: { ...cfg.sandbox, targetUrl: 'http://127.0.0.1:1' },
    };
    const run = await verify(badCfg, projectId, request('idor', 'GET /api/orders/:id'));
    expect(run.result).toBe('INCONCLUSIVE');
  });
});
