<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/NavBar.svelte';
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	const { children } = $props();
	import { darkMode, setDarkMode } from '$lib/states/theme';
	import { deviceInfo, getDeviceInfo, getOnboardingCompleted } from '$lib/states/deviceInfo';

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

		getDeviceInfo();
		getOnboardingCompleted();
	});
</script>

<main data-theme={$darkMode ? 'dustynight' : 'yellowsnow'} id="main">
	{#if $deviceInfo?.platform === 'web'}
		<NavBar />
	{/if}
	{@render children()}
</main>
