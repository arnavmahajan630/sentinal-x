import { ChatOllama } from '@langchain/ollama';
import type { Config } from '../../config';
import { LangChainProvider } from '../langchain';

export function createOllamaProvider(cfg: Config['llm']['ollama']) {
  return new LangChainProvider(
    'ollama',
    (opts) =>
      new ChatOllama({
        baseUrl: cfg.url,
        model: cfg.model,
        temperature: opts?.temperature,
        numPredict: opts?.maxTokens,
      }),
  );
}
