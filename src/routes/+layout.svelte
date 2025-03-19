<script lang="ts">
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { darkMode, setDarkMode } from '$lib/states/theme';
	import NavBar from '$lib/components/NavBar.svelte';
	import '../app.css';

	const { children } = $props();

	$effect(() => {
		setDarkMode($darkMode);
	});

	// Initialize theme based on system preference
	onMount(async () => {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const { value: savedDarkMode } = await Preferences.get({ key: 'darkMode' });

		if (savedDarkMode) {
			$darkMode = savedDarkMode === 'true';
		}

		// Listen for system theme changes
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
			const { value: changedDarkMode } = await Preferences.get({ key: 'darkMode' });
			if (!changedDarkMode) {
				$darkMode = e.matches;
			}
		});
	});
</script>

<main class="pt-16" data-theme={$darkMode ? 'dustynigh' : 'yellowsnow'}>
	<NavBar />
	{@render children()}
</main>
