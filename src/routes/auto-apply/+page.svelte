<script lang="ts">
	import { AutoApplyWorkflow, type WorkflowConfig, type WorkflowState } from '$lib/goal-engine';
	import { onDestroy } from 'svelte';

	let skillsInput = 'Go, Svelte, PostgreSQL, Docker, AWS';
	let keywordsInput = 'golang, backend, software engineer';
	let portalsInput = 'gupy, programathor';
	let maxApps = 5;
	let minScore = 6;
	let dryRun = true;
	let apiKey = $state('');
	let running = false;
	let wf: AutoApplyWorkflow | null = null;
	let state = $state<WorkflowState | null>(null);

	function start() {
		running = true;
		const cfg: WorkflowConfig = {
			portals: portalsInput.split(',').map(s => s.trim()),
			keywords: keywordsInput.split(',').map(s => s.trim()),
			maxApps,
			minScore,
			dryRun,
			apiKey,
			model: 'deepseek-v4-flash',
			baseUrl: 'https://api.deepseek.com/v1/chat/completions',
			profile: {
				skills: skillsInput.split(',').map(s => s.trim()),
				experience: '6+ anos como engenheiro de software, Go e arquitetura hexagonal',
				targetRoles: ['Software Engineer', 'Backend Engineer'],
				workModes: ['remote', 'hybrid'],
			},
		};

		wf = new AutoApplyWorkflow(cfg);
		wf.start((s) => { state = s; if (s.status !== 'running') running = false; });
	}

	function stop() {
		wf?.cancel();
		running = false;
	}

	onDestroy(() => wf?.cancel());

	const lastLines = $derived(state?.log?.slice(-30) || []);
</script>

<div class="p-6 max-w-4xl mx-auto">
	<h1 class="text-2xl font-bold mb-1">🤖 Auto-Apply Workflow</h1>
	<p class="text-gray-500 mb-6 text-sm">Workflow determinístico: busca → pontua → aplica → repete</p>

	<div class="grid grid-cols-2 gap-6 mb-6">
		<div class="space-y-4">
			<div>
				<label class="block text-xs font-medium text-gray-600 mb-1">Skills</label>
				<input bind:value={skillsInput} class="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-600 mb-1">Palavras-chave</label>
				<input bind:value={keywordsInput} class="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-600 mb-1">Portais</label>
				<input bind:value={portalsInput} class="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
				<p class="text-xs text-gray-400 mt-1">gupy, linkedin, indeed, programathor, geekhunter, catho, infojobs</p>
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-600 mb-1">DeepSeek API Key</label>
				<input bind:value={apiKey} type="password" placeholder="sk-..." class="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
			</div>
		</div>
		<div class="space-y-4">
			<div>
				<label class="block text-xs font-medium text-gray-600 mb-1">Max candidaturas</label>
				<input type="number" bind:value={maxApps} min="1" max="50" class="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-600 mb-1">Score mínimo</label>
				<input type="number" bind:value={minScore} min="1" max="10" class="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
			</div>
			<label class="flex items-center gap-2 mt-4">
				<input type="checkbox" bind:checked={dryRun} />
				<span class="text-sm">Dry run</span>
			</label>
		</div>
	</div>

	<div class="flex gap-3 mb-4">
		<button on:click={start} disabled={running || !apiKey}
			class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-blue-700 text-sm">
			{running ? '⏳ Rodando...' : '▶ Iniciar'}
		</button>
		<button on:click={stop} disabled={!running}
			class="px-6 py-2.5 bg-red-500 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-red-600 text-sm">
			⏹ Parar
		</button>
	</div>

	{#if state}
		<div class="grid grid-cols-4 gap-3 mb-4 text-center text-sm">
			<div class="bg-blue-50 p-2 rounded font-semibold">{state.found} encontradas</div>
			<div class="bg-yellow-50 p-2 rounded font-semibold">{state.scored} analisadas</div>
			<div class="bg-green-50 p-2 rounded font-semibold">{state.applied} aplicadas</div>
			<div class="bg-red-50 p-2 rounded font-semibold">{state.failed} falhas</div>
		</div>
		<div class="mb-4 text-sm">{state.step}</div>
	{/if}

	{#if lastLines.length > 0}
		<div class="bg-gray-900 text-green-300 p-4 rounded-lg font-mono text-xs leading-5 h-80 overflow-y-auto">
			{#each lastLines as line}
				<div>{line}</div>
			{/each}
		</div>
	{/if}
</div>
