import cors from 'cors';
import express from 'express';
import { getHealth, publicConfig } from '@sentinelx/engine';
import type { Config } from '@sentinelx/engine';

export function createApp(cfg: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());

  // 503 only when the DB is down (compose healthcheck); a missing LLM key is "degraded", still 200.
  app.get('/health', async (_req, res) => {
    const report = await getHealth(cfg);
    res.status(report.status === 'down' ? 503 : 200).json(report);
  });

  // Safe subset only — see publicConfig(). Never expose secrets here.
  app.get('/api/config', (_req, res) => {
    res.json(publicConfig(cfg));
  });

  return app;
}
