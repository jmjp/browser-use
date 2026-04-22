import { BROWSER_TOOLS, type BrowserTool } from '../lib/tools/browser';
import { getLLMAdapter, type LLMMessage, type LLMConfig } from '../lib/services/llm';
import type { AgentStep, AgentMessage, StepType } from '../lib/types/agent';

// Extension setup
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('Ultra Browser extension installed.');
});

interface AgentSession {
  id: string;
  messages: LLMMessage[];
  status: 'idle' | 'running' | 'paused';
  controller?: AbortController;
}

const sessions = new Map<string, AgentSession>();

async function getProviderConfig(): Promise<LLMConfig | null> {
  console.log('[Agent] Buscando configurações no storage...');
  const { settings } = await chrome.storage.local.get('settings');
  console.log('[Agent] Configurações encontradas:', settings ? 'Sim (Chave oculta)' : 'Não');
  return settings || null;
}

async function executeTool(name: string, args: any): Promise<any> {
  console.log(`[Agent] Executando ferramenta: ${name}`, args);
  const tool = BROWSER_TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);

  try {
    const result = await tool.execute(args);
    console.log(`[Agent] Resultado da ferramenta ${name}:`, result);
    return result;
  } catch (e: any) {
    console.error(`[Agent] Erro na ferramenta ${name}:`, e);
    return { error: e.message };
  }
}

