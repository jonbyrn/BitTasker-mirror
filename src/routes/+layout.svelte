<script lang="ts">
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { darkMode, setDarkMode } from '$lib/stores/theme.store';
	import { deviceInfo, getDeviceInfo, getOnboardingCompleted } from '$lib/stores/deviceInfo.store';
	import {
		setupKeyboardListeners,
		keyboardVisible,
		keyboardHeight,
		setupGlobalInputFocusScroll
	} from '$lib/utils/helpers/keyboard';
	import NavBar from '$lib/components/NavBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import '../app.css';

	const { children } = $props();

	let width = $state(375);

	$effect(() => {
		setDarkMode($darkMode);
	});

	// Initialize theme based on system preference
	// TODO: Properly handle the cleanup of the global input focus scroll listener
	onMount(async () => {
		const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });

		if (savedDarkMode) {
			$darkMode = savedDarkMode === 'true';
		}

		// Listen for system theme changes
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
			const { value: changedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });
			if (!changedDarkMode) {
				$darkMode = e.matches;
			}
		});

		await getDeviceInfo();
		await getOnboardingCompleted();

		setupKeyboardListeners();
		const cleanup = setupGlobalInputFocusScroll();
		return cleanup;
	});
</script>

<svelte:window bind:innerWidth={width} />

<main data-theme={$darkMode ? 'dustynight' : 'yellowsnow'} id="main" class="select-none">
	{#if $deviceInfo?.platform === 'web' && width > 768}
		<NavBar />
	{/if}
	{@render children()}
	<Toast />
	<footer class="bg-base-300 text-base-content/70 py-4 text-center">
		<p>© {new Date().getFullYear()} BitTasker. All rights reserved.</p>
	</footer>
</main>
