export class OpenAIAdapter {
  async *chat(messages, tools, config) {
    let endpoint = 'https://api.openai.com/v1/chat/completions';

    if (config.provider === 'deepseek') {
      endpoint = 'https://api.deepseek.com/v1/chat/completions';
    } else if (config.provider === 'custom' && config.baseUrl) {
      endpoint = config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    }

    const chatMessages = [];
    
    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls) {
        // Formato específico para chamadas de ferramentas do assistente
        chatMessages.push({
          role: 'assistant',
          content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : ''),
          tool_calls: m.tool_calls
        });
        continue;
      }

      let content = m.content;

      // Se for um resultado de ferramenta (mapeado do formato genérico do service worker)
      if (Array.isArray(content) && content.some(c => c.type === 'tool_result')) {
        for (const c of content) {
          if (c.type === 'tool_result') {
            chatMessages.push({
              role: 'tool',
              tool_call_id: c.tool_use_id,
              content: c.content
            });
          }
        }
        continue;
      }

      // Simplificar conteúdo se for apenas texto para maior compatibilidade
      if (Array.isArray(content)) {
        if (content.length === 1 && content[0].type === 'text') {
          content = content[0].text;
        } else {
          content = content.map(c => {
            if (c.type === 'image') {
              let data = c.data;
              if (!data.startsWith('data:')) {
                data = `data:${c.mimeType || 'image/png'};base64,${data}`;
              }
              return { type: 'image_url', image_url: { url: data } };
            }
            if (c.type === 'text') return { type: 'text', text: c.text };
            return c;
          });
        }
      }

      chatMessages.push({ role: m.role, content });
    }

    const body = {
      model: config.model || (config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o'),
      max_tokens: config.maxTokens || 8192,
      temperature: config.temperature !== undefined ? config.temperature : 0.7,
      stream: true,
      messages: chatMessages
    };

    if (tools && tools.length > 0) body.tools = tools;

    console.log(`Enviando requisição para ${config.provider} em ${endpoint}`);
    console.log('Mensagens sendo enviadas:', JSON.stringify(chatMessages, null, 2));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    console.log('Resposta recebida. Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API:', errorText);
      throw new Error(`${config.provider} API Error: ${response.status} ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            const choice = data.choices[0];
            if (!choice) continue;

            if (choice.delta.content) {
              yield { type: 'text', content: choice.delta.content };
            }

            if (choice.delta.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                if (tc.function.name) {
                  yield { type: 'tool_use_start', id: tc.id, name: tc.function.name };
                }
                if (tc.function.arguments) {
                  yield { type: 'tool_use_delta', delta: tc.function.arguments };
                }
              }
            }
          } catch (e) {
            console.warn('Error parsing SSE', e, line);
          }
        }
      }
    }
    yield { type: 'done' };
  }
}
