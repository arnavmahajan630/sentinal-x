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

/** /health answers 503 with a valid body when the DB is down — still parse it. */
export async function fetchHealth(): Promise<HealthReport> {
  const res = await fetch('/health');
  const body = (await res.json()) as HealthReport;
  if (!body?.components) throw new Error(`Unexpected /health response (${res.status})`);
  return body;
}
