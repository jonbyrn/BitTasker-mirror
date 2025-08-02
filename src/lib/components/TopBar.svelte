<script lang="ts">
	import type { Locales } from '$lib/stores/i18n.store';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/stores/i18n.store';
	import { authState } from '$lib/stores/auth.store';
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
		<a href={isLoggedIn ? '/dashboard' : '/'} class="block">
			<img
				src="/images/Logos/BitTasker-square-logo.svg"
				alt="BitTasker Logo"
				class="mx-auto block max-h-10"
				width="40"
				height="40"
				style="aspect-ratio: 1/1;"
			/>
		</a>
		<LanguageDropdown onLanguageChange={closeDropdowns} />
		<!-- {#if !isLoggedIn}
			<div class="flex md:hidden items-center">
				
				<DarkModeToggle />
			</div>
		{/if} -->
		<!-- g{#if $showBackButton}
			<!-- Mobile: Back button when applicable --
			<button class="btn btn-ghost btn-circle" onclick={goBack} aria-label={$t('navbar.back')}>
				<iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon>
			</button>
		{/if}
		{#if !$showBackButton && isLoggedIn}
			<!-- Mobile logged in: Hamburger menu that animates to X --
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
		{/if} -->
	</div>

	<!-- Hide navbar-center on mobile and tablet -->
	<div class="navbar-center mx-auto hidden lg:flex">
		<ul class="menu menu-horizontal px-1">
			{#if isLoggedIn}
				<!-- My Account -->
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
							<iconify-icon icon="mdi:account-circle" width="20" class="text-primary"></iconify-icon>
							<span>{$t('navbar.my_account')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[12rem] w-auto p-2 shadow-sm whitespace-nowrap">
							<li><a href="/dashboard/messages" onclick={closeDropdowns}><iconify-icon icon="mdi:message" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.messages')}</span></a></li>
							<li><a href="/dashboard/wallet" onclick={closeDropdowns}><iconify-icon icon="mdi:wallet" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.wallet')}</span></a></li>
							<li><a href="/dashboard/profile" onclick={closeDropdowns}><iconify-icon icon="mdi:account" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.profile')}</span></a></li>
							<li><a href="/dashboard/settings" onclick={closeDropdowns}><iconify-icon icon="mdi:cog" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.settings')}</span></a></li>
							<li><button onclick={logout} class="text-error flex items-center gap-2 w-full"><iconify-icon icon="mdi:logout" width="20" class="text-error"></iconify-icon> <span>{$t('navbar.logout')}</span></button></li>
						</ul>
					</details>
				</li>

				<!-- Task Management -->
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
							<iconify-icon icon="mdi:briefcase-outline" width="20" class="text-primary"></iconify-icon>
							<span>{$t('navbar.task_management')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[12rem] w-auto p-2 shadow-sm whitespace-nowrap">
							<li><a href="/dashboard/find-tasks" onclick={closeDropdowns}><iconify-icon icon="mdi:magnify" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.find_tasks')}</span></a></li>
							<li><a href="/dashboard" onclick={closeDropdowns}><iconify-icon icon="mdi:format-list-bulleted" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.my_tasks')}</span></a></li>
							<li><a href="/dashboard/create-task" onclick={closeDropdowns}><iconify-icon icon="mdi:plus-circle" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.create_task')}</span></a></li>
						</ul>
					</details>
				</li>
			
				<!-- Support & Help -->
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
							<iconify-icon icon="mdi:help-circle-outline" width="20" class="text-primary"></iconify-icon>
							<span>{$t('navbar.support_help')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[12rem] w-auto p-2 shadow-sm whitespace-nowrap">
							<li><a href="/how-it-works" onclick={closeDropdowns}><iconify-icon icon="mdi:help-circle-outline" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.how_it_works')}</span></a></li>
							<li><a href="/faq" onclick={closeDropdowns}><iconify-icon icon="mdi:frequently-asked-questions" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.faq')}</span></a></li>
							<li><a href="/contact" onclick={closeDropdowns}><iconify-icon icon="mdi:email-outline" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.contact_support')}</span></a></li>
							<li><a href="/about" onclick={closeDropdowns}><iconify-icon icon="mdi:information-outline" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.about_us')}</span></a></li>
							<li><a href="/terms" onclick={closeDropdowns}><iconify-icon icon="mdi:file-document-outline" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.terms_of_service')}</span></a></li>
							<li><a href="/privacy" onclick={closeDropdowns}><iconify-icon icon="mdi:shield-account" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.privacy_policy')}</span></a></li>
						</ul>
					</details>
				</li>
				
			{:else}
				<li>
					<a href="/how-it-works" class="btn btn-ghost">
						<iconify-icon icon="mdi:help-circle-outline" width="20" class="text-primary"></iconify-icon>
						<span>{$t('footer.how_it_works')}</span>
					</a>
				</li>
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost" onclick={handleDropdownClick}>
							<iconify-icon icon="mdi:briefcase-outline" width="20" class="text-primary"></iconify-icon>
							<span>{$t('footer.for_taskers')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[16rem] p-2 shadow-sm">
							<li><a href="/dashboard/create-task" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:plus-circle" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.post_task')}</span>
							</a></li>
							<li><a href="/tasker-fees" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:currency-usd" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.tasker_fees')}</span>
							</a></li>
							<li><a href="/escrow" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:shield-check-outline" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.escrow')}</span>
							</a></li>
							<li><a href="/faq" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:frequently-asked-questions" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.faq')}</span>
							</a></li>
						</ul>
					</details>
				</li>
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost" onclick={handleDropdownClick}>
							<iconify-icon icon="mdi:account-hard-hat" width="20" class="text-primary"></iconify-icon>
							<span>{$t('footer.for_taskees')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[16rem] p-2 shadow-sm">
							<li><a href="/dashboard/find-tasks" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:magnify" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.start_earning')}</span>
							</a></li>
							<li><a href="/community-guidelines" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:account-group" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.community_guidelines')}</span>
							</a></li>
							<li><a href="/taskee-fees" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:currency-usd" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.taskee_fees')}</span>
							</a></li>
							<li><a href="/tasker-principles" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:handshake" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.tasker_principles')}</span>
							</a></li>
							<li><a href="/faq" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:frequently-asked-questions" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.tasker_faq')}</span>
							</a></li>
						</ul>
					</details>
				</li>
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost" onclick={handleDropdownClick}>
							<iconify-icon icon="mdi:domain" width="20" class="text-primary"></iconify-icon>
							<span>{$t('footer.company')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[16rem] p-2 shadow-sm">
							<li><a href="/about" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:information-outline" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.about_us')}</span>
							</a></li>
							<li><a href="/security" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:shield-check" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.security')}</span>
							</a></li>
							<li><a href="/careers" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:briefcase-search" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.careers')}</span>
							</a></li>
							<li><a href="/press" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:newspaper" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.press')}</span>
							</a></li>
							<li><a href="/terms" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:file-document-outline" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.terms')}</span>
							</a></li>
							<li><a href="/privacy" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:shield-account" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.privacy')}</span>
							</a></li>
							<li><a href="/contact" onclick={closeDropdowns}>
								<iconify-icon icon="mdi:email-outline" width="20" class="text-primary"></iconify-icon>
								<span>{$t('footer.contact')}</span>
							</a></li>
						</ul>
					</details>
				</li>
			{/if}
		</ul>
	</div>

	<!-- Navbar End -->
	<div class="navbar-end flex w-full flex-1 gap-1">
		<!-- Dark mode toggle and language dropdown -->
		<div class="md:flex items-center mr-1">
			<DarkModeToggle />
			<!-- <LanguageDropdown onLanguageChange={closeDropdowns} /> -->
		</div>
		<!-- login/signup or avatar -->
		{#if !isLoggedIn}
			<a href="/auth/login" class="btn btn-sm sm:btn-md btn-secondary">{$t('navbar.login')}</a>
			<a href="/auth/signup" class="btn btn-sm sm:btn-md btn-primary">{$t('navbar.signup')}</a>
		{:else}
			<!-- Avatar Dropdown -->
			<details class="dropdown dropdown-end">
				<summary class="btn btn-ghost"  onclick={handleDropdownClick}>
					<Avatar />
				</summary>
				<ul class="menu dropdown-content bg-base-100 rounded-box z-10 w-56 p-2 shadow-md right-0 mt-2">
					<li><a href="/dashboard" onclick={closeDropdowns}><iconify-icon icon="mdi:format-list-bulleted" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.my_tasks')}</span></a></li>
					<li><a href="/dashboard/profile" onclick={closeDropdowns}><iconify-icon icon="mdi:account" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.profile')}</span></a></li>
					<li><a href="/dashboard/messages" onclick={closeDropdowns}><iconify-icon icon="mdi:message" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.messages')}</span></a></li>
					<li><a href="/dashboard/settings" onclick={closeDropdowns}><iconify-icon icon="mdi:cog" width="20" class="text-primary"></iconify-icon> <span>{$t('navbar.settings')}</span></a></li>
					<li><button onclick={logout} class="text-error flex items-center gap-2"><iconify-icon icon="mdi:logout" width="20" class="text-error"></iconify-icon> <span>{$t('navbar.logout')}</span></button></li>
				</ul>
			</details>
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

	/* Remove hover effect and reduce padding for avatar dropdown summary */
	:global(.navbar-end .dropdown-end > summary.btn.btn-ghost) {
		background: none !important;
		box-shadow: none !important;
		color: inherit !important;
		padding: 0.25rem 0.5rem !important;
		transition: none !important;
	}
	:global(.navbar-end .dropdown-end > summary.btn.btn-ghost:hover),
	:global(.navbar-end .dropdown-end > summary.btn.btn-ghost:focus) {
		background: none !important;
		box-shadow: none !important;
		color: inherit !important;
	}
</style>
