<script lang="ts">
	import type { Locales } from '$lib/stores/i18n.store';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/stores/i18n.store';
	import { darkMode } from '$lib/stores/theme.store';
	import { setLocale } from '$lib/stores/i18n.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { showBackButton } from '$lib/stores/navigation.store';
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import 'iconify-icon';

	// Control drawer visibility
	let isDrawerOpen = $state(false);

	// Track if user is logged in
	let isLoggedIn = $state(false);

	// Track if device should use desktop layout
	let isDesktopLayout = $state(false);

	// Create a reference to the resize handler so we can remove it later
	let resizeHandler: (() => void) | null = null;

	// TODO: Sample user - replace with actual user data from your auth system
	let user = $state({
		name: 'John Doe',
		email: 'john@example.com',
		profileImage: null
	});

	// Languages supported by the app
	const languages: { code: Locales; name: string }[] = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' }
	];

	// Language switcher handler
	const handleLanguageChange = async (code: Locales) => {
		try {
			await setLocale(code);
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	// Determine layout based on device info and PWA status
	function checkLayoutMode() {
		if (typeof window === 'undefined') return;

		// Check if running as standalone PWA
		const isPWA =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true;

		// Check if device is mobile by screen size (width less than 768px is considered mobile)
		const isMobileSize = window.innerWidth < 768;

		// Check if user agent indicates mobile device
		const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			window.navigator.userAgent
		);

		// Use desktop layout only if:
		// 1. Platform is web AND
		// 2. Not in PWA mode AND
		// 3. Not on a mobile device/screen
		isDesktopLayout = $deviceInfo?.platform === 'web' && !isPWA && !isMobileSize && !isMobileDevice;

		// Remove existing resize listener if it exists
		if (resizeHandler) {
			window.removeEventListener('resize', resizeHandler);
		}

		// Create and add new resize listener
		resizeHandler = () => {
			const newIsMobileSize = window.innerWidth < 768;
			if (newIsMobileSize !== isMobileSize) {
				checkLayoutMode();
			}
		};

		window.addEventListener('resize', resizeHandler);
	}

	// Decide when user is logged in based on the current route and check layout mode
	$effect(() => {
		const path = page.url.pathname;

		// Determine if user is logged in based on path
		// This should be replaced with proper auth check
		isLoggedIn = path.startsWith('/dashboard');

		// Check layout mode whenever deviceInfo changes
		if ($deviceInfo) {
			checkLayoutMode();
		}
	});

	// Go back function for the back button
	function goBack() {
		console.log('going back')
		window.history.back();
	}

	// Toggle drawer
	function toggleDrawer() {
		isDrawerOpen = !isDrawerOpen;
	}

	// Close drawer
	function closeDrawer() {
		isDrawerOpen = false;
	}

	// Define hardcoded fallback translations for new keys
	// (These should eventually be added to your i18n translation files)
	const customTranslations: Record<string, string> = {
		'navbar.profile': 'Profile',
		'navbar.settings': 'Settings',
		'navbar.logout': 'Logout',
		'navbar.light_mode': 'Light Mode',
		'navbar.dark_mode': 'Dark Mode'
	};

	// Custom translation function that falls back to custom translations for missing keys
	function getTranslation(key: string): string {
		try {
			// Try to use the i18n translation first
			return $t(key as any);
		} catch {
			// If key doesn't exist, fall back to custom translations
			return customTranslations[key] || key;
		}
	}

	// Cleanup on component destroy
	onDestroy(() => {
		if (typeof window !== 'undefined' && resizeHandler) {
			window.removeEventListener('resize', resizeHandler);
		}
	});
</script>

<!-- Main TopBar component -->
<div class="navbar bg-base-100/80 border-base-300 pt-safe z-40 border-b backdrop-blur-sm">
	<div class="navbar-start">
		{#if isDesktopLayout || (!isLoggedIn && !$showBackButton)}
			<!-- Desktop or Mobile not logged in: BitTasker on the left -->
			<a href="/" class="btn btn-ghost text-xl normal-case">BitTasker</a>
		{:else if $showBackButton}
			<!-- Mobile: Back button when applicable -->
			<button class="btn btn-ghost btn-circle" onclick={goBack} aria-label="Go back">
				<iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon>
			</button>
		{:else if isLoggedIn}
			<!-- Mobile logged in: Hamburger menu that animates to X -->
			<button
				class="btn btn-ghost btn-circle relative"
				onclick={toggleDrawer}
				aria-label={isDrawerOpen ? 'Close menu' : 'Open menu'}
			>
				<div class="flex h-5 w-5 flex-col items-start justify-center">
					<span
						class="block h-0.5 w-5 bg-current transition-transform duration-300 ease-in-out"
						class:rotate-45={isDrawerOpen}
						class:translate-y-2={isDrawerOpen}
					></span>
					<span
						class="my-1 block h-0.5 w-3 place-self-start bg-current transition-opacity duration-300"
						class:opacity-0={isDrawerOpen}
					></span>
					<span
						class="block h-0.5 w-5 bg-current transition-transform duration-300 ease-in-out"
						class:-rotate-45={isDrawerOpen}
						class:-translate-y-1={isDrawerOpen}
					></span>
				</div>
			</button>
		{/if}
	</div>

	<div class="navbar-center">
		{#if isDesktopLayout}
			<!-- Desktop: Center menu -->
			<ul class="menu menu-horizontal px-1">
				<li><a href="/" class="hover:bg-base-200 rounded-lg">{$t('navbar.home')}</a></li>
				<li>
					<a href="/how-it-works" class="hover:bg-base-200 rounded-lg"
						>{$t('navbar.how_it_works')}</a
					>
				</li>
				<li>
					<details class="dropdown">
						<summary class="hover:bg-base-200 rounded-lg">{$t('navbar.language')}</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-50 w-52 p-2 shadow">
							{#each languages as { code, name }}
								<li>
									<button class="text-left" onclick={() => handleLanguageChange(code)}>
										{name}
									</button>
								</li>
							{/each}
						</ul>
					</details>
				</li>
			</ul>
		{:else if isLoggedIn && !$showBackButton}
			<!-- Mobile with logged in user: BitTasker in center -->
			<a href="/" class="btn btn-ghost text-xl normal-case">BitTasker</a>
		{/if}
	</div>

	<div class="navbar-end">
		{#if isLoggedIn}
			<!-- User is logged in: show profile or badge -->
			<div class="dropdown dropdown-end">
				<Avatar {user} onClick={() => goto('/dashboard/profile')} />
				<ul
					class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
				>
					<li><a href="/dashboard/profile">{getTranslation('navbar.profile')}</a></li>
					<li><a href="/dashboard/settings">{getTranslation('navbar.settings')}</a></li>
					<li><a href="/logout">{getTranslation('navbar.logout')}</a></li>
				</ul>
			</div>
		{:else}
			<!-- User is not logged in: show dark mode toggle, Login, and Signup buttons -->
			<label class="swap swap-rotate btn btn-ghost btn-circle mr-2">
				<input type="checkbox" checked={$darkMode} onchange={() => ($darkMode = !$darkMode)} />

				<!-- sun icon -->
				<svg
					class="swap-on mx-auto h-5 w-5 fill-current"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
				>
					<path
						d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
					/>
				</svg>

				<!-- moon icon -->
				<svg
					class="swap-off mx-auto h-5 w-5 fill-current"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
				>
					<path
						d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
					/>
				</svg>
			</label>
			
			<!-- Login and Signup buttons, replacing the Get Started button -->
			<div class="flex gap-2">
				<a href="/auth/login" class="btn btn-secondary">Login</a>
				<a href="/auth/signup" class="btn btn-primary">Signup</a>
			</div>
		{/if}
	</div>
</div>

<!-- Mobile Drawer -->
<Drawer isOpen={isDrawerOpen} onClose={closeDrawer} position="left" width="sm" isScrollable={true}>
	{#snippet children()}
		<ul class="menu w-full">
			<li><a href="/" onclick={closeDrawer}>{$t('navbar.home')}</a></li>
			<li><a href="/how-it-works" onclick={closeDrawer}>{$t('navbar.how_it_works')}</a></li>

			<!-- Language submenu -->
			<li>
				<details>
					<summary>{$t('navbar.language')}</summary>
					<ul>
						{#each languages as { code, name }}
							<li>
								<button
									onclick={() => {
										handleLanguageChange(code);
										closeDrawer();
									}}
								>
									{name}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</li>

			<!-- Dark mode toggle -->
			<li>
				<div class="flex items-center justify-between px-4 py-2">
					<span
						>{$darkMode
							? getTranslation('navbar.light_mode')
							: getTranslation('navbar.dark_mode')}</span
					>
					<label class="swap swap-rotate">
						<input type="checkbox" checked={$darkMode} onchange={() => ($darkMode = !$darkMode)} />

						<!-- sun icon -->
						<svg
							class="swap-on h-5 w-5 fill-current"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
						>
							<path
								d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
							/>
						</svg>

						<!-- moon icon -->
						<svg
							class="swap-off h-5 w-5 fill-current"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
						>
							<path
								d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
							/>
						</svg>
					</label>
				</div>
			</li>

			<!-- Additional menu items -->
			{#if isLoggedIn}
				<li class="menu-title pt-4">
					<span>Account</span>
				</li>
				<li>
					<a href="/dashboard/profile" onclick={closeDrawer}>{getTranslation('navbar.profile')}</a>
				</li>
				<li>
					<a href="/dashboard/settings" onclick={closeDrawer}>{getTranslation('navbar.settings')}</a
					>
				</li>
				<li><a href="/logout" onclick={closeDrawer}>{getTranslation('navbar.logout')}</a></li>
			{:else}
				<li class="mt-4 flex flex-col gap-2">
					<a href="/auth/login" class="btn btn-secondary w-full" onclick={closeDrawer}>
						Login
					</a>
					<a href="/auth/signup" class="btn btn-primary w-full" onclick={closeDrawer}>
						Signup
					</a>
				</li>
			{/if}
		</ul>
	{/snippet}
</Drawer>

<style>
	.pt-safe {
		padding-top: env(safe-area-inset-top, 0);
	}

	/* Improved center menu styling */
	.navbar-center .menu-horizontal {
		gap: 0.5rem;
	}

	.navbar-center .menu-horizontal li a,
	.navbar-center .menu-horizontal li summary {
		padding: 0.5rem 0.75rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}
</style>
