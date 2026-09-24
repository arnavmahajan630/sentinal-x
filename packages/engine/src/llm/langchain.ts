import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LlmChatOptions, LlmMessage, LlmProvider, LlmResponse, LlmTool } from './types';

export function toLangChainMessages(messages: LlmMessage[]): BaseMessage[] {
  return messages.map((m) => {
    switch (m.role) {
      case 'system':
        return new SystemMessage(m.content);
      case 'user':
        return new HumanMessage(m.content);
      case 'assistant':
        return new AIMessage({
          content: m.content,
          tool_calls: (m.toolCalls ?? []).map((c) => ({ id: c.id, name: c.name, args: c.args })),
        });
      case 'tool':
        return new ToolMessage({ content: m.content, tool_call_id: m.toolCallId ?? '' });
    }
  });
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && (part as any).type === 'text') {
          return String((part as any).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

/** Provider-agnostic normalisation of a LangChain AI message → LlmResponse. */
export function normalizeAiMessage(msg: AIMessage): LlmResponse {
  return {
    text: contentToText(msg.content),
    toolCalls: (msg.tool_calls ?? []).map((c, i) => ({
      name: c.name,
      args: c.args,
      id: c.id ?? `call_${i}`,
    })),
    usage: {
      inTok: msg.usage_metadata?.input_tokens ?? 0,
      outTok: msg.usage_metadata?.output_tokens ?? 0,
    },
  };
}

export function toToolDefs(tools: LlmTool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.schema },
  }));
}

/** Wraps any LangChain chat model behind the locked LlmProvider interface. */
export class LangChainProvider implements LlmProvider {
  constructor(
    public readonly name: string,
    private readonly makeModel: (opts?: LlmChatOptions) => BaseChatModel,
  ) {}

  async chat(
    messages: LlmMessage[],
    tools?: LlmTool[],
    opts?: LlmChatOptions,
  ): Promise<LlmResponse> {
    let model = this.makeModel(opts);
    if (tools?.length) {
      if (!model.bindTools) throw new Error(`Provider ${this.name} does not support tool calling`);
      model = model.bindTools(toToolDefs(tools)) as unknown as BaseChatModel;
    }
    const res = await model.invoke(toLangChainMessages(messages));
    return normalizeAiMessage(res as AIMessage);
  }
}
