import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { GeminiAdapter } from './gemini';
import type { LLMAdapter, LLMConfig } from './interface';

export * from './interface';
export * from './openai';
export * from './anthropic';
export * from './gemini';

export function getLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter();
    case 'deepseek':
      // DeepSeek is OpenAI-compatible
      if (!config.baseUrl) {
        config.baseUrl = 'https://api.deepseek.com/chat/completions';
      }
      return new OpenAIAdapter();
    case 'custom':
      // Custom endpoints are expected to be OpenAI-compatible
      return new OpenAIAdapter();
    case 'anthropic':
      return new AnthropicAdapter();
    case 'gemini':
      return new GeminiAdapter();
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
