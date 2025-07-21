<script lang="ts">
	import type { Locales } from '$lib/stores/i18n.store';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/user.store';
	import { darkMode } from '$lib/stores/theme.store';
	import { t, locale, setLocale, LANGUAGES, getCurrentLanguageFlag } from '$lib/stores/i18n.store';
	import { authState } from '$lib/stores/auth.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { showBackButton } from '$lib/stores/navigation.store';
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import 'iconify-icon';

	// Control drawer visibility
	let isDrawerOpen = $state(false);

	// Track if user is logged in
	let isLoggedIn = $derived($authState.isAuthenticated);

	// Track if device should use desktop layout
	let isDesktopLayout = $state(false);

	// Create a reference to the resize handler so we can remove it later
	let resizeHandler: (() => void) | null = null;

	// Language switcher handler
	const handleLanguageChange = async (code: Locales) => {
		try {
			await setLocale(code);
			closeDropdowns(); // Close dropdown after language change
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	onMount(async () => {
		// Add click outside handler for dropdowns
		if (typeof document !== 'undefined') {
			document.addEventListener('click', handleClickOutside);
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

	// Add body class for bottom navigation spacing
	$effect(() => {
		if (typeof document !== 'undefined') {
			const body = document.body;
			if (!isLoggedIn && !isDesktopLayout) {
				body.classList.add('bottom-nav-active');
			} else {
				body.classList.remove('bottom-nav-active');
			}
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

		// Remove click outside handler
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleClickOutside);
		}

		// Remove bottom nav class
		if (typeof document !== 'undefined') {
			document.body.classList.remove('bottom-nav-active');
		}
	});

	async function logout() {
		closeDrawer();
		await authState.logout();
		goto('/');
	}

	// Function to close all dropdown menus
	function closeDropdowns() {
		// Close all details elements (dropdowns)
		const dropdowns = document.querySelectorAll('details[open]');
		dropdowns.forEach((dropdown) => {
			dropdown.removeAttribute('open');
		});
	}

	// Function to close other dropdown menus except the current one
	function closeOtherDropdowns(currentDropdown: HTMLDetailsElement) {
		const dropdowns = document.querySelectorAll('details[open]');
		dropdowns.forEach((dropdown) => {
			if (dropdown !== currentDropdown) {
				dropdown.removeAttribute('open');
			}
		});
	}

	// Handle dropdown summary clicks
	function handleDropdownClick(event: MouseEvent) {
		const summary = event.currentTarget as HTMLElement;
		const dropdown = summary.closest('details') as HTMLDetailsElement;

		// Close other dropdowns when this one is about to open
		if (dropdown && !dropdown.hasAttribute('open')) {
			closeOtherDropdowns(dropdown);
		}
	}

	// Handle clicks outside dropdowns to close them
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;

		// Check if click is outside any dropdown
		const isInsideDropdown = target.closest('details.dropdown');

		if (!isInsideDropdown) {
			closeDropdowns();
		}
	}
</script>

<!-- Main TopBar component -->
<div
	class="navbar bg-base-100/80 border-base-300 pt-safe sticky top-0 z-50 w-full border-b backdrop-blur-sm {isDesktopLayout
		? 'fixed top-0 right-0 left-0'
		: ''}"
>
	<!-- Hide navbar-start on mobile -->
	<div class="navbar-start flex-1 sm:flex {isLoggedIn ? '' : 'hidden'}">
		{#if isDesktopLayout || (!isLoggedIn && !$showBackButton)}
			<a href="/">
				<img
					src="/images/Logos/BitTasker-square-logo.svg"
					alt="BitTasker Logo"
					class="mx-auto block max-h-10"
				/>
			</a>
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

	<!-- Hide navbar-center on mobile -->
	<div class="navbar-center mx-auto hidden lg:flex">
		<ul class="menu menu-horizontal px-1">
			<li>
				<a href="/how-it-works" class="btn btn-ghost">{$t('footer.how_it_works')}</a>
			</li>
			<li>
				<details class="dropdown">
					<summary class="btn btn-ghost" onclick={handleDropdownClick}
						>{$t('footer.for_taskers')}</summary
					>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
						<li>
							<a href="/dashboard/create-task" onclick={closeDropdowns}>{$t('footer.post_task')}</a>
						</li>
						<li>
							<a href="/how-it-works" onclick={closeDropdowns}>{$t('footer.how_it_works')}</a>
						</li>
						<li><a href="/tasker-fees" onclick={closeDropdowns}>{$t('footer.tasker_fees')}</a></li>
						<li><a href="/escrow" onclick={closeDropdowns}>{$t('footer.escrow')}</a></li>
						<li><a href="/faq" onclick={closeDropdowns}>{$t('footer.faq')}</a></li>
					</ul>
				</details>
			</li>
			<li>
				<details class="dropdown">
					<summary class="btn btn-ghost" onclick={handleDropdownClick}
						>{$t('footer.for_taskees')}</summary
					>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
						<li>
							<a href="/dashboard/find-tasks" onclick={closeDropdowns}
								>{$t('footer.start_earning')}</a
							>
						</li>
						<li>
							<a href="/community-guidelines" onclick={closeDropdowns}
								>{$t('footer.community_guidelines')}</a
							>
						</li>
						<li><a href="/taskee-fees" onclick={closeDropdowns}>{$t('footer.taskee_fees')}</a></li>
						<li>
							<a href="/tasker-principles" onclick={closeDropdowns}
								>{$t('footer.tasker_principles')}</a
							>
						</li>
						<li><a href="/faq" onclick={closeDropdowns}>{$t('footer.tasker_faq')}</a></li>
					</ul>
				</details>
			</li>
			<li>
				<details class="dropdown">
					<summary class="btn btn-ghost" onclick={handleDropdownClick}
						>{$t('footer.company')}</summary
					>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
						<li><a href="/about" onclick={closeDropdowns}>{$t('footer.about_us')}</a></li>
						<li><a href="/security" onclick={closeDropdowns}>{$t('footer.security')}</a></li>
						<li><a href="/careers" onclick={closeDropdowns}>{$t('footer.careers')}</a></li>
						<li><a href="/press" onclick={closeDropdowns}>{$t('footer.press')}</a></li>
						<li><a href="/terms" onclick={closeDropdowns}>{$t('footer.terms')}</a></li>
						<li><a href="/privacy" onclick={closeDropdowns}>{$t('footer.privacy')}</a></li>
						<li><a href="/contact" onclick={closeDropdowns}>{$t('footer.contact')}</a></li>
					</ul>
				</details>
			</li>
			<!-- Language dropdown with flags -->
			<li class="tooltip tooltip-bottom hidden lg:list-item">
				<details class="dropdown">
					<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
						<iconify-icon icon={getCurrentLanguageFlag($locale)} width="20" height="15"
						></iconify-icon>
						<span class="font-medium uppercase">{$locale}</span>
					</summary>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
						{#each LANGUAGES as { code, name, flag }}
							<li>
								<button
									class="flex w-full items-center gap-2 text-left"
									onclick={() => handleLanguageChange(code)}
									class:bg-base-200={code === $locale}
								>
									<iconify-icon icon={flag} width="20" height="15"></iconify-icon>
									<span>{name}</span>
									{#if code === $locale}
										<iconify-icon icon="mdi:check" class="text-primary ml-auto" width="16"
										></iconify-icon>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</li>
		</ul>
	</div>

	<!-- Navbar End: always contains dark mode and language controls -->
	<div class="navbar-start flex w-full flex-1 items-center justify-between gap-2">
		<!-- Left group: dark mode + home + language -->
		<div class="flex items-center">
			<!-- Language dropdown (mobile only) -->
			<ul class="menu m-0 block bg-transparent p-0 shadow-none lg:hidden">
				<li class="tooltip tooltip-bottom">
					<details class="dropdown">
						<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
							<iconify-icon icon={getCurrentLanguageFlag($locale)} width="20" height="15"
							></iconify-icon>
							<span class="font-medium uppercase">{$locale}</span>
						</summary>
						<ul
							class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
						>
							{#each LANGUAGES as { code, name, flag }}
								<li>
									<button
										class="flex w-full items-center gap-2 text-left"
										onclick={() => handleLanguageChange(code)}
										class:bg-base-200={code === $locale}
									>
										<iconify-icon icon={flag} width="20" height="15"></iconify-icon>
										<span>{name}</span>
										{#if code === $locale}
											<iconify-icon icon="mdi:check" class="text-primary ml-auto" width="16"
											></iconify-icon>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					</details>
				</li>
			</ul>
		</div>

		<!-- Right section: login/signup or avatar -->
		<div class="flex items-center gap-2">
			<label
				class="swap swap-rotate btn btn-xs sm:btn-sm btn-ghost btn-circle tooltip tooltip-bottom"
				data-tip={$darkMode ? $t('navbar.tooltip.dark_mode') : $t('navbar.tooltip.light_mode')}
			>
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
			{#if !isLoggedIn}
				<a href="/auth/login" class="btn btn-sm sm:btn-md btn-secondary">{$t('navbar.login')}</a>
				<a href="/auth/signup" class="btn btn-sm sm:btn-md btn-primary">{$t('navbar.signup')}</a>
			{:else}
				<Avatar
					user={{ name: $user?.name, picture: $user?.picture }}
					onClick={() => goto('/dashboard/profile')}
				/>
			{/if}
		</div>
	</div>
</div>

<!-- Mobile Drawer -->
<Drawer isOpen={isDrawerOpen} onClose={closeDrawer} position="left" width="80%" isScrollable={true}>
	{#snippet children()}
		<ul class="menu w-full">
			<!-- Dark mode toggle -->
			<li>
				<button
					class="tooltip tooltip-bottom flex items-center justify-between gap-2 py-2"
					data-tip={$darkMode ? $t('navbar.tooltip.dark_mode') : $t('navbar.tooltip.light_mode')}
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
					<summary class="flex items-center gap-2">
						<iconify-icon icon={getCurrentLanguageFlag($locale)} width="20" height="15"
						></iconify-icon>
						{$t('navbar.language')}
					</summary>
					<ul>
						{#each LANGUAGES as { code, name, flag }}
							<li>
								<button
									class="flex w-full items-center gap-2 text-left"
									class:bg-base-200={code === $locale}
									onclick={() => {
										handleLanguageChange(code);
										closeDrawer();
									}}
								>
									<span class="text-lg">{flag}</span>
									<span>{name}</span>
									{#if code === $locale}
										<iconify-icon icon="mdi:check" class="text-primary ml-auto" width="16"
										></iconify-icon>
									{/if}
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
				<a href="/terms" onclick={closeDrawer} class="flex items-center gap-2">
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
						{$t('navbar.login')}
					</a>
					<a
						href="/auth/signup"
						class="btn btn-primary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
						<iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
						{$t('navbar.signup')}
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

	.navbar-center .menu-horizontal li a {
		padding: 0.5rem 0.75rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	/* Add bottom spacing when bottom nav is present */
	:global(body) {
		margin-bottom: 0;
	}

	/* Add bottom spacing for mobile logged-out users */
	:global(body.bottom-nav-active) {
		padding-bottom: 80px;
	}
</style>
