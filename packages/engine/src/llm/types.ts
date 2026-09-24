// LOCKED interface (C0). Agents and everything else depend only on this file.
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  /** Additive (C0 deviation): an assistant turn's tool calls, so tool results can be replayed. */
  toolCalls?: LlmToolCall[];
}
export interface LlmTool {
  name: string;
  description: string;
  schema: object; // JSON schema
}
export interface LlmToolCall {
  name: string;
  args: any;
  id: string;
}
export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  usage: { inTok: number; outTok: number };
}
export interface LlmChatOptions {
  temperature?: number;
  maxTokens?: number;
}
export interface LlmProvider {
  name: string;
  chat(messages: LlmMessage[], tools?: LlmTool[], opts?: LlmChatOptions): Promise<LlmResponse>;
}
