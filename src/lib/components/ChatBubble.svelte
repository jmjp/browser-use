<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    role: 'user' | 'assistant';
    children: Snippet;
    timestamp?: string;
  }

  let { 
    role = 'user', 
    children, 
    timestamp 
  }: Props = $props();
</script>

<div class="flex flex-col mb-4 w-full {role === 'user' ? 'items-end' : 'items-start'}">
  <div 
    class="max-w-[90%] px-4 py-3 {role === 'user' 
      ? 'bg-[var(--color-border-light)] text-[var(--color-text-main)] rounded-[var(--radius-xl)_var(--radius-xl)_var(--radius-sm)_var(--radius-xl)]' 
      : 'bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-main)] rounded-[var(--radius-xl)_var(--radius-xl)_var(--radius-xl)_var(--radius-sm)] shadow-[var(--shadow-sm)]'}"
  >
    <div class="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {@render children()}
    </div>
  </div>
  {#if timestamp}
    <span class="text-[10px] text-[var(--color-text-muted)] mt-1 px-2 uppercase tracking-wider font-medium">
      {timestamp}
    </span>
  {/if}
</div>

<style>
  /* Optional: any specific local styles */
</style>
