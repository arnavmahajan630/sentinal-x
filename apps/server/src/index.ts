import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Local dev: read the repo-root .env. In Docker, env comes from compose (file absent → no-op).
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const { connectDb, disconnectDb, initCollections, loadConfig } = await import('@sentinelx/engine');
const { createApp } = await import('./app');

const cfg = loadConfig();
const app = createApp(cfg);

const server = app.listen(cfg.port, () => {
  console.log(`[sentinel-x] server listening on :${cfg.port}`);
});

// Mongo connects in the background so /health can report "down" instead of the process crashing.
connectDb(cfg.mongoUrl)
  .then(() => initCollections())
  .then(() => console.log('[sentinel-x] mongo connected, collections ready'))
  .catch((err) => console.error('[sentinel-x] mongo connection failed:', err.message));

async function shutdown(signal: string) {
  console.log(`[sentinel-x] ${signal} received, shutting down`);
  server.close();
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
