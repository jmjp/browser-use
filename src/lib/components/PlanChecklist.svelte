<script lang="ts">
  import { marked } from 'marked';
  import { onMount } from 'svelte';

  interface Props {
    content: string;
    is_streaming?: boolean;
    onToggle?: (index: number, done: boolean) => void;
    tasks?: { text: string; done: boolean }[];
  }

  let { content, is_streaming = false, onToggle, tasks = [] }: Props = $props();

  // Se tasks estiver vazio, tenta extrair do Markdown content
  let localTasks = $state(tasks.length > 0 ? tasks : extractTasks(content));

  function extractTasks(md: string) {
    const listItems: { text: string; done: boolean }[] = [];
    const lines = md.split('\n');
    
    for (const line of lines) {
      // Procura por itens de lista do tipo - [ ] ou * [ ] ou 1. [ ]
      const match = line.match(/^[\s]*[-*1.]\s(\[([ xX])\]\s)?(.*)/);
      if (match) {
        const isCheckbox = match[2] !== undefined;
        const isChecked = match[2] === 'x' || match[2] === 'X';
        const text = match[3].trim();
        if (text) {
          listItems.push({ text, done: isChecked });
        }
      }
    }
    return listItems;
  }

  $effect(() => {
    if (!is_streaming && tasks.length === 0) {
      localTasks = extractTasks(content);
    }
  });

  function toggle(index: number) {
    localTasks[index].done = !localTasks[index].done;
    if (onToggle) onToggle(index, localTasks[index].done);
  }
</script>

<div class="space-y-3 p-4 bg-[var(--color-primary-light)] border border-[var(--color-primary-soft)] rounded-[var(--radius-lg)] shadow-inner">
  <div class="flex items-center gap-2 mb-2">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--color-primary)]"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
    <h3 class="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest">Plano de Execução</h3>
  </div>

  <div class="space-y-2">
    {#each localTasks as task, i}
      <label class="flex items-start gap-3 p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface)] transition-all cursor-pointer group">
        <input 
          type="checkbox" 
          checked={task.done} 
          onchange={() => toggle(i)}
          class="mt-1 w-4 h-4 rounded-[var(--radius-sm)] border-[var(--color-primary-soft)] text-[var(--color-primary)] focus:ring-[var(--color-primary-soft)]"
        />
        <span class="text-sm {task.done ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-main)]'} group-hover:text-[var(--color-primary)] transition-colors leading-relaxed">
          {task.text}
        </span>
      </label>
    {/each}
    
    {#if localTasks.length === 0}
      <p class="text-xs italic text-[var(--color-text-muted)] px-2">Analisando passos do plano...</p>
    {/if}
  </div>

  {#if is_streaming}
    <div class="flex items-center gap-2 px-2 mt-4 animate-pulse">
      <div class="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full"></div>
      <span class="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-tighter">Gerando Plano...</span>
    </div>
  {/if}
</div>
