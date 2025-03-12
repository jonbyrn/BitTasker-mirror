<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/NavBar.svelte';
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	const { children } = $props();

	// Theme state
	let theme = $state<string | null>(null);

	// Function to set theme
	async function setTheme(newTheme: string) {
		theme = newTheme;
		await Preferences.set({
			key: 'theme',
			value: newTheme
		});
		document.documentElement.setAttribute('data-theme', newTheme);
	}

	// Initialize theme based on system preference
	onMount(async () => {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const { value: savedTheme } = await Preferences.get({ key: 'theme' });

		if (savedTheme) {
			setTheme(savedTheme);
		} else {
			setTheme(prefersDark ? 'dark' : 'light');
		}

		// Listen for system theme changes
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
			const { value: currentTheme } = await Preferences.get({ key: 'theme' });
			if (!currentTheme) {
				setTheme(e.matches ? 'dark' : 'light');
			}
		});
	});
</script>

<main class="pt-16" data-theme={theme}>
	<NavBar {theme} {setTheme} />
	{@render children()}
</main>
