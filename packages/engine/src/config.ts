import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optStr = z.preprocess(emptyToUndefined, z.string().optional());

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URL: z.string().default('mongodb://localhost:27017/sentinelx'),

  LLM_PROVIDER: z.enum(['gemini', 'deepseek', 'ollama']).default('gemini'),
  GEMINI_API_KEY: optStr,
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  DEEPSEEK_API_KEY: optStr,
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1'),

  SANDBOX_TARGET_URL: optStr,
  SANDBOX_SEED_USERS: z.string().default('./sandbox/seed-users.json'),
  VERIFICATION_ENABLED: bool.default('false'),

  PLAYBOOKS_DIR: optStr,
});

export type LlmProviderName = 'gemini' | 'deepseek' | 'ollama';

export interface Config {
  port: number;
  mongoUrl: string;
  llm: {
    provider: LlmProviderName;
    gemini: { apiKey?: string; model: string };
    deepseek: { apiKey?: string; model: string; baseUrl: string };
    ollama: { url: string; model: string };
  };
  sandbox: {
    targetUrl?: string;
    seedUsersPath: string;
    verificationEnabled: boolean;
  };
  /** where playbooks live (default: repo-root `playbooks/`, resolved by the knowledge loader) */
  playbooksDir?: string;
}

/** Parse + validate env into a typed Config. Throws a readable error on invalid input. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    mongoUrl: e.MONGO_URL,
    llm: {
      provider: e.LLM_PROVIDER,
      gemini: { apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL },
      deepseek: {
        apiKey: e.DEEPSEEK_API_KEY,
        model: e.DEEPSEEK_MODEL,
        baseUrl: e.DEEPSEEK_BASE_URL,
      },
      ollama: { url: e.OLLAMA_URL, model: e.OLLAMA_MODEL },
    },
    sandbox: {
      targetUrl: e.SANDBOX_TARGET_URL,
      seedUsersPath: e.SANDBOX_SEED_USERS,
      verificationEnabled: e.VERIFICATION_ENABLED,
    },
    playbooksDir: e.PLAYBOOKS_DIR,
  };
}

export interface PublicConfig {
  llm: {
    provider: LlmProviderName;
    model: string;
    configured: boolean;
  };
  sandbox: { configured: boolean; verificationEnabled: boolean };
}

/** Safe subset for `/api/config`. Never contains keys, URLs with credentials, or paths. */
export function publicConfig(cfg: Config): PublicConfig {
  const p = cfg.llm.provider;
  const model = cfg.llm[p].model;
  const configured =
    p === 'gemini' ? !!cfg.llm.gemini.apiKey : p === 'deepseek' ? !!cfg.llm.deepseek.apiKey : true;
  return {
    llm: { provider: p, model, configured },
    sandbox: {
      configured: !!cfg.sandbox.targetUrl,
      verificationEnabled: cfg.sandbox.verificationEnabled,
    },
  };
}
