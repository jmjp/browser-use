<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { settingsStore, PERSONAS, type Persona } from '$lib/stores/settings.svelte';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import ThoughtBlock from '$lib/components/ThoughtBlock.svelte';
  import ToolChip from '$lib/components/ToolChip.svelte';
  import { historyStore } from '$lib/stores/history.svelte';
  import type { AgentStep, AgentToolUse, AgentToolResult, Attachment } from '$lib/types/agent';
  import { marked } from 'marked';
  import PlanChecklist from '$lib/components/PlanChecklist.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';

  // Custom Markdown Renderer for Code Block Copy Buttons
  const renderer = new marked.Renderer();
  const originalCode = renderer.code.bind(renderer);
  renderer.code = function(token) {
    const code = token.text;
    const lang = token.lang || '';
    return `<div class="relative group/code my-4">
      <div class="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity z-10 flex gap-2">
        <span class="text-[9px] font-mono text-[var(--color-text-muted)] bg-[var(--color-background)] px-1.5 py-0.5 rounded border border-[var(--color-border-light)]">${lang}</span>
        <button 
          class="p-1 bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)] shadow-sm copy-code-btn"
          data-code="${code.replace(/"/g, '&quot;')}"
          title="Copiar código"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </button>
      </div>
      ${originalCode(token)}
    </div>`;
  };
  marked.setOptions({ renderer });

  let input_value = $state('');
  let is_loading = $state(false);
  let is_sidebar_open = $state(false);
  let sessionId = $derived(historyStore.currentSessionId || 'default-session');
  let attachments = $state<Attachment[]>([]);
  let file_input: HTMLInputElement;
  let show_plus_menu = $state(false);
  let show_model_selector = $state(false);
  let show_persona_selector = $state(false);
  let chat_container = $state<HTMLElement | null>(null);
  let user_has_scrolled_up = $state(false);
  let current_tokens = $state({ prompt: 0, completion: 0, total: 0 });
  let copy_feedback_id = $state<string | null>(null);

  const available_models = [
    { id: 'gemini-1.5-flash', name: 'Gemini Flash', provider: 'gemini' as const, icon: '✨' },
    { id: 'gemini-1.5-pro', name: 'Gemini Pro', provider: 'gemini' as const, icon: '💎' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude Sonnet', provider: 'anthropic' as const, icon: '🎭' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' as const, icon: '🧠' }
  ];

  onMount(() => {
    settingsStore.load();
    
    // Global listener for copy code buttons (delegation)
    const handleGlobalClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.copy-code-btn') as HTMLButtonElement;
      if (btn) {
        const code = btn.getAttribute('data-code');
        if (code) {
          navigator.clipboard.writeText(code);
          const originalContent = btn.innerHTML;
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(() => {
            btn.innerHTML = originalContent;
          }, 2000);
        }
      }
    };
    document.addEventListener('click', handleGlobalClick);

    const listener = (message: any) => {
      if (message.type === 'AGENT_EVENT') {
        const { event } = message;
        if (event.sessionId !== sessionId) return;
        handleAgentEvent(event);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  });

  function handle_scroll() {
    if (!chat_container) return;
    const { scrollTop, scrollHeight, clientHeight } = chat_container;
    user_has_scrolled_up = scrollTop + clientHeight < scrollHeight - 60;
  }

  async function scroll_to_bottom(force = false) {
    await tick();
    if (chat_container && (force || !user_has_scrolled_up)) {
      chat_container.scrollTo({
        top: chat_container.scrollHeight,
        behavior: force ? 'auto' : 'smooth'
      });
    }
  }

  function handleAgentEvent(event: any) {
    const lastMessage = historyStore.messages[historyStore.messages.length - 1];
    
    if (event.type === 'token_usage') {
      current_tokens = event.content;
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.token_usage = event.content;
      }
    } else if (event.type === 'text') {
      if (lastMessage && lastMessage.role === 'assistant') {
        const lastStep = lastMessage.steps[lastMessage.steps.length - 1];
        if (lastStep && lastStep.type === 'text') {
          lastStep.content += event.content;
        } else {
          historyStore.addStep(lastMessage.id, {
            id: Math.random().toString(),
            type: 'text',
            content: event.content,
            timestamp: new Date()
          });
        }
      }
      scroll_to_bottom();
    } else if (event.type === 'thought') {
      if (lastMessage && lastMessage.role === 'assistant') {
        const lastStep = lastMessage.steps[lastMessage.steps.length - 1];
        if (lastStep && lastStep.type === 'thought') {
          lastStep.content += event.content;
        } else {
          historyStore.addStep(lastMessage.id, {
            id: Math.random().toString(),
            type: 'thought',
            content: event.content,
            timestamp: new Date()
          });
        }
      }
      scroll_to_bottom();
    } else if (event.type === 'tool_call') {
      if (lastMessage && lastMessage.role === 'assistant') {
        const toolCall = event.tool_call;
        const toolCallId = toolCall.id || 'current-streaming-tool';
        let existingStep = lastMessage.steps.find(s => s.id === toolCallId);

        if (!existingStep && toolCallId !== 'current-streaming-tool') {
          existingStep = lastMessage.steps.find(s => s.id === 'current-streaming-tool');
          if (existingStep) existingStep.id = toolCallId;
        }

        if (existingStep && existingStep.type === 'tool_use') {
          if (toolCall.name) (existingStep as AgentToolUse).tool_name = toolCall.name;
          if (toolCall.input) (existingStep as AgentToolUse).input += toolCall.input;
        } else if (toolCall.name) {
          historyStore.addStep(lastMessage.id, {
            id: toolCallId,
            type: 'tool_use',
            content: '',
            timestamp: new Date(),
            tool_name: toolCall.name,
            input: toolCall.input || ''
          } as AgentToolUse);
        }
      }
      scroll_to_bottom();
    } else if (event.type === 'tool_result') {
      if (lastMessage && lastMessage.role === 'assistant') {
        const toolUseId = event.tool_use_id || 'current-streaming-tool';
        const toolUseStep = lastMessage.steps.find(s => s.id === toolUseId) || 
                           lastMessage.steps.find(s => s.id === 'current-streaming-tool');
        
        const result: AgentToolResult = {
          id: Math.random().toString(),
          type: 'tool_result',
          content: event.content,
          timestamp: new Date(),
          tool_use_id: toolUseId,
          output: event.content,
          is_error: false
        };

        if (toolUseStep && toolUseStep.type === 'tool_use') {
          (toolUseStep as AgentToolUse).result = result;
          if (toolUseStep.id === 'current-streaming-tool' && event.tool_use_id) {
            toolUseStep.id = event.tool_use_id;
          }
        } else {
          historyStore.addStep(lastMessage.id, result);
        }
      }
      scroll_to_bottom();
    } else if (event.type === 'done') {
      is_loading = false;
      scroll_to_bottom(true);
    } else if (event.type === 'error') {
      is_loading = false;
      if (lastMessage && lastMessage.role === 'assistant') {
        historyStore.addStep(lastMessage.id, {
          id: Math.random().toString(),
          type: 'text',
          content: `\nErro: ${event.content}`,
          timestamp: new Date()
        });
      }
      scroll_to_bottom(true);
    }
  }

  async function handle_file_upload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    if (attachments.length + files.length > 10) {
      alert('Limite de 10 arquivos atingido.');
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        attachments.push({
          id: Math.random().toString(),
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64,
          previewUrl: file.type.startsWith('image/') ? base64 : undefined
        });
      };
      reader.readAsDataURL(file);
    }
    (e.target as HTMLInputElement).value = '';
    show_plus_menu = false;
  }

  function remove_attachment(id: string) {
    attachments = attachments.filter(a => a.id !== id);
  }

  function select_model(model: typeof available_models[0]) {
    settingsStore.save({ ...settingsStore.settings, provider: model.provider, model: model.id });
    show_model_selector = false;
  }

  function select_persona(persona: Persona) {
    settingsStore.save({ ...settingsStore.settings, personaId: persona.id });
    show_persona_selector = false;
    show_plus_menu = false;
  }

  function toggle_plan_mode() {
    settingsStore.planModeEnabled = !settingsStore.planModeEnabled;
    show_plus_menu = false;
  }

  function get_llm_history() {
    const messages = historyStore.messages.slice(0, -1);
    const llmHistory: any[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        const textStep = msg.steps.find(s => s.type === 'text');
        llmHistory.push({ role: 'user', content: textStep?.content || '' });
      } else {
        let content = '';
        const toolCalls: any[] = [];
        for (const step of msg.steps) {
          if (step.type === 'text') content += step.content;
          if (step.type === 'tool_use') {
            const tu = step as AgentToolUse;
            toolCalls.push({
              id: tu.id,
              type: 'function',
              function: { name: tu.tool_name, arguments: tu.input }
            });
            if (tu.result) {
              llmHistory.push({
                role: 'tool',
                tool_call_id: tu.id,
                name: tu.tool_name,
                content: typeof tu.result.output === 'string' ? tu.result.output : JSON.stringify(tu.result.output)
              });
            }
          }
        }
        llmHistory.push({ role: 'assistant', content: content, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) });
      }
    }
    return llmHistory;
  }

  function handle_send() {
    if ((!input_value.trim() && attachments.length === 0) || is_loading || !settingsStore.isConfigured) return;
    
    const userMessageId = Math.random().toString();
    historyStore.addMessage({
      id: userMessageId,
      role: 'user',
      steps: [{ id: Math.random().toString(), type: 'text', content: input_value, timestamp: new Date() }],
      timestamp: new Date(),
      attachments: [...attachments],
      is_plan_mode: settingsStore.planModeEnabled,
      model: settingsStore.settings.model,
      persona: settingsStore.settings.personaId
    });

    historyStore.addMessage({
      id: Math.random().toString(),
      role: 'assistant',
      steps: [],
      timestamp: new Date(),
      is_plan_mode: settingsStore.planModeEnabled
    });
    
    const prompt = input_value;
    const currentAttachments = [...attachments];
    const isPlanMode = settingsStore.planModeEnabled;
    const personaPrompt = settingsStore.currentPersona.systemPrompt;
    const history = get_llm_history();

    input_value = '';
    attachments = [];
    is_loading = true;
    current_tokens = { prompt: 0, completion: 0, total: 0 };
    user_has_scrolled_up = false;

    chrome.runtime.sendMessage({
      type: 'AGENT_START',
      sessionId,
      prompt,
      attachments: currentAttachments,
      isPlanMode,
      personaPrompt,
      history
    });

    scroll_to_bottom(true);
  }

  function handle_stop() {
    if (!is_loading) return;
    chrome.runtime.sendMessage({ type: 'CANCEL_AGENT', sessionId }, () => { is_loading = false; });
  }

  function clear_history() {
    historyStore.clear();
  }

  function copy_to_clipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    copy_feedback_id = id;
    setTimeout(() => { if (copy_feedback_id === id) copy_feedback_id = null; }, 2000);
  }
