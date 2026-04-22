<script lang="ts">
  interface Props {
    name: string;
    params?: string | Record<string, any>;
    status: 'pending' | 'running' | 'success' | 'error';
    error?: string;
    result?: string;
  }

  let { 
    name, 
    params, 
    status = 'pending',
    error,
    result
  }: Props = $props();

  const status_color = {
    pending: 'var(--color-text-muted)',
    running: 'var(--color-primary)',
    success: 'var(--color-status-success)',
    error: 'var(--color-status-error)'
  };
</script>

<div 
  class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-lg)] border text-[11px] font-semibold transition-all duration-300 mb-2 mr-2
  {status === 'pending' ? 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)] opacity-60' : ''}
  {status === 'running' ? 'bg-[var(--color-primary-light)] border-[var(--color-primary-soft)] text-[var(--color-primary)]' : ''}
  {status === 'success' ? 'bg-[var(--color-status-success)]/5 border-[var(--color-status-success)]/30 text-[var(--color-status-success)]' : ''}
  {status === 'error' ? 'bg-[var(--color-status-error)]/5 border-[var(--color-status-error)]/30 text-[var(--color-status-error)]' : ''}
"
  role="status"
>
  {#if status === 'running'}
    <div 
      class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
      style="border-top-color: transparent"
    ></div>
  {:else if status === 'success'}
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  {:else if status === 'error'}
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="18" x2="18" y2="6"/>
    </svg>
  {:else}
    <div class="w-1.5 h-1.5 bg-current rounded-full"></div>
  {/if}

  <span class="font-mono tracking-tight">{name}</span>
  
  {#if params}
    <span class="opacity-60 text-[10px] truncate max-w-[120px] font-normal border-l border-current/20 pl-2">
      {typeof params === 'string' ? params : JSON.stringify(params)}
    </span>
  {/if}

  {#if result && status === 'success'}
    {@const parsedResult = (() => {
      try { return JSON.parse(result); } catch { return null; }
    })()}
    
    {#if name === 'screenshot' && parsedResult?.image}
      <div class="flex flex-col gap-2 p-1 border-l border-current/20 ml-2">
        <div class="relative group">
          <img 
            src={parsedResult.image} 
            alt="Screenshot" 
            class="max-w-[120px] rounded border border-current/20 shadow-sm transition-transform hover:scale-105"
          />
          <a 
            href={parsedResult.image} 
            download="screenshot.png"
            class="absolute bottom-1 right-1 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
            title="Download Screenshot"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    {:else}
      <span class="opacity-80 text-[10px] truncate max-w-[150px] font-normal border-l border-current/20 pl-2 italic">
        {typeof result === 'string' ? result : JSON.stringify(result)}
      </span>
    {/if}
  {/if}

  {#if error && status === 'error'}
    <span class="opacity-80 italic text-[10px] pl-1 border-l border-current/20 ml-2">
      {error}
    </span>
  {/if}
</div>
