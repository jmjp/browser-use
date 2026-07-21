<script lang="ts">
	import { settingsStore, type Settings } from '$lib/stores/settings.svelte';
	import { fetchAvailableModels } from '$lib/services/llm/models';

	let localSettings = $state<Settings>({ ...settingsStore.settings });
	let saved = $state(false);
	let loadingModels = $state(false);
	let fetchError = $state<string | null>(null);
	let fetchedModelsMap = $state<Record<string, string[]>>({});

	const defaultModels: Record<string, string[]> = {
		gemini: [
			'gemini-2.5-flash-lite',
			'gemini-3-flash-preview',
			'gemini-3.1-flash-lite-preview',
			'gemini-3.1-pro-preview'
		],
		anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
		openai: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o3-mini'],
		deepseek: ['deepseek-chat', 'deepseek-reasoner'],
		custom: []
	};

	let currentModels = $derived(
		fetchedModelsMap[localSettings.provider] || defaultModels[localSettings.provider] || []
	);

	let customModels = $derived(
		fetchedModelsMap['custom'] || []
	);

	async function loadModelsFromApi() {
		loadingModels = true;
		fetchError = null;
		try {
			const models = await fetchAvailableModels(
				localSettings.provider,
				localSettings.apiKey,
				localSettings.baseUrl
			);
			if (models.length === 0) {
				fetchError = 'Nenhum modelo retornado pela API.';
			} else {
				fetchedModelsMap = { ...fetchedModelsMap, [localSettings.provider]: models };
				if (!models.includes(localSettings.model)) {
					localSettings.model = models[0];
				}
			}
		} catch (err: any) {
			fetchError = err.message || 'Falha ao buscar modelos.';
		} finally {
			loadingModels = false;
		}
	}

	async function handleSave() {
		await settingsStore.save(localSettings);
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	// Update default model when provider changes
	$effect(() => {
		const models = currentModels;
		if (models.length > 0 && !models.includes(localSettings.model)) {
			localSettings.model = models[0];
		}
	});
</script>

<div class="flex h-screen w-full flex-col bg-[var(--color-background)]">
	<header
		class="flex items-center gap-4 border-b border-[var(--color-border-light)] bg-[var(--color-surface)] px-4 py-3"
	>
		<a
			href="/"
			class="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-border-light)]"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
			>
		</a>
		<h1 class="text-sm font-bold text-[var(--color-text-main)]">Configurações de IA</h1>
	</header>

	<main class="flex-1 space-y-8 overflow-y-auto p-6">
		<section class="space-y-4">
			<h2 class="text-xs font-bold tracking-widest text-[var(--color-text-muted)] uppercase">
				Provedor
			</h2>
			<div class="grid grid-cols-2 gap-2">
				{#each Object.keys(defaultModels) as provider}
					<button
						class="rounded-[var(--radius-lg)] border px-3 py-2.5 text-xs font-medium transition-all {localSettings.provider ===
						provider
							? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-md'
							: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-main)] hover:border-[var(--color-primary-soft)]'}"
						onclick={() => (localSettings.provider = provider as any)}
					>
						{provider === 'gemini'
							? 'Google'
							: provider.charAt(0).toUpperCase() + provider.slice(1)}
					</button>
				{/each}
			</div>
		</section>

		{#if localSettings.provider === 'custom'}
			<section class="space-y-4">
				<h2 class="text-xs font-bold tracking-widest text-[var(--color-text-muted)] uppercase">
					URL Base
				</h2>
				<input
					type="text"
					bind:value={localSettings.baseUrl}
					placeholder="https://api.example.com/v1"
					class="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-all focus:border-[var(--color-primary-soft)] focus:outline-none"
				/>
			</section>
		{/if}

		<section class="space-y-4">
			<h2 class="text-xs font-bold tracking-widest text-[var(--color-text-muted)] uppercase">
				Chave de API
			</h2>
			<input
				type="password"
				bind:value={localSettings.apiKey}
				placeholder="Insira sua chave de API..."
				class="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-all focus:border-[var(--color-primary-soft)] focus:outline-none"
			/>
		</section>

			<div class="flex items-center justify-between">
				<h2 class="text-xs font-bold tracking-widest text-[var(--color-text-muted)] uppercase">
					Modelo
				</h2>
				<button
					type="button"
					onclick={loadModelsFromApi}
					disabled={loadingModels}
					class="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-50"
				>
					{#if loadingModels}
						<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
						Buscando...
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
						Buscar da API
					{/if}
				</button>
			</div>

			{#if fetchError}
				<p class="text-xs text-red-500 font-medium">{fetchError}</p>
			{/if}

			{#if localSettings.provider === 'custom' && customModels.length === 0}
				<input
					type="text"
					bind:value={localSettings.model}
					placeholder="Ex: custom-model-v1"
					class="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-all focus:border-[var(--color-primary-soft)] focus:outline-none"
				/>
			{:else}
				<div class="relative">
					<select
						bind:value={localSettings.model}
						class="w-full cursor-pointer appearance-none rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-all focus:border-[var(--color-primary-soft)] focus:outline-none pr-8"
					>
						{#each currentModels as model}
							<option value={model}>{model}</option>
						{/each}
					</select>
					<div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
					</div>
				</div>
			{/if}
	</main>

	<footer class="border-t border-[var(--color-border-light)] bg-[var(--color-surface)] p-6">
		<button
			onclick={handleSave}
			class="flex w-full items-center justify-center gap-2 rounded-[var(--radius-xl)] bg-[var(--color-primary)] py-3 font-bold text-white shadow-lg transition-all hover:bg-[var(--color-primary-soft)] active:scale-95"
		>
			{#if saved}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
				>
				Salvo com Sucesso!
			{:else}
				Salvar Configurações
			{/if}
		</button>
	</footer>
</div>
