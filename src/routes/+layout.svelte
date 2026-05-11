<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { settingsStore } from '$lib/stores/settings.svelte';

	let { children } = $props();

	$effect(() => {
		const theme = settingsStore.settings.theme || 'dark';
		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else if (theme === 'light') {
			document.documentElement.classList.remove('dark');
		} else {
			// System
			const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', isDark);
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="contents">
	{@render children()}
</div>
