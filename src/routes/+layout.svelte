<script lang="ts">
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { page } from '$app/state';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { darkMode, setDarkMode } from '$lib/stores/theme.store';
	import { deviceInfo, getDeviceInfo, getOnboardingCompleted } from '$lib/stores/deviceInfo.store';
	import {
		setupKeyboardListeners,
		keyboardVisible,
		keyboardHeight,
		setupGlobalInputFocusScroll
	} from '$lib/utils/helpers/keyboard';
	import TopBar from '$lib/components/TopBar.svelte';
	import NavBar from '$lib/components/NavBar.svelte';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import '../app.css';

	const { children } = $props();

	// Control for showing top and bottom bars - can be overridden by child layouts
	let showTopBar = $state(true);
	let showBottomBar = $state(false); // Default to false, enabled in protected routes as needed
	let width = $state(375);
	let height = $state(window.innerHeight);
	let isLandingPage = $state(false);

	// Update layout based on current route
	$effect(() => {
		const path = page.url.pathname;
		// Determine if on landing page (homepage, how-it-works, etc.)
		isLandingPage = path === '/' || path === '/how-it-works' || path.startsWith('/auth');

		// Show top bar everywhere except specific routes that handle their own layout
		showTopBar = !path.includes('/onboarding');

		// Only show bottom bar in dashboard routes
		showBottomBar = path.includes('/dashboard');
	});

	$effect(() => {
		setDarkMode($darkMode);
	});

	// Initialize theme based on system preference
	// TODO: Properly handle the cleanup of the global input focus scroll listener
	onMount(async (): Promise<any> => {
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

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<main
	data-theme={$darkMode ? 'BitTasker-Dark' : 'BitTasker-Light'}
	id="main"
	class="flex max-h-[100dvh] min-h-[100dvh] flex-col overflow-hidden select-none"
>
	{#if showTopBar && ($deviceInfo?.platform !== 'web' || isLandingPage || width <= 768)}
		<TopBar />
	{/if}

	<div class="relative flex flex-1 flex-col overflow-auto">
		{#if $deviceInfo?.platform === 'web' && width > 768 && !isLandingPage}
			<TopBar />
			<div class="bg-base-200 flex flex-grow">
				{@render children()}
			</div>
		{:else}
			<div class="bg-base-200 flex flex-1 flex-col justify-between overflow-x-hidden border-2 border-red-500">
				{@render children()}
			</div>
		{/if}
		{#if !showBottomBar}
			<footer class="bg-base-300 text-base-content/70 py-4 text-center">
				<p>© {new Date().getFullYear()} BitTasker. All rights reserved.</p>
			</footer>
		{/if}
	</div>

	{#if showBottomBar && ($deviceInfo?.platform !== 'web' || width <= 768)}
		{#if $keyboardVisible}
			<!-- <div style="height: {$keyboardHeight}px"></div> -->
		{:else}
			<div class="pb-safe right-0 bottom-0 left-0 z-50">
				<BottomNavBar />
			</div>
		{/if}
	{/if}

	<Toast />
</main>
