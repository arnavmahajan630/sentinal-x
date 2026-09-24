import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '@sentinelx/engine';
import { createApp } from '../src/app';

describe('server', () => {
  const app = createApp(
    loadConfig({ GEMINI_API_KEY: 'super-secret', MONGO_URL: 'mongodb://u:p@nowhere/db' }),
  );

  it('/health is 503 with database offline (no mongo connected in this test)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
    expect(res.body.components.database.state).toBe('offline');
    expect(res.body.components.engine.state).toBe('online');
    expect(res.body.components.sandbox.state).toBe('not_configured');
  });

  it('/api/config exposes no secrets', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    const s = JSON.stringify(res.body);
    expect(s).not.toContain('super-secret');
    expect(s).not.toContain('mongodb://');
    expect(res.body.llm).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      configured: true,
    });
  });
});
