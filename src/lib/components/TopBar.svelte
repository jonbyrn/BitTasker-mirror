<script lang="ts">
	import type { Locales } from '$lib/stores/i18n.store';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/stores/i18n.store';
	import { user } from '$lib/stores/user.store';
	import { darkMode } from '$lib/stores/theme.store';
	import { setLocale } from '$lib/stores/i18n.store';
	import { authState } from '$lib/stores/auth.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { showBackButton } from '$lib/stores/navigation.store';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { profileStore } from '$lib/stores/profile.store';
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import 'iconify-icon';

	// Languages supported by the app
	const languages: { code: Locales; name: string }[] = [
		{ code: 'en', name: $t('navbar.language.english') },
		{ code: 'es', name: $t('navbar.language.spanish') }
	];

	// Control drawer visibility
	let isDrawerOpen = $state(false);

	// Track if user is logged in
	let isLoggedIn = $derived($authState.isAuthenticated);

	// Track if device should use desktop layout
	let isDesktopLayout = $state(false);

	// Create a reference to the resize handler so we can remove it later
	let resizeHandler: (() => void) | null = null;

	let profileImage = $state(null);
	let subscription: { close: () => void } | null = null;

	// Language switcher handler
	const handleLanguageChange = async (code: Locales) => {
		try {
			await setLocale(code);
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	// Function to handle profile image events
	function handleProfileImageEvent(event: any) {
		try {
			const images = JSON.parse(event.content);
			if (images.length > 0) {
				profileImage = images[0].url;
			} else {
				profileImage = null;
			}
		} catch (error) {
			console.error('Failed to parse profile image event:', error);
			profileImage = null;
		}
	}

	// Define relay URLs with fallbacks
	const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean); // Remove any undefined values

	// Function to setup profile image subscription
	async function setupProfileImageSubscription() {
		try {
			if (RELAYS.length === 0) {
				throw new Error('No valid relay URLs available');
			}

			const npub = await getNpub();
			if (!npub) return;

			const filter = {
				authors: [npub],
				kinds: [30063],
				'#d': ['profile-images']
			};

			// TODO: To be replaced with user data from nostr - use user.store.ts
			// Subscribe to future updates
			subscription = profileStore.pool.subscribe(RELAYS, filter, {
				onevent(event) {
					handleProfileImageEvent(event);
				}
			});
		} catch (error) {
			console.error('Failed to setup profile image subscription:', error);
		}
	}

	onMount(async () => {
		if ($authState.isAuthenticated) {
			await setupProfileImageSubscription();
		}
	});

	$effect(() => {
		if ($authState.isAuthenticated) {
			setupProfileImageSubscription();
		} else {
			profileImage = null;
			if (subscription) {
				subscription.close();
				subscription = null;
			}
		}
	});

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
		// Check layout mode whenever deviceInfo changes
		if ($deviceInfo) {
			checkLayoutMode();
		}
	});

	// Go back function for the back button
	function goBack() {
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
		if (subscription) {
			subscription.close();
		}
	});

	async function logout() {
		closeDrawer();
		await authState.logout();
		goto('/');
	}
</script>

<!-- Main TopBar component -->
<div class="navbar bg-base-100/80 border-base-300 pt-safe z-40 w-full border-b backdrop-blur-sm">
	<div class="navbar-start">
		{#if isDesktopLayout || (!isLoggedIn && !$showBackButton)}
			<!-- Desktop or Mobile not logged in: BitTasker on the left -->
			<a href="/" class="btn btn-ghost text-xl normal-case">BitTasker</a>
		{:else if $showBackButton}
			<!-- Mobile: Back button when applicable -->
			<button class="btn btn-ghost btn-circle" onclick={goBack} aria-label={$t('navbar.back')}>
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
			<Avatar
				user={{ name: $user?.name, profileImage }}
				onClick={() => goto('/dashboard/profile')}
			/>
		{:else}
			<!-- Login and Signup buttons, replacing the Get Started button -->
			<div class="flex w-full items-center justify-end gap-2">
				<!-- User is not logged in: show dark mode toggle, Login, and Signup buttons -->
				<label class="swap swap-rotate btn btn-xs sm:btn-sm btn-ghost btn-circle">
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
				<a href="/auth/login" class="btn btn-sm sm:btn-md btn-secondary">Login</a>
				<a href="/auth/signup" class="btn btn-sm sm:btn-md btn-primary">Sign up</a>
			</div>
		{/if}
	</div>
</div>

<!-- Mobile Drawer -->
<Drawer isOpen={isDrawerOpen} onClose={closeDrawer} position="left" width="80%" isScrollable={true}>
	{#snippet children()}
		<ul class="menu w-full">
			<!-- Dark mode toggle -->
			<li>
				<button
					class="flex items-center justify-between gap-2 py-2"
					onclick={() => ($darkMode = !$darkMode)}
				>
					<span class="flex items-center gap-2">
						<iconify-icon
							icon={$darkMode ? 'mdi:white-balance-sunny' : 'mdi:weather-night'}
							width="20"
						></iconify-icon>
						{$darkMode ? getTranslation('navbar.light_mode') : getTranslation('navbar.dark_mode')}
					</span>
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
				</button>
			</li>

			<!-- Language submenu -->
			<li>
				<details class="w-[98%]">
					<summary>
						<iconify-icon icon="mdi:translate" width="20"></iconify-icon>
						{$t('navbar.language')}
					</summary>
					<ul>
						{#each languages as { code, name }}
							<li>
								<button
									class="flex items-center gap-2"
									onclick={() => {
										handleLanguageChange(code);
										closeDrawer();
									}}
								>
									<iconify-icon icon="mdi:translate" width="18"></iconify-icon>
									{name}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</li>

			{#if isLoggedIn}
				<li>
					<a href="/dashboard/settings" onclick={closeDrawer} class="flex items-center gap-2">
						<iconify-icon icon="mdi:cog" width="20"></iconify-icon>
						{getTranslation('navbar.settings')}
					</a>
				</li>
			{/if}

			<div class="divider"></div>

			<li>
				<a href="/" onclick={closeDrawer} class="flex items-center gap-2">
					<iconify-icon icon="mdi:home" width="20"></iconify-icon>
					{$t('navbar.home')}
				</a>
			</li>
			<li>
				<a href="/how-it-works" onclick={closeDrawer} class="flex items-center gap-2">
					<iconify-icon icon="mdi:help-circle-outline" width="20"></iconify-icon>
					{$t('navbar.how_it_works')}
				</a>
			</li>
			<li>
				<a href="/terms-and-conditions" onclick={closeDrawer} class="flex items-center gap-2">
					<iconify-icon icon="mdi:file-document-outline" width="20"></iconify-icon>
					{$t('navbar.terms_and_conditions')}
				</a>
			</li>

			<div class="divider"></div>

			<!-- Additional menu items -->

			{#if isLoggedIn}
				<li>
					<button onclick={logout} class="flex items-center gap-2">
						<iconify-icon icon="mdi:logout" width="20"></iconify-icon>
						{getTranslation('navbar.logout')}
					</button>
				</li>
			{:else}
				<li class="mt-4 flex flex-col gap-2">
					<a
						href="/auth/login"
						class="btn btn-secondary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
						<iconify-icon icon="mdi:login" width="20"></iconify-icon>
						Login
					</a>
					<a
						href="/auth/signup"
						class="btn btn-primary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
						<iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
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
