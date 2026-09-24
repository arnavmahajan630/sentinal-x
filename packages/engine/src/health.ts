import type { Config } from './config';
import { pingDb } from './db/connection';

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

  const components: HealthReport['components'] = {
    engine: { state: 'online' },
    sandbox: cfg.sandbox.targetUrl
      ? { state: 'online', detail: 'target configured' }
      : { state: 'not_configured', detail: 'SANDBOX_TARGET_URL unset (wired in C7)' },
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
