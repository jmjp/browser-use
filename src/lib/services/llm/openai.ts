import type { ToolDefinition } from '$lib/types/tools';
import type { LLMAdapter, LLMConfig, LLMMessage, LLMStreamChunk } from './interface';

export class OpenAIAdapter implements LLMAdapter {
  async *generateStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk> {
    const endpoint = config.baseUrl || 'https://api.openai.com/v1/chat/completions';

    const formattedTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const body: any = {
      model: config.model,
      messages: messages.map(m => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.name ? { name: m.name } : {})
      })),
      stream: true,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens
    };

    if (formattedTools.length > 0) {
      body.tools = formattedTools;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const error = await response.text();
        yield { type: 'error', error: `OpenAI API Error: ${response.status} ${error}` };
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
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices[0]?.delta;

            if (!delta) continue;

            // Handle reasoning/thought if available (OpenAI o1-style or others)
            if (delta.reasoning_content) {
              yield { type: 'thought', content: delta.reasoning_content };
            }

            if (delta.content) {
              yield { type: 'text', content: delta.content };
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  type: 'tool_call',
                  tool_call: {
                    id: tc.id,
                    name: tc.function?.name || '',
                    input: tc.function?.arguments || ''
                  }
                };
              }
            }
          } catch (e) {
            console.error('Error parsing OpenAI stream:', e);
          }
        }
      }

      yield { type: 'done' };
    } catch (e: any) {
      yield { type: 'error', error: e.message };
    }
  }
}
