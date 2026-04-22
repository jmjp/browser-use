<script lang="ts">
  import { slide } from 'svelte/transition';

  interface Props {
    content: string;
    is_streaming?: boolean;
    initially_expanded?: boolean;
  }

  let { 
    content, 
    is_streaming = false,
    initially_expanded = true
  } = $props<Props>();

  let is_expanded = $state(initially_expanded);
</script>

<div class="mb-4 border-l-2 border-[var(--color-status-thinking)] pl-4 py-1 bg-blue-50/10 rounded-r-md">
  <button 
    onclick={() => is_expanded = !is_expanded}
    class="flex items-center gap-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors text-[11px] font-semibold cursor-pointer w-full text-left"
    aria-expanded={is_expanded}
  >
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="12" 
      height="12" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      stroke-width="3" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
      class="{is_expanded ? 'rotate-0' : '-rotate-90'} transition-transform duration-200"
    >
      <path d="m6 9 6 6 6-6"/>
    </svg>
    <span class="uppercase tracking-tighter italic {is_streaming ? 'animate-pulse text-[var(--color-status-thinking)]' : ''}">
      {is_streaming ? 'Raciocinando...' : 'Pensamento'}
    </span>
  </button>

  {#if is_expanded}
    <div 
      transition:slide={{ duration: 250 }} 
      class="mt-1.5 text-xs text-[var(--color-text-muted)] leading-relaxed italic whitespace-pre-wrap break-words border-t border-[var(--color-border-light)]/50 pt-2"
    >
      {content}
      {#if is_streaming}
        <span class="inline-block w-1 h-3 bg-[var(--color-status-thinking)] ml-0.5 animate-pulse align-middle"></span>
      {/if}
    </div>
  {/if}
</div>
