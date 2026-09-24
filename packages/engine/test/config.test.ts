import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfig } from '../src/config';

describe('config', () => {
  it('applies defaults', () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(4000);
    expect(cfg.llm.provider).toBe('gemini');
    expect(cfg.sandbox.verificationEnabled).toBe(false);
    expect(cfg.sandbox.targetUrl).toBeUndefined();
  });

  it('treats empty strings as unset (as in .env.example)', () => {
    const cfg = loadConfig({ GEMINI_API_KEY: '', SANDBOX_TARGET_URL: '' });
    expect(cfg.llm.gemini.apiKey).toBeUndefined();
    expect(cfg.sandbox.targetUrl).toBeUndefined();
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'skynet' })).toThrow(/Invalid configuration/);
  });

  it('parses booleans', () => {
    expect(loadConfig({ VERIFICATION_ENABLED: 'true' }).sandbox.verificationEnabled).toBe(true);
  });

  it('never leaks secrets or URLs through publicConfig', () => {
    const cfg = loadConfig({
      GEMINI_API_KEY: 'super-secret-gemini',
      DEEPSEEK_API_KEY: 'super-secret-deepseek',
      MONGO_URL: 'mongodb://user:pw@host/db',
      SANDBOX_TARGET_URL: 'http://sandbox:3000',
    });
    const json = JSON.stringify(publicConfig(cfg));
    expect(json).not.toContain('super-secret');
    expect(json).not.toContain('mongodb://');
    expect(json).not.toContain('sandbox:3000');
    expect(publicConfig(cfg).llm.configured).toBe(true);
  });
});