</script>

<div class="flex flex-col h-screen w-full bg-[var(--color-background)] overflow-hidden">
  <Sidebar isOpen={is_sidebar_open} onClose={() => is_sidebar_open = false} />

  <!-- Header -->
  <header class="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border-light)] z-10 shadow-sm">
    <div class="flex items-center gap-3">
      <button 
        onclick={() => is_sidebar_open = true}
        class="p-1 hover:bg-[var(--color-border-light)] rounded-md text-[var(--color-text-muted)] transition-colors"
        aria-label="Abrir menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </button>

      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-[var(--color-primary)] rounded-[var(--radius-md)] flex items-center justify-center text-white shadow-sm overflow-hidden">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5a2.12 2.12 0 0 0 3 3"/></svg>
        </div>
        <div>
          <h1 class="text-sm font-bold text-[var(--color-text-main)] leading-none tracking-tight">Ultra Browser</h1>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="w-1.5 h-1.5 {!settingsStore.isConfigured ? 'bg-red-500' : is_loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'} rounded-full"></span>
            <p class="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">
              {!settingsStore.isConfigured ? 'IA Desativada' : is_loading ? 'Processando...' : 'Agente Ativo'}
            </p>
          </div>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-3">
      {#if current_tokens.total > 0}
        <div class="flex flex-col items-end group relative cursor-help">
          <p class="text-[8px] font-bold text-[var(--color-text-muted)] uppercase tracking-tighter leading-none">Tokens</p>
          <p class="text-[10px] font-mono font-bold text-[var(--color-primary)] leading-none mt-0.5">{current_tokens.total}</p>
          <div class="absolute top-full right-0 mt-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-2 shadow-lg hidden group-hover:block z-50 min-w-[100px]">
            <div class="text-[9px] space-y-1">
              <div class="flex justify-between gap-4">
                <span class="text-[var(--color-text-muted)]">Prompt:</span>
                <span class="font-mono text-[var(--color-text-main)]">{current_tokens.prompt}</span>
              </div>
              <div class="flex justify-between gap-4">
                <span class="text-[var(--color-text-muted)]">Resposta:</span>
                <span class="font-mono text-[var(--color-text-main)]">{current_tokens.completion}</span>
              </div>
            </div>
          </div>
        </div>
      {/if}
      <div class="flex gap-1">
        <a href="/settings" class="p-1.5 hover:bg-[var(--color-border-light)] rounded-[var(--radius-md)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-primary)]" aria-label="Configurações">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </a>
      </div>
    </div>
  </header>

  <main bind:this={chat_container} onscroll={handle_scroll} class="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--color-background)] scroll-smooth">
    {#if !settingsStore.isConfigured}
      <div class="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
        <div class="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 class="text-base font-bold text-[var(--color-text-main)]">IA Não Configurada</h2>
        <p class="text-sm text-[var(--color-text-muted)] max-w-[250px]">Você precisa configurar uma chave de API para começar a usar o Ultra Browser.</p>
        <a href="/settings" class="inline-flex items-center px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-bold rounded-[var(--radius-lg)] hover:bg-[var(--color-primary-soft)] transition-all shadow-md">Configurar Agora</a>
      </div>
    {:else if historyStore.loading}
      <div class="flex items-center justify-center h-full"><p class="text-sm text-[var(--color-text-muted)]">Carregando histórico...</p></div>
    {:else}
      {#each historyStore.messages as msg (msg.id)}
        <ChatBubble role={msg.role} timestamp={msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}>
          {#each msg.steps as step (step.id)}
            {#if step.type === 'thought'}
              <ThoughtBlock content={step.content} is_streaming={is_loading && msg === historyStore.messages[historyStore.messages.length - 1]} />
            {:else if step.type === 'tool_use'}
              {@const toolStep = step as AgentToolUse}
              <ToolChip name={toolStep.tool_name} status={toolStep.result ? (toolStep.result.is_error ? 'error' : 'success') : 'running'} params={toolStep.input} result={toolStep.result?.output} />
            {:else if step.type === 'text'}
              {#if msg.role === 'assistant' && msg.is_plan_mode}
                <PlanChecklist content={step.content} is_streaming={is_loading && msg === historyStore.messages[historyStore.messages.length - 1]} tasks={step.metadata?.tasks || []} onToggle={(index, done) => {
                  const tasks = step.metadata?.tasks || [];
                  let updatedTasks = [...tasks];
                  if (updatedTasks.length === 0) {
                    const lines = step.content.split('\n');
                    for (const line of lines) {
                      const match = line.match(/^[\s]*[-*1.]\s(\[([ xX])\]\s)?(.*)/);
                      if (match) updatedTasks.push({ text: match[3].trim(), done: false });
                    }
                  }
                  updatedTasks[index].done = done;
                  historyStore.updateStep(msg.id, step.id, { metadata: { ...step.metadata, tasks: updatedTasks } });
                }} />
              {:else}
                <div class="prose prose-sm text-[var(--color-text-main)] max-w-none relative group/text whitespace-normal mb-2 last:mb-0">
                  {@html marked.parse(step.content)}
                  <button onclick={() => copy_to_clipboard(step.content, step.id)} class="absolute top-0 right-0 p-1.5 bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded-md opacity-0 group-hover/text:opacity-100 transition-all shadow-sm hover:border-[var(--color-primary-soft)] hover:text-[var(--color-primary)]" title="Copiar texto">
                    {#if copy_feedback_id === step.id}
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    {/if}
                  </button>
                </div>
              {/if}
            {/if}
          {/each}
        </ChatBubble>
      {/each}
    {/if}
  </main>

  <!-- Input Area -->
  <footer class="p-4 bg-[var(--color-surface)] border-t border-[var(--color-border-light)]">
    {#if attachments.length > 0}
      <div class="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
        {#each attachments as att (att.id)}
          <div class="relative group flex-shrink-0">
            <div class="w-12 h-12 bg-[var(--color-border-light)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-border)] flex items-center justify-center">
              {#if att.previewUrl}<img src={att.previewUrl} alt={att.name} class="w-full h-full object-cover" />{:else}<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--color-text-muted)]"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>{/if}
            </div>
            <button onclick={() => remove_attachment(att.id)} class="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow-sm hover:bg-red-600 transition-colors">×</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="flex items-center justify-between mb-2">
      <div class="flex gap-2">
        <button onclick={() => { show_model_selector = !show_model_selector; show_persona_selector = false; }} class="text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-border-light)] transition-all uppercase tracking-wider">
          {available_models.find(m => m.id === settingsStore.settings.model)?.name || 'Selecionar Modelo'}
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="{show_model_selector ? 'rotate-180' : ''} transition-transform"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        {#if settingsStore.planModeEnabled}
          <span class="text-[9px] font-bold bg-[var(--color-primary-light)] text-[var(--color-primary)] px-2 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-1 border border-[var(--color-primary-soft)] animate-pulse">
            <span class="w-1 h-1 bg-[var(--color-primary)] rounded-full"></span>Modo Plano
          </span>
        {/if}
      </div>
      <div class="text-[9px] font-medium text-[var(--color-text-muted)] flex items-center gap-1">
        <span>{settingsStore.currentPersona.icon}</span>{settingsStore.currentPersona.name}
      </div>
    </div>

    {#if show_model_selector}
      <div class="absolute bottom-[160px] left-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-xl z-20 overflow-hidden min-w-[180px] animate-in slide-in-from-bottom-2">
        <div class="p-2 border-b border-[var(--color-border-light)] bg-[var(--color-background)]"><p class="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">IA Provedor</p></div>
        {#each available_models as model}
          <button onclick={() => select_model(model)} class="w-full px-3 py-2 text-left text-xs hover:bg-[var(--color-border-light)] transition-colors flex items-center gap-2 {settingsStore.settings.model === model.id ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold' : 'text-[var(--color-text-main)]'}">
            <span class="w-5 text-center">{model.icon}</span>{model.name}
            {#if settingsStore.settings.model === model.id}<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="ml-auto"><polyline points="20 6 9 17 4 12"/></svg>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if show_persona_selector}
      <div class="absolute bottom-[100px] left-12 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-xl z-30 overflow-hidden min-w-[180px] animate-in slide-in-from-bottom-2">
        <div class="p-2 border-b border-[var(--color-border-light)] bg-[var(--color-background)]"><p class="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Persona / Habilidade</p></div>
        {#each PERSONAS as persona}
          <button onclick={() => select_persona(persona)} class="w-full px-3 py-2 text-left text-xs hover:bg-[var(--color-border-light)] transition-colors flex items-center gap-2 {settingsStore.settings.personaId === persona.id ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-semibold' : 'text-[var(--color-text-main)]'}">
            <span class="w-5 text-center">{persona.icon}</span>{persona.name}
            {#if settingsStore.settings.personaId === persona.id}<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="ml-auto"><polyline points="20 6 9 17 4 12"/></svg>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="relative group">
      <div class="absolute -inset-0.5 bg-gradient-to-r from-[var(--color-primary-soft)] to-[var(--color-status-thinking)] rounded-[var(--radius-xl)] blur opacity-0 group-focus-within:opacity-20 transition duration-500"></div>
      <div class="relative flex items-end gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-2 pr-3 focus-within:border-[var(--color-primary-soft)] transition-all shadow-sm">
        <div class="relative shrink-0 mb-1 ml-1">
          <button onclick={() => { show_plus_menu = !show_plus_menu; show_model_selector = false; show_persona_selector = false; }} class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--color-border-light)] text-[var(--color-text-muted)] transition-all active:scale-90" title="Adicionar...">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="{show_plus_menu ? 'rotate-45' : ''} transition-transform"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          {#if show_plus_menu}
            <div class="absolute bottom-10 left-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-xl z-20 overflow-hidden min-w-[150px] animate-in slide-in-from-bottom-2">
              <button onclick={() => file_input.click()} class="w-full px-3 py-2 text-left text-xs hover:bg-[var(--color-border-light)] transition-colors flex items-center gap-2 text-[var(--color-text-main)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Anexar Arquivos
              </button>
              <button onclick={() => { show_persona_selector = !show_persona_selector }} class="w-full px-3 py-2 text-left text-xs hover:bg-[var(--color-border-light)] transition-colors flex items-center gap-2 text-[var(--color-text-main)]">
                <span class="w-4 text-center">{settingsStore.currentPersona.icon}</span>Mudar Persona
              </button>
              <button onclick={toggle_plan_mode} class="w-full px-3 py-2 text-left text-xs border-t border-[var(--color-border-light)] hover:bg-[var(--color-border-light)] transition-colors flex items-center gap-2 {settingsStore.planModeEnabled ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-text-main)]'}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10M18.4 4.6l-4.4 4.4M22 12h-10M18.4 19.4l-4.4-4.4M12 22v-10M5.6 19.4l4.4-4.4M2 12h10M5.6 4.6l4.4 4.4"/></svg>{settingsStore.planModeEnabled ? 'Desativar Plano' : 'Criar Plano'}
              </button>
            </div>
          {/if}
        </div>
        <input type="file" multiple class="hidden" bind:this={file_input} onchange={handle_file_upload} />
        <textarea bind:value={input_value} onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handle_send(); } }} disabled={is_loading} placeholder={is_loading ? "Agente está trabalhando..." : "Peça algo ao agente..."} class="flex-1 bg-transparent border-none focus:outline-none text-sm min-h-[40px] max-h-[150px] py-2 px-2 resize-none leading-relaxed disabled:opacity-50" rows="1"></textarea>
        {#if is_loading}
          <button onclick={handle_stop} class="bg-[var(--color-status-error)] hover:opacity-90 text-white w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] transition-all shadow-md active:scale-90 shrink-0" title="Parar Agente">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
          </button>
        {:else}
          <button onclick={handle_send} disabled={(!input_value.trim() && attachments.length === 0) || !settingsStore.isConfigured} class="bg-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed text-white w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] transition-all shadow-md active:scale-90 shrink-0" title="Enviar (Enter)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
          </button>
        {/if}
      </div>
    </div>
    <div class="flex items-center justify-between px-2 mt-3">
      <div class="flex gap-2">
        <button class="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] font-semibold uppercase tracking-tighter flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Logs</button>
        <button onclick={clear_history} class="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] font-semibold uppercase tracking-tighter flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Limpar</button>
      </div>
      <p class="text-[9px] text-[var(--color-text-muted)] font-medium italic">Ultra Browser v0.1.0</p>
    </div>
  </footer>
</div>

<style>
  main::-webkit-scrollbar { width: 5px; }
  main::-webkit-scrollbar-track { background: transparent; }
  main::-webkit-scrollbar-thumb { background: var(--color-border-light); border-radius: 10px; }
  main::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
  textarea { scrollbar-width: none; }
  textarea::-webkit-scrollbar { display: none; }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  @keyframes slideInUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .animate-in { animation: slideInUp 0.2s ease-out forwards; }
</style>
