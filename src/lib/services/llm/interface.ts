import type { ToolDefinition } from '$lib/types/tools';

export type LLMMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMStreamChunk {
  type: 'thought' | 'tool_call' | 'text' | 'done' | 'error';
  content?: string;
  tool_call?: {
    id: string;
    name: string;
    input: string;
  };
  error?: string;
}

export interface LLMAdapter {
  generateStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk>;
}
