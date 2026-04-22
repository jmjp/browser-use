import type { ToolDefinition } from '$lib/types/tools';
import type { LLMAdapter, LLMConfig, LLMMessage, LLMStreamChunk } from './interface';

export class AnthropicAdapter implements LLMAdapter {
  async *generateStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk> {
    const endpoint = config.baseUrl || 'https://api.anthropic.com/v1/messages';

    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: m.tool_call_id,
                content: m.content
              }
            ]
          };
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content
        };
      });

    const formattedTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object',
        properties: t.parameters.properties,
        required: t.parameters.required || []
      }
    }));

    const body: any = {
      model: config.model,
      messages: chatMessages,
      system: systemMessage,
      stream: true,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens || 4096,
      tools: formattedTools.length > 0 ? formattedTools : undefined
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const error = await response.text();
        yield { type: 'error', error: `Anthropic API Error: ${response.status} ${error}` };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6);
          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'content_block_start') {
              if (data.content_block?.type === 'tool_use') {
                yield {
                  type: 'tool_call',
                  tool_call: {
                    id: data.content_block.id,
                    name: data.content_block.name,
                    input: ''
                  }
                };
              }
            } else if (data.type === 'content_block_delta') {
              if (data.delta?.type === 'text_delta') {
                yield { type: 'text', content: data.delta.text };
              } else if (data.delta?.type === 'input_json_delta') {
                yield {
                  type: 'tool_call',
                  tool_call: {
                    id: '', // id is not sent in delta
                    name: '',
                    input: data.delta.partial_json
                  }
                };
              } else if (data.delta?.type === 'thought_delta') {
                yield { type: 'thought', content: data.delta.thought };
              }
            }
          } catch (e) {
            // console.error('Error parsing Anthropic stream:', e);
          }
        }
      }

      yield { type: 'done' };
    } catch (e: any) {
      yield { type: 'error', error: e.message };
    }
  }
}
