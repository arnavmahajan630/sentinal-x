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

export function toToolDefs(tools: LlmTool[], sanitize?: (schema: object) => object) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: sanitize ? sanitize(t.schema) : t.schema,
    },
  }));
}

/** Wraps any LangChain chat model behind the locked LlmProvider interface. */
export class LangChainProvider implements LlmProvider {
  /**
   * @param requiredToolChoice provider-specific `tool_choice` value meaning "must call a tool"
   *   ('any' for Gemini, 'required' for OpenAI-compatible). Undefined = provider can't force tool use.
   */
  constructor(
    public readonly name: string,
    private readonly makeModel: (opts?: LlmChatOptions) => BaseChatModel,
    private readonly requiredToolChoice?: string,
    /** provider quirk: rewrite JSON schemas the provider's API rejects (e.g. Gemini: no `const`, `exclusiveMinimum`) */
    private readonly sanitizeSchema?: (schema: object) => object,
  ) {}

  async chat(
    messages: LlmMessage[],
    tools?: LlmTool[],
    opts?: LlmChatOptions,
  ): Promise<LlmResponse> {
    const base = this.makeModel(opts);
    const lc = toLangChainMessages(messages);
    const callOpts = opts?.signal ? { signal: opts.signal } : undefined;
    if (!tools?.length) return normalizeAiMessage((await base.invoke(lc, callOpts)) as AIMessage);
    if (!base.bindTools) throw new Error(`Provider ${this.name} does not support tool calling`);
    const defs = toToolDefs(tools, this.sanitizeSchema);

    if (opts?.toolChoice === 'required' && this.requiredToolChoice) {
      try {
        const forced = (base.bindTools as any)(defs, { tool_choice: this.requiredToolChoice });
        return normalizeAiMessage((await forced.invoke(lc, callOpts)) as AIMessage);
      } catch (e) {
        if (opts.signal?.aborted) throw e;
        // provider/model rejected forced tool choice → fall back to a normal tool-enabled call
      }
    }
    const model = base.bindTools(defs) as unknown as BaseChatModel;
    return normalizeAiMessage((await model.invoke(lc, callOpts)) as AIMessage);
  }
}
