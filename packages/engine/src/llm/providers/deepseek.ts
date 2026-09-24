import { ChatOpenAI } from '@langchain/openai';
import type { Config } from '../../config';
import { LangChainProvider } from '../langchain';

/** DeepSeek is OpenAI-compatible: same client, different base URL. */
export function createDeepseekProvider(cfg: Config['llm']['deepseek']) {
  if (!cfg.apiKey) throw new Error('DEEPSEEK_API_KEY is not set');
  return new LangChainProvider(
    'deepseek',
    (opts) =>
      new ChatOpenAI({
        apiKey: cfg.apiKey,
        model: cfg.model,
        temperature: opts?.temperature,
        maxTokens: opts?.maxTokens,
        configuration: { baseURL: cfg.baseUrl },
      }),
  );
}
