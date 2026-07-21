<script lang="ts">
	import { GoalEngine, type AutoApplyGoal, type GoalConfig, type CandidateProfile } from '$lib/goal-engine';
	import { getLLMAdapter } from '$lib/services/llm';
	import { onMount } from 'svelte';

	let skillsInput = 'Go, Svelte, PostgreSQL, Docker, AWS';
	let keywordsInput = 'golang, backend, software engineer, svelte';
	let maxApps = 10;
	let minScore = 6;
	let dryRun = true;
	let running = false;
	let log: string[] = [];
	let portal = 'gupy';
	let engine: GoalEngine | null = null;

	const profile: CandidateProfile = {
		name: 'João',
		skills: [],
		experience: '6+ anos como engenheiro de software, foco em Go e arquitetura hexagonal',
		target_roles: ['Software Engineer', 'Backend Engineer', 'Staff Engineer'],
		preferred_locations: ['São Paulo', 'Remoto'],
		work_models: ['remote', 'hybrid'],
	};

	onMount(() => {
		const llmConfig = {
			provider: 'deepseek' as const,
			apiKey: '',
			model: 'deepseek-v4-flash',
			baseUrl: 'https://api.deepseek.com/v1/chat/completions',
		};
		engine = new GoalEngine(llmConfig);
	});

	async function startAutoApply() {
		if (!engine) return;
		running = true;
		log = [];
		
		profile.skills = skillsInput.split(',').map(s => s.trim());
		
		const config: GoalConfig = {
			portals: portal.split(',').map(s => s.trim()),
			keywords: keywordsInput.split(',').map(s => s.trim()),
			locations: ['Remoto', 'São Paulo'],
			work_models: ['remote', 'hybrid'],
			max_applications: maxApps,
			min_score: minScore,
			dry_run: dryRun,
			profile,
		};

		const goal = await engine.createGoal('search_and_apply', 
			`Encontrar e aplicar em ${maxApps} vagas de ${keywordsInput}`, 
			config
		);

		log.push(`🚀 Goal criado: ${goal.objective}`);
		log.push(`📋 Perfil: ${profile.skills.join(', ')}`);
		log.push(dryRun ? '🔵 Modo DRY RUN — sem candidaturas reais' : '🔴 Modo REAL — vai candidatar de verdade');

		engine.runGoal(goal.id, (g) => {
			log.push(`[${new Date().toLocaleTimeString()}] ${g.progress.current_action}`);
			if (g.status === 'completed') {
				log.push(`✅ Goal completo! ${g.progress.jobs_applied} candidaturas, ${g.progress.jobs_found} vagas encontradas`);
				running = false;
			}
			if (g.status === 'failed') {
				log.push(`❌ Goal falhou: ${g.progress.current_action}`);
				running = false;
			}
		});
	}

	function stop() {
		running = false;
		log.push('🛑 Parado pelo usuário');
	}
</script>

<div class="p-6 max-w-4xl mx-auto">
	<h1 class="text-2xl font-bold mb-2">🤖 Auto-Apply Agent</h1>
	<p class="text-gray-500 mb-6">Agente persistente que busca e aplica em vagas até atingir a meta</p>

	<div class="grid grid-cols-2 gap-4 mb-6">
		<div class="space-y-3">
			<div>
				<label class="block text-sm font-medium mb-1">Skills (separadas por vírgula)</label>
				<input bind:value={skillsInput} class="w-full px-3 py-2 border rounded-lg text-sm" />
			</div>
			<div>
				<label class="block text-sm font-medium mb-1">Palavras-chave para busca</label>
				<input bind:value={keywordsInput} class="w-full px-3 py-2 border rounded-lg text-sm" />
			</div>
			<div>
				<label class="block text-sm font-medium mb-1">Portal(is)</label>
				<input bind:value={portal} class="w-full px-3 py-2 border rounded-lg text-sm" />
				<p class="text-xs text-gray-400 mt-1">gupy, linkedin, indeed, programathor</p>
			</div>
		</div>
		<div class="space-y-3">
			<div>
				<label class="block text-sm font-medium mb-1">Max candidaturas</label>
				<input type="number" bind:value={maxApps} class="w-full px-3 py-2 border rounded-lg text-sm" />
			</div>
			<div>
				<label class="block text-sm font-medium mb-1">Score mínimo</label>
				<input type="number" bind:value={minScore} min="1" max="10" class="w-full px-3 py-2 border rounded-lg text-sm" />
			</div>
			<div class="flex items-center gap-2 mt-4">
				<input type="checkbox" bind:checked={dryRun} id="dryrun" />
				<label for="dryrun" class="text-sm">Dry run (não aplicar de verdade)</label>
			</div>
		</div>
	</div>

	<div class="flex gap-2 mb-6">
		<button 
			on:click={startAutoApply}
			disabled={running}
			class="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700"
		>
			{running ? '⏳ Rodando...' : '▶ Iniciar Auto-Apply'}
		</button>
		<button 
			on:click={stop}
			disabled={!running}
			class="px-6 py-2 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-red-600"
		>
			⏹ Parar
		</button>
	</div>

	{#if log.length > 0}
		<div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs h-80 overflow-y-auto">
			{#each log as line}
				<div>{line}</div>
			{/each}
		</div>
	{/if}
</div>