async function* runAgentLoop(
  sessionId: string,
  userPrompt: string,
  attachments: any[] = [],
  isPlanMode: boolean = false,
  personaPrompt?: string
): AsyncGenerator<any> {
  console.log(`[Agent] Iniciando loop para sessão ${sessionId}. PlanMode: ${isPlanMode}, Attachments: ${attachments.length}`);
  const config = await getProviderConfig();
  if (!config) {
    console.error('[Agent] Configuração não encontrada!');
    yield { type: 'error', content: 'Configuração do provedor LLM não encontrada. Verifique as configurações.' };
    return;
  }

  let session = sessions.get(sessionId);
  if (!session) {
    session = { id: sessionId, messages: [], status: 'idle' };
    sessions.set(sessionId, session);
  }

  const controller = new AbortController();
  session.controller = controller;
  session.status = 'running';

  // Inject System Prompt / Persona if session is new
  if (personaPrompt && session.messages.length === 0) {
    session.messages.push({ role: 'system', content: personaPrompt });
  }

  let fullPrompt = userPrompt;
  if (attachments.length > 0) {
    fullPrompt += '\n\n[Anexos fornecidos pelo usuário: ' + attachments.map(a => a.name).join(', ') + ']';
  }

  if (isPlanMode) {
    fullPrompt = `[MODO PLANO ATIVO] Por favor, crie um plano de execução detalhado para a seguinte solicitação. NÃO execute nenhuma ferramenta ainda. Apenas descreva os passos que você pretende seguir para economizar tokens e garantir precisão. Peça minha confirmação após apresentar o plano.\n\nSolicitação: ${fullPrompt}`;
  }

  session.messages.push({ role: 'user', content: fullPrompt });

  // Estimate Prompt Tokens
  const promptTokens = Math.ceil(JSON.stringify(session.messages).length / 4);
  yield { type: 'token_usage', content: { prompt: promptTokens, completion: 0, total: promptTokens }, sessionId };

  console.log(`[Agent] Usando provedor: ${config.provider}, modelo: ${config.model}`);
  const adapter = getLLMAdapter(config);

  try {
    while (session.status === 'running') {
      console.log('[Agent] Chamando LLM adapter...');
      const stream = adapter.generateStream(session.messages, BROWSER_TOOLS, config, controller.signal);

      let assistantContent = '';
      let toolCalls = new Map<string, { id: string; name: string; input: string }>();
      let hasToolCalls = false;

      try {
        for await (const chunk of stream) {
          if (session.status !== 'running' || controller.signal.aborted) break;

          yield { ...chunk, sessionId };

          if (chunk.type === 'text') {
            assistantContent += chunk.content;
          } else if (chunk.type === 'thought') {
            // Thought is handled by the UI via the chunk
          } else if (chunk.type === 'tool_call') {
            hasToolCalls = true;
            const tc = chunk.tool_call;
            if (tc && tc.id) {
              if (!toolCalls.has(tc.id)) {
                toolCalls.set(tc.id, { id: tc.id, name: tc.name || '', input: tc.input || '' });
              } else {
                const existing = toolCalls.get(tc.id)!;
                if (tc.name) existing.name = tc.name;
                if (tc.input) existing.input = tc.input;
              }
            } else if (toolCalls.size > 0 && tc) {
              const lastId = Array.from(toolCalls.keys()).pop()!;
              const lastCall = toolCalls.get(lastId)!;
              lastCall.input += tc.input;
            }
          }
        }
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError') {
          console.log('[Agent] Stream abortado pelo usuário.');
          yield { type: 'error', content: 'Interrompido pelo usuário.', sessionId };
          break;
        }
        throw streamErr;
      }

      // Estimate Completion Tokens
      const completionTokens = Math.ceil(assistantContent.length / 4);
      yield { type: 'token_usage', content: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens }, sessionId };

      if (session.status !== 'running' || controller.signal.aborted) break;

      if (hasToolCalls && toolCalls.size > 0) {
        console.log(`[Agent] ${toolCalls.size} tool calls detectadas, processando...`);

        const assistantMessage: LLMMessage = {
          role: 'assistant',
          content: assistantContent,
          tool_calls: Array.from(toolCalls.values()).map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.input
            }
          }))
        };
        session.messages.push(assistantMessage);

        for (const tc of toolCalls.values()) {
          let toolArgs = {};
          try {
            const cleanInput = tc.input.trim();
            toolArgs = JSON.parse(cleanInput || '{}');
          } catch (e) {
            console.error(`[Agent] Erro ao parsear argumentos para ${tc.name}:`, tc.input);
            toolArgs = { error: "Invalid JSON arguments" };
          }

          const result = await executeTool(tc.name, toolArgs);
          const resultContent = typeof result === 'string' ? result : JSON.stringify(result);

          let llmResultContent = resultContent;
          if (tc.name === 'screenshot' && typeof result === 'object' && result.image) {
            llmResultContent = JSON.stringify({
              status: "success",
              message: "Screenshot captured and displayed to user. (Base64 data removed to save tokens)"
            });
          }

          yield {
            type: 'tool_result',
            name: tc.name,
            content: resultContent,
            sessionId,
            tool_use_id: tc.id
          };

          session.messages.push({
            role: 'tool',
            content: llmResultContent,
            name: tc.name,
            tool_call_id: tc.id
          });
        }
      } else {
        console.log('[Agent] Resposta final recebida.');
        session.messages.push({ role: 'assistant', content: assistantContent });
        session.status = 'idle';
        break;
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.log('[Agent] Loop abortado pelo usuário.');
      yield { type: 'error', content: 'Interrompido pelo usuário.', sessionId };
    } else {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error('[Agent] Erro no loop principal:', e);
      yield { type: 'error', content: errorMessage, sessionId };
    }
    session.status = 'idle';
  } finally {
    session.controller = undefined;
  }

  yield { type: 'done', sessionId };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AGENT_START') {
    const { sessionId, prompt, attachments, isPlanMode, personaPrompt, history } = message;
    console.log(`[Background] Recebido AGENT_START para sessão ${sessionId}`);

    // Initialize session messages from history if provided and session is empty or new
    let session = sessions.get(sessionId);
    if (!session) {
      session = { id: sessionId, messages: history || [], status: 'idle' };
      sessions.set(sessionId, session);
    } else if (history && history.length > session.messages.length) {
      // Sync history if UI has more messages (e.g. after reload)
      session.messages = history;
    }

    (async () => {
      try {
        for await (const event of runAgentLoop(sessionId, prompt, attachments, isPlanMode, personaPrompt)) {
          console.log('[Background] Enviando AGENT_EVENT:', event.type);
          try {
            await chrome.runtime.sendMessage({ type: 'AGENT_EVENT', event });
          } catch (sendErr) {
            console.error('[Background] Erro ao enviar mensagem para a UI:', sendErr);
            chrome.runtime.sendMessage({
              type: 'AGENT_EVENT',
              event: { type: 'error', content: 'Erro de comunicação: payload muito grande ou UI fechada.', sessionId }
            }).catch(() => { });
            break;
          }
        }
      } catch (err) {
        console.error('[Background] Erro catastrófico no loop do agente:', err);
        chrome.runtime.sendMessage({
          type: 'AGENT_EVENT',
          event: { type: 'error', content: 'Erro interno no agente.', sessionId }
        }).catch(() => { });
      }
    })();

    sendResponse({ status: 'started' });
  } else if (message.type === 'CANCEL_AGENT') {
    const session = sessions.get(message.sessionId);
    if (session) {
      session.status = 'idle';
      if (session.controller) {
        session.controller.abort();
      }
    }
    sendResponse({ status: 'stopped' });
  }
  return true;
});
