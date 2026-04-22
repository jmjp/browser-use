<script lang="ts">
	import { settingsStore, type Settings } from '$lib/stores/settings.svelte';
	import { onMount } from 'svelte';

	let localSettings = $state<Settings>({ ...settingsStore.settings });
	let saved = $state(false);

	const providerModels = {
		gemini: [
			'gemini-2.5-flash-lite',
			'gemini-3-flash-preview',
			'gemini-3.1-flash-lite-preview',
			'gemini-3.1-pro-preview'
		],
		anthropic: ['claude-4.6-sonnet', 'claude-4.7-sonnet'],
		openai: ['gpt-4o', 'gpt-5.0', 'gpt-5.1'],
		deepseek: ['deepseek-chat', 'deepseek-reasoner'],
		custom: []
	};

	async function handleSave() {
		await settingsStore.save(localSettings);
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	// Update default model when provider changes
	$effect(() => {
		const models = providerModels[localSettings.provider];
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
				{#each Object.keys(providerModels) as provider}
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

		<section class="space-y-4">
			<h2 class="text-xs font-bold tracking-widest text-[var(--color-text-muted)] uppercase">
				Modelo
			</h2>
			{#if localSettings.provider === 'custom'}
				<input
					type="text"
					bind:value={localSettings.model}
					placeholder="Ex: custom-model-v1"
					class="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-all focus:border-[var(--color-primary-soft)] focus:outline-none"
				/>
			{:else}
				<select
					bind:value={localSettings.model}
					class="w-full cursor-pointer appearance-none rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-all focus:border-[var(--color-primary-soft)] focus:outline-none"
				>
					{#each providerModels[localSettings.provider] as model}
						<option value={model}>{model}</option>
					{/each}
				</select>
			{/if}
		</section>
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
