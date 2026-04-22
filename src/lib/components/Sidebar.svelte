<script lang="ts">
  import { historyStore } from '$lib/stores/history.svelte';
  import { slide, fade } from 'svelte/transition';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  function create_new() {
    historyStore.createNewSession();
    onClose();
  }

  function select_session(id: string) {
    historyStore.switchSession(id);
    onClose();
  }

  function delete_session(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (confirm('Deseja excluir esta conversa?')) {
      historyStore.deleteSession(id);
    }
  }

  function format_date(date: Date) {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
    aria-label="Fechar menu"
    transition:fade={{ duration: 200 }}
  ></div>

  <!-- Sidebar Content -->
  <aside 
    class="fixed top-0 left-0 h-full w-[260px] bg-[var(--color-surface)] border-r border-[var(--color-border-light)] z-50 shadow-2xl flex flex-col"
    transition:slide={{ axis: 'x', duration: 300 }}
  >
    <!-- Header -->
    <div class="p-4 border-b border-[var(--color-border-light)] flex items-center justify-between bg-[var(--color-background)]">
      <h2 class="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Histórico</h2>
      <button 
        onclick={onClose}
        class="p-1 hover:bg-[var(--color-border-light)] rounded-md text-[var(--color-text-muted)] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
    </div>

    <!-- New Chat Button -->
    <div class="p-3">
      <button 
        onclick={create_new}
        class="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-lg)] hover:bg-[var(--color-primary-soft)] transition-all shadow-md active:scale-95 text-sm font-bold"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7v14"/></svg>
        Nova Conversa
      </button>
    </div>

    <!-- Session List -->
    <div class="flex-1 overflow-y-auto px-2 space-y-1 py-2">
      {#each historyStore.sessions as session (session.id)}
        <div 
          class="w-full group flex items-center justify-between p-1 rounded-[var(--radius-lg)] transition-all
          {historyStore.currentSessionId === session.id 
            ? 'bg-[var(--color-primary-light)]' 
            : 'hover:bg-[var(--color-border-light)]'}"
        >
          <button 
            onclick={() => select_session(session.id)}
            class="flex-1 min-w-0 p-2 text-left"
          >
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-60 {historyStore.currentSessionId === session.id ? 'text-[var(--color-primary)]' : ''}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p class="text-xs font-bold truncate leading-tight {historyStore.currentSessionId === session.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-main)]'}">{session.title}</p>
            </div>
            <p class="text-[10px] text-[var(--color-text-muted)] mt-1 ml-5 font-medium">{format_date(session.last_updated)}</p>
          </button>
          
          <button 
            onclick={(e) => delete_session(session.id, e)}
            class="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 hover:text-red-500 rounded-md transition-all text-[var(--color-text-muted)] shrink-0"
            title="Excluir conversa"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      {/each}
    </div>

    <!-- Footer -->
    <div class="p-4 border-t border-[var(--color-border-light)] bg-[var(--color-background)]">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center text-[var(--color-primary)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <p class="text-[10px] font-bold text-[var(--color-text-main)]">Usuário Local</p>
          <p class="text-[8px] text-[var(--color-text-muted)] uppercase tracking-tighter">Ultra Browser v0.1</p>
        </div>
      </div>
    </div>
  </aside>
{/if}

<style>
  aside {
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
  }
  aside::-webkit-scrollbar {
    width: 4px;
  }
  aside::-webkit-scrollbar-thumb {
    background: var(--color-border-light);
    border-radius: 10px;
  }
</style>
