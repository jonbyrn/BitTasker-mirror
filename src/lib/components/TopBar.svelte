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
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import DarkModeToggle from '$lib/components/DarkModeToggle.svelte';
	import 'iconify-icon';

	// Control drawer visibility
	let isDrawerOpen = $state(false);

	// Track if user is logged in
	let isLoggedIn = $derived($authState.isAuthenticated);

	// Defer non-critical operations
	const deferNonCriticalOperations = () => {
		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(() => {
				// Add click outside handler for dropdowns
				if (typeof document !== 'undefined') {
					document.addEventListener('click', handleClickOutside, { passive: true });
				}
			}, { timeout: 1000 });
		} else {
			// Fallback for browsers without requestIdleCallback
			setTimeout(() => {
				// Add click outside handler for dropdowns
				if (typeof document !== 'undefined') {
					document.addEventListener('click', handleClickOutside, { passive: true });
				}
			}, 100);
		}
	};

	onMount(async () => {
		// Defer non-critical operations
		deferNonCriticalOperations();
	});

	// Optimize body class management with debouncing
	let bodyClassTimeout: ReturnType<typeof setTimeout>;
	$effect(() => {
		clearTimeout(bodyClassTimeout);
		bodyClassTimeout = setTimeout(() => {
			if (typeof document !== 'undefined') {
				const body = document.body;
				if (!isLoggedIn) {
					body.classList.add('bottom-nav-active');
				} else {
					body.classList.remove('bottom-nav-active');
				}
			}
		}, 50); // Small debounce to prevent excessive updates
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

	// Cleanup on component destroy
	onDestroy(() => {
		clearTimeout(bodyClassTimeout);
		
		if (typeof window !== 'undefined') {
			// Remove click outside handler
			if (typeof document !== 'undefined') {
				document.removeEventListener('click', handleClickOutside);
			}
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

	// Function to close all dropdown menus - optimized with passive listeners
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

	// Handle dropdown summary clicks - optimized with passive listeners
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
	class="navbar bg-base-100/80 border-base-300 pt-safe sticky top-0 z-50 w-full border-b backdrop-blur-sm"
>
	<!-- Hide navbar-start on mobile -->
	<div class="navbar-start flex-1 sm:flex">
		{#if !isLoggedIn}
			<a href="/" class="block">
				<img
					src="/images/Logos/BitTasker-square-logo.svg"
					alt="BitTasker Logo"
					class="mx-auto block max-h-10"
					width="40"
					height="40"
					style="aspect-ratio: 1/1;"
				/>
			</a>
			<div class="flex md:hidden items-center">
				<LanguageDropdown onLanguageChange={closeDropdowns} />
				<DarkModeToggle />
			</div>
		{/if}
		{#if $showBackButton}
			<!-- Mobile: Back button when applicable -->
			<button class="btn btn-ghost btn-circle" onclick={goBack} aria-label={$t('navbar.back')}>
				<iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon>
			</button>
		{/if}
		{#if !$showBackButton && isLoggedIn}
			<!-- Mobile logged in: Hamburger menu that animates to X -->
			<button
				class="btn btn-ghost btn-circle relative md:hidden"
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

	<!-- Hide navbar-center on mobile and tablet -->
	<div class="navbar-center mx-auto hidden lg:flex">
		<ul class="menu menu-horizontal px-1">
			<li>
				<a href="/how-it-works" class="btn btn-ghost">{$t('footer.how_it_works')}</a>
			</li>
			<li>
				<details class="dropdown">
					<summary class="btn btn-ghost" onclick={handleDropdownClick}>{$t('footer.for_taskers')}</summary>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
						<li><a href="/dashboard/create-task" onclick={closeDropdowns}>{$t('footer.post_task')}</a></li>
						<li><a href="/tasker-fees" onclick={closeDropdowns}>{$t('footer.tasker_fees')}</a></li>
						<li><a href="/escrow" onclick={closeDropdowns}>{$t('footer.escrow')}</a></li>
						<li><a href="/faq" onclick={closeDropdowns}>{$t('footer.faq')}</a></li>
					</ul>
				</details>
			</li>
			<li>
				<details class="dropdown">
					<summary class="btn btn-ghost" onclick={handleDropdownClick}>{$t('footer.for_taskees')}</summary>
					<ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
						<li><a href="/dashboard/find-tasks" onclick={closeDropdowns}>{$t('footer.start_earning')}</a></li>
						<li><a href="/community-guidelines" onclick={closeDropdowns}>{$t('footer.community_guidelines')}</a></li>
						<li><a href="/taskee-fees" onclick={closeDropdowns}>{$t('footer.taskee_fees')}</a></li>
						<li><a href="/tasker-principles" onclick={closeDropdowns}>{$t('footer.tasker_principles')}</a></li>
						<li><a href="/faq" onclick={closeDropdowns}>{$t('footer.tasker_faq')}</a></li>
					</ul>
				</details>
			</li>
			<li>
				<details class="dropdown">
					<summary class="btn btn-ghost" onclick={handleDropdownClick}>{$t('footer.company')}</summary>
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
		</ul>
	</div>

	<!-- Navbar End: always contains dark mode and language controls -->
	<div class="navbar-end flex w-full flex-1 gap-1">
		<!-- Dark mode toggle and language dropdown -->
		<div class="hidden md:flex items-center">
			<DarkModeToggle />
			<LanguageDropdown onLanguageChange={closeDropdowns} />
		</div>
		<!-- login/signup or avatar -->
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

<!-- Mobile Drawer -->
<Drawer isOpen={isDrawerOpen} onClose={closeDrawer} position="left" width="80%" isScrollable={true}>
	{#snippet children()}
		<ul class="menu w-full">
			<!-- Dark mode toggle -->
			<li><DarkModeToggle /></li>

			<!-- Language submenu -->
			<li><LanguageDropdown onLanguageChange={closeDrawer} /></li>

			{#if isLoggedIn}
				<li>
					<a href="/dashboard/settings" onclick={closeDrawer} class="flex items-center gap-2">
						<iconify-icon icon="mdi:cog" width="20"></iconify-icon>
						{$t('navbar.settings')}
					</a>
				</li>
			{/if}

			<li class="divider"></li>

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

			<li class="divider"></li>

			<!-- Additional menu items -->

			{#if isLoggedIn}
				<li>
					<button onclick={logout} class="flex items-center gap-2">
						<iconify-icon icon="mdi:logout" width="20"></iconify-icon>
						{$t('navbar.logout')}
					</button>
				</li>
			{:else}
				<li class="mt-4 flex flex-col gap-2">
					<a href="/auth/login"
						class="btn btn-secondary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
						<iconify-icon icon="mdi:login" width="20"></iconify-icon>
						{$t('navbar.login')}
					</a>
					<a href="/auth/signup"
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
	/* Add bottom spacing when bottom nav is present */
	:global(body) {
		margin-bottom: 0;
	}

	/* Add bottom spacing for mobile logged-out users */
	:global(body.bottom-nav-active) {
		padding-bottom: 80px;
	}

	/* Remove bottom padding on large screens */
	@media (min-width: 1024px) {
		:global(body.bottom-nav-active) {
			padding-bottom: 0;
		}
	}
</style>
