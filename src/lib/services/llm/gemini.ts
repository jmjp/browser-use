import type { ToolDefinition } from '$lib/types/tools';
import type { LLMAdapter, LLMConfig, LLMMessage, LLMStreamChunk } from './interface';

export class GeminiAdapter implements LLMAdapter {
  async *generateStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    config: LLMConfig,
    signal?: AbortSignal
  ): AsyncIterable<LLMStreamChunk> {
    const model = config.model;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${config.apiKey}`;

    const contents: any[] = [];
    let systemInstruction: any = null;

    for (const m of messages) {
      if (m.role === 'system') {
        systemInstruction = { parts: [{ text: m.content }] };
        continue;
      }

      if (m.role === 'tool') {
        // Find the last message and append function response or handle correctly
        // Gemini expects functionResponse parts in the model role or user role depending on context
        // Usually it follows a functionCall from model
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.name || '',
              response: { result: m.content }
            }
          }]
        });
        continue;
      }

      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }

    const formattedTools = tools.length > 0 ? [{
      function_declarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }] : undefined;

    const body: any = {
      contents,
      system_instruction: systemInstruction,
      tools: formattedTools,
      generation_config: {
        temperature: config.temperature ?? 0.7,
        max_output_tokens: config.maxTokens || 4096
      }
    };

    try {
      console.log(`[Gemini] Chamando API: ${model}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[Gemini] Erro na API: ${response.status}`, error);
        yield { type: 'error', error: `Gemini API Error: ${response.status} ${error}` };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let processedPartsCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[Gemini] Stream finalizado pelo servidor.');
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let start = buffer.indexOf('{');
        while (start !== -1) {
          let open = 0;
          let end = -1;
          for (let i = start; i < buffer.length; i++) {
            if (buffer[i] === '{') open++;
            if (buffer[i] === '}') open--;
            if (open === 0) {
              end = i;
              break;
            }
          }

          if (end !== -1) {
            const jsonStr = buffer.substring(start, end + 1);
            try {
              const data = JSON.parse(jsonStr);
              const parts = data.candidates?.[0]?.content?.parts;
              if (parts && parts.length > 0) {
                // Se a API enviar partes cumulativas, processamos apenas as novas
                for (let i = processedPartsCount; i < parts.length; i++) {
                  const part = parts[i];
                  if (part.text) {
                    yield { type: 'text', content: part.text };
                  }
                  if (part.functionCall) {
                    yield {
                      type: 'tool_call',
                      tool_call: {
                        id: part.functionCall.name + '_' + i, // ID único por parte e posição
                        name: part.functionCall.name,
                        input: JSON.stringify(part.functionCall.args)
                      }
                    };
                  }
                  if (part.thought) {
                    yield { type: 'thought', content: part.thought };
                  }
                }
                processedPartsCount = parts.length;
              }
            } catch (e) {
              // Ignora JSON incompleto
            }
            buffer = buffer.substring(end + 1);
            start = buffer.indexOf('{');
          } else {
            break;
          }
        }
      }

      yield { type: 'done' };
    } catch (e: any) {
      console.error('[Gemini] Exceção durante a requisição:', e);
      yield { type: 'error', error: e.message };
    }
  }
}
