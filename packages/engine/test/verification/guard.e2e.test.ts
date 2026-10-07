import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, initCollections, models } from '../../src';
import { bus, EVENTS_CHANNEL } from '../../src/bus';
import { guardedFetch } from '../../src/verification/guard';
import type { Config } from '../../src/config';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://localhost:27017/sentinelx_test';
const projectId = 'guard-test';

function baseConfig(overrides: Partial<Config['sandbox']>): Config {
  return {
    port: 4000,
    mongoUrl: url,
    llm: {
      provider: 'gemini',
      gemini: { model: 'x' },
      deepseek: { model: 'x', baseUrl: 'x' },
      ollama: { url: 'x', model: 'x' },
    },
    sandbox: { seedUsersPath: './sandbox/seed-users.json', verificationEnabled: false, ...overrides },
  };
}

describe('guardedFetch', () => {
  let server: http.Server;
  let addr: AddressInfo;
  let received: number;

  beforeAll(async () => {
    await connectDb(url);
    await initCollections();
    server = http.createServer((req, res) => {
      received++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    addr = server.address() as AddressInfo;
  });
  afterAll(async () => {
    await models.security_events.deleteMany({ projectId });
    server.close();
    await disconnectDb();
  });

  it('refuses when verification is disabled (kill switch) — no network call made', async () => {
    received = 0;
    const cfg = baseConfig({ targetUrl: `http://127.0.0.1:${addr.port}`, verificationEnabled: false });
    const res = await guardedFetch(cfg, projectId, 'GET', '/x');
    expect(res).toMatchObject({ allowed: false, reason: 'verification_disabled' });
    expect(received).toBe(0);
  });

  it('refuses when no target is configured', async () => {
    received = 0;
    const cfg = baseConfig({ targetUrl: undefined, verificationEnabled: true });
    const res = await guardedFetch(cfg, projectId, 'GET', '/x');
    expect(res).toMatchObject({ allowed: false, reason: 'no_target_configured' });
    expect(received).toBe(0);
  });

  it('refuses a request to a non-sandbox host, and logs it', async () => {
    const events: unknown[] = [];
    const unsub = bus.subscribe(EVENTS_CHANNEL, (m) => events.push(m.data));
    const cfg = baseConfig({ targetUrl: `http://127.0.0.1:${addr.port}`, verificationEnabled: true });
    const res = await guardedFetch(cfg, projectId, 'GET', 'http://example.com/evil');
    unsub();
    expect(res).toMatchObject({ allowed: false, reason: 'host_mismatch' });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'verification.guard_refused', reason: 'host_mismatch' }),
    );
    const stored = await models.security_events
      .findOne({ projectId, type: 'verification.guard_refused' })
      .lean();
    expect(stored).toMatchObject({ reason: 'host_mismatch' });
  });

  it('allows a request to the real sandbox host and redacts Authorization + secret-looking body keys', async () => {
    received = 0;
    const cfg = baseConfig({ targetUrl: `http://127.0.0.1:${addr.port}`, verificationEnabled: true });
    const res = await guardedFetch(cfg, projectId, 'POST', '/login', {
      headers: { authorization: 'Bearer real-token-value' },
      body: { username: 'a', password: 'super-secret-pw' },
    });
    expect(received).toBe(1);
    expect(res.allowed).toBe(true);
    if (!res.allowed) throw new Error('unreachable');
    expect(res.request.headers.authorization).toBe('Bearer ***');
    expect((res.request.body as any).password).toBe('***');
    expect((res.request.body as any).username).toBe('a');
    expect(res.response.status).toBe(200);
    expect((res.response.body as any).ok).toBe(true);
  });
});
