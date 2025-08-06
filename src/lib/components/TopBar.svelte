<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import DarkModeToggle from '$lib/components/DarkModeToggle.svelte';
	// Icon imports for unplugin-icons
	import IconAccountCircle from '~icons/mdi/account-circle';
	import IconAccountGroup from '~icons/mdi/account-group';
	import IconAccountHardHat from '~icons/mdi/account-hard-hat';
	import IconAccountPlus from '~icons/mdi/account-plus';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconCog from '~icons/mdi/cog';
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconDomain from '~icons/mdi/domain';
	import IconEmailOutline from '~icons/mdi/email-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconFrequentlyAskedQuestions from '~icons/mdi/frequently-asked-questions';
	import IconHandshake from '~icons/mdi/handshake';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import IconHome from '~icons/mdi/home';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconLogin from '~icons/mdi/login';
	import IconLogout from '~icons/mdi/logout';
	import IconMagnify from '~icons/mdi/magnify';
	import IconNewspaper from '~icons/mdi/newspaper';
	import IconPlusCircle from '~icons/mdi/plus-circle';
	import IconShieldAccount from '~icons/mdi/shield-account';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconShieldCheckOutline from '~icons/mdi/shield-check-outline';
	import IconMessage from '~icons/mdi/message';
	import IconWallet from '~icons/mdi/wallet';
	import IconAccount from '~icons/mdi/account';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';

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
	<div class="navbar-start flex-1 sm:flex ml-2">
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
				<IconArrowLeft />
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
							<IconAccountCircle class="text-primary" />
							<span>{$t('navbar.my_account')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[12rem] w-auto p-2 shadow-sm whitespace-nowrap">
													<li><a href="/dashboard/messages" onclick={closeDropdowns}><IconMessage class="text-primary" /> <span>{$t('navbar.messages')}</span></a></li>
						<li><a href="/dashboard/wallet" onclick={closeDropdowns}><IconWallet class="text-primary" /> <span>{$t('navbar.wallet')}</span></a></li>
						<li><a href="/dashboard/profile" onclick={closeDropdowns}><IconAccount class="text-primary" /> <span>{$t('navbar.profile')}</span></a></li>
						<li><a href="/dashboard/settings" onclick={closeDropdowns}><IconCog class="text-primary" /> <span>{$t('navbar.settings')}</span></a></li>
						<li><button onclick={logout} class="text-error flex items-center gap-2 w-full"><IconLogout class="text-error" /> <span>{$t('navbar.logout')}</span></button></li>
						</ul>
					</details>
				</li>

				<!-- Task Management -->
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
							<IconBriefcaseOutline class="text-primary" />
							<span>{$t('navbar.task_management')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[12rem] w-auto p-2 shadow-sm whitespace-nowrap">
							<li><a href="/dashboard/find-tasks" onclick={closeDropdowns}><IconMagnify class="text-primary" /> <span>{$t('navbar.find_tasks')}</span></a></li>
							<li><a href="/dashboard" onclick={closeDropdowns}><IconFormatListBulleted class="text-primary" /> <span>{$t('navbar.my_tasks')}</span></a></li>
							<li><a href="/dashboard/create-task" onclick={closeDropdowns}><IconPlusCircle class="text-primary" /> <span>{$t('navbar.create_task')}</span></a></li>
						</ul>
					</details>
				</li>
			
				<!-- Support & Help -->
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost flex items-center gap-2" onclick={handleDropdownClick}>
							<IconHelpCircleOutline class="text-primary" />
							<span>{$t('navbar.support_help')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[12rem] w-auto p-2 shadow-sm whitespace-nowrap">
							<li><a href="/how-it-works" onclick={closeDropdowns}><IconHelpCircleOutline class="text-primary" /> <span>{$t('navbar.how_it_works')}</span></a></li>
							<li><a href="/faq" onclick={closeDropdowns}><IconFrequentlyAskedQuestions class="text-primary" /> <span>{$t('navbar.faq')}</span></a></li>
							<li><a href="/contact" onclick={closeDropdowns}><IconEmailOutline class="text-primary" /> <span>{$t('navbar.contact_support')}</span></a></li>
							<li><a href="/about" onclick={closeDropdowns}><IconInformationOutline class="text-primary" /> <span>{$t('navbar.about_us')}</span></a></li>
							<li><a href="/terms" onclick={closeDropdowns}><IconFileDocumentOutline class="text-primary" /> <span>{$t('navbar.terms_of_service')}</span></a></li>
							<li><a href="/privacy" onclick={closeDropdowns}><IconShieldAccount class="text-primary" /> <span>{$t('navbar.privacy_policy')}</span></a></li>
						</ul>
					</details>
				</li>
				
			{:else}
				<li>
					<a href="/how-it-works" class="btn btn-ghost">
						<IconHelpCircleOutline class="text-primary" />
						<span>{$t('footer.how_it_works')}</span>
					</a>
				</li>
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost" onclick={handleDropdownClick}>
							<IconBriefcaseOutline class="text-primary" />
							<span>{$t('footer.for_taskers')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[16rem] p-2 shadow-sm">
							<li><a href="/dashboard/create-task" onclick={closeDropdowns}>
								<IconPlusCircle class="text-primary" />
								<span>{$t('footer.post_task')}</span>
							</a></li>
							<li><a href="/tasker-fees" onclick={closeDropdowns}>
								<IconCurrencyUsd class="text-primary" />
								<span>{$t('footer.tasker_fees')}</span>
							</a></li>
							<li><a href="/escrow" onclick={closeDropdowns}>
								<IconShieldCheckOutline class="text-primary" />
								<span>{$t('footer.escrow')}</span>
							</a></li>
							<li><a href="/faq" onclick={closeDropdowns}>
								<IconFrequentlyAskedQuestions class="text-primary" />
								<span>{$t('footer.faq')}</span>
							</a></li>
						</ul>
					</details>
				</li>
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost" onclick={handleDropdownClick}>
							<IconAccountHardHat class="text-primary" />
							<span>{$t('footer.for_taskees')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[16rem] p-2 shadow-sm">
							<li><a href="/dashboard/find-tasks" onclick={closeDropdowns}>
								<IconMagnify class="text-primary" />
								<span>{$t('footer.start_earning')}</span>
							</a></li>
							<li><a href="/community-guidelines" onclick={closeDropdowns}>
								<IconAccountGroup class="text-primary" />
								<span>{$t('footer.community_guidelines')}</span>
							</a></li>
							<li><a href="/taskee-fees" onclick={closeDropdowns}>
								<IconCurrencyUsd class="text-primary" />
								<span>{$t('footer.taskee_fees')}</span>
							</a></li>
							<li><a href="/tasker-principles" onclick={closeDropdowns}>
								<IconHandshake class="text-primary" />
								<span>{$t('footer.tasker_principles')}</span>
							</a></li>
							<li><a href="/faq" onclick={closeDropdowns}>
								<IconFrequentlyAskedQuestions class="text-primary" />
								<span>{$t('footer.tasker_faq')}</span>
							</a></li>
						</ul>
					</details>
				</li>
				<li>
					<details class="dropdown">
						<summary class="btn btn-ghost" onclick={handleDropdownClick}>
							<IconDomain class="text-primary" />
							<span>{$t('footer.company')}</span>
						</summary>
						<ul class="menu dropdown-content bg-base-100 rounded-box z-1 min-w-[16rem] p-2 shadow-sm">
							<li><a href="/about" onclick={closeDropdowns}>
								<IconInformationOutline class="text-primary" />
								<span>{$t('footer.about_us')}</span>
							</a></li>
							<li><a href="/security" onclick={closeDropdowns}>
								<IconShieldCheck class="text-primary" />
								<span>{$t('footer.security')}</span>
							</a></li>
							<li><a href="/careers" onclick={closeDropdowns}>
								<IconBriefcaseSearch class="text-primary" />
								<span>{$t('footer.careers')}</span>
							</a></li>
							<li><a href="/press" onclick={closeDropdowns}>
								<IconNewspaper class="text-primary" />
								<span>{$t('footer.press')}</span>
							</a></li>
							<li><a href="/terms" onclick={closeDropdowns}>
								<IconFileDocumentOutline class="text-primary" />
								<span>{$t('footer.terms')}</span>
							</a></li>
							<li><a href="/privacy" onclick={closeDropdowns}>
								<IconShieldAccount class="text-primary" />
								<span>{$t('footer.privacy')}</span>
							</a></li>
							<li><a href="/contact" onclick={closeDropdowns}>
								<IconEmailOutline class="text-primary" />
								<span>{$t('footer.contact')}</span>
							</a></li>
						</ul>
					</details>
				</li>
			{/if}
		</ul>
	</div>

	<!-- Navbar End -->
	<div class="navbar-end flex w-full flex-1 gap-1 mr-2">
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
												<li><a href="/dashboard" onclick={closeDropdowns}><IconFormatListBulleted class="text-primary" /> <span>{$t('navbar.my_tasks')}</span></a></li>
							<li><a href="/dashboard/profile" onclick={closeDropdowns}><IconAccount class="text-primary" /> <span>{$t('navbar.profile')}</span></a></li>
							<li><a href="/dashboard/messages" onclick={closeDropdowns}><IconMessage class="text-primary" /> <span>{$t('navbar.messages')}</span></a></li>
							<li><a href="/dashboard/settings" onclick={closeDropdowns}><IconCog class="text-primary" /> <span>{$t('navbar.settings')}</span></a></li>
							<li><button onclick={logout} class="text-error flex items-center gap-2"><IconLogout class="text-error" /> <span>{$t('navbar.logout')}</span></button></li>
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
													<IconCog />
						{$t('navbar.settings')}
					</a>
				</li>
			{/if}

			<li class="divider"></li>

			<li>
				<a href="/" onclick={closeDrawer} class="flex items-center gap-2">
											<IconHome />
					{$t('navbar.home')}
				</a>
			</li>
			<li>
				<a href="/how-it-works" onclick={closeDrawer} class="flex items-center gap-2">
											<IconHelpCircleOutline />
					{$t('navbar.how_it_works')}
				</a>
			</li>
			<li>
				<a href="/terms" onclick={closeDrawer} class="flex items-center gap-2">
											<IconFileDocumentOutline />
					{$t('navbar.terms_and_conditions')}
				</a>
			</li>

			<li class="divider"></li>

			<!-- Additional menu items -->

			{#if isLoggedIn}
				<li>
					<button onclick={logout} class="flex items-center gap-2">
													<IconLogout />
						{$t('navbar.logout')}
					</button>
				</li>
			{:else}
				<li class="mt-4 flex flex-col gap-2">
					<a href="/auth/login"
						class="btn btn-secondary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
													<IconLogin />
						{$t('navbar.login')}
					</a>
					<a href="/auth/signup"
						class="btn btn-primary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
													<IconAccountPlus />
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
