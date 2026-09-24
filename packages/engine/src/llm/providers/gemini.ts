import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { Config } from '../../config';
import { LangChainProvider } from '../langchain';

export function createGeminiProvider(cfg: Config['llm']['gemini']) {
  if (!cfg.apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new LangChainProvider(
    'gemini',
    (opts) =>
      new ChatGoogleGenerativeAI({
        apiKey: cfg.apiKey,
        model: cfg.model,
        temperature: opts?.temperature,
        maxOutputTokens: opts?.maxTokens,
      }),
  );
}
