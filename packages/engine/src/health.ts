import type { Config } from './config';
import { pingDb } from './db/connection';
import { guardedFetch } from './verification/guard';

export type ComponentState = 'online' | 'offline' | 'not_configured';
export interface ComponentHealth {
  state: ComponentState;
  detail?: string;
}
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  ts: string;
  components: {
    engine: ComponentHealth;
    sandbox: ComponentHealth;
    llm: ComponentHealth;
    database: ComponentHealth;
  };
}

/**
 * Feeds the dashboard's four status pills (Core Engine / Sandbox / LLM Provider / Database).
 * Never makes a paid LLM call: the LLM pill only reflects that the chosen provider is configured.
 */
export async function getHealth(cfg: Config): Promise<HealthReport> {
  const dbUp = await pingDb();
  const p = cfg.llm.provider;
  const llmConfigured =
    p === 'gemini' ? !!cfg.llm.gemini.apiKey : p === 'deepseek' ? !!cfg.llm.deepseek.apiKey : true;

  const sandbox: ComponentHealth = !cfg.sandbox.targetUrl
    ? { state: 'not_configured', detail: 'SANDBOX_TARGET_URL unset' }
    : await (async () => {
        const probe = await guardedFetch(cfg, '__health__', 'GET', '/api/health');
        if (probe.allowed && probe.response.status === 200) {
          return { state: 'online' as const, detail: 'sandbox reachable' };
        }
        const detail = probe.allowed
          ? `unexpected status ${probe.response.status}`
          : probe.detail;
        return { state: 'offline' as const, detail };
      })();

  const components: HealthReport['components'] = {
    engine: { state: 'online' },
    sandbox,
    llm: llmConfigured
      ? { state: 'online', detail: `${p} configured` }
      : { state: 'not_configured', detail: `${p} API key missing` },
    database: dbUp ? { state: 'online' } : { state: 'offline', detail: 'MongoDB unreachable' },
  };

  const status: HealthReport['status'] = !dbUp
    ? 'down'
    : components.llm.state === 'online'
      ? 'ok'
      : 'degraded';
  return { status, ts: new Date().toISOString(), components };
}
