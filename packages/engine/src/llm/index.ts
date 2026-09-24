import type { Config } from '../config';
import { createDeepseekProvider } from './providers/deepseek';
import { createGeminiProvider } from './providers/gemini';
import { createOllamaProvider } from './providers/ollama';
import type { LlmProvider } from './types';

export * from './types';

/** The only place a concrete provider is chosen. Demo default → Gemini. */
export function getProvider(cfg: Config): LlmProvider {
  switch (cfg.llm.provider) {
    case 'gemini':
      return createGeminiProvider(cfg.llm.gemini);
    case 'deepseek':
      return createDeepseekProvider(cfg.llm.deepseek);
    case 'ollama':
      return createOllamaProvider(cfg.llm.ollama);
  }
}
