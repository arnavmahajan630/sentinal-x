import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });
const { getProvider, loadConfig } = await import('../src');

// Scratch call: `LLM_PROVIDER=gemini GEMINI_API_KEY=... npm run llm:ping`
const cfg = loadConfig();
const provider = getProvider(cfg);
const res = await provider.chat([{ role: 'user', content: 'ping' }]);
console.log(`[${provider.name}]`, res.text, res.usage);
