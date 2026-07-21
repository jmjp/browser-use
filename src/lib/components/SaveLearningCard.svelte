<script lang="ts">
	import { knowledgeStore, type KnowledgeMemory } from '$lib/stores/knowledge.svelte';

	interface Props {
		userTask?: string;
		stepsSummary?: string;
		toolsUsed?: string[];
		onClose?: () => void;
	}

	let {
		userTask = '',
		stepsSummary = '',
		toolsUsed = [],
		onClose = () => {}
	} = $props<Props>();

	let title = $state(userTask ? userTask.slice(0, 60) : 'Fluxo executado com sucesso');
	let summary = $state(stepsSummary || 'O agente concluiu a tarefa seguindo os passos observados.');
	let isSaved = $state(false);
	let isSaving = $state(false);

	async function handleSave() {
		if (!title.trim() || !summary.trim()) return;
		isSaving = true;
		try {
			await knowledgeStore.saveMemory({
				title,
				stepsSummary: summary,
				toolsUsed
			});
			isSaved = true;
			setTimeout(() => {
				onClose();
			}, 1500);
		} finally {
			isSaving = false;
		}
	}
</script>

<div
	class="my-3 rounded-[var(--radius-lg)] border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs shadow-sm transition-all"
>
	{#if isSaved}
		<div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold py-1">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
			Aprendizado salvo com sucesso! O agente usará esse conhecimento em futuras tarefas.
		</div>
	{:else}
		<div class="flex items-start justify-between gap-2 mb-2">
			<div class="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 4.24 4.24"/><path d="M2 18h12"/><path d="M10 22h4"/><path d="m19.07 10.93-4.24 4.24"/><path d="M22 18h-2"/></svg>
				<span>Deseja salvar este aprendizado para as próximas vezes?</span>
			</div>
			<button
				onclick={onClose}
				class="text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] p-0.5"
				title="Ignorar"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
			</button>
		</div>

		<p class="text-[var(--color-text-muted)] text-[11px] mb-3">
			Salvar o padrão executado ajudará a IA a não se perder e ir direto ao ponto da próxima vez que você pedir algo parecido.
		</p>

		<div class="space-y-2 mb-3">
			<div>
				<label class="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase mb-1">Título do Aprendizado</label>
				<input
					type="text"
					bind:value={title}
					class="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
				/>
			</div>
			<div>
				<label class="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase mb-1">Resumo das Ações / Dicas de Aprendizado</label>
				<textarea
					bind:value={summary}
					rows="2"
					class="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 resize-none"
				></textarea>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2">
			<button
				onclick={onClose}
				class="px-2.5 py-1 rounded-[var(--radius-md)] text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-border-light)]"
			>
				Agora não
			</button>
			<button
				onclick={handleSave}
				disabled={isSaving}
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-sm active:scale-95 transition-all disabled:opacity-50"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
				Salvar Aprendizado
			</button>
		</div>
	{/if}
</div>
