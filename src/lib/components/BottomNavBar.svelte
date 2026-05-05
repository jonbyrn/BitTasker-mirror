<script lang="ts">
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { authState } from '$lib/stores/auth.store';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	import IconLogout from '~icons/mdi/logout';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import IconFrequentlyAskedQuestions from '~icons/mdi/frequently-asked-questions';
	import IconEmailOutline from '~icons/mdi/email-outline';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconShieldAccount from '~icons/mdi/shield-account';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconLogin from '~icons/mdi/login';
	import IconAccountPlus from '~icons/mdi/account-plus';
	import IconHome from '~icons/mdi/home';
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconShieldCheckOutline from '~icons/mdi/shield-check-outline';
	import IconAccountHardHat from '~icons/mdi/account-hard-hat';
	import IconCurrencyBtc from '~icons/mdi/currency-btc';
	import IconAccountGroup from '~icons/mdi/account-group';
	import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconFileSign from '~icons/mdi/file-sign';
	import IconDomain from '~icons/mdi/domain';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconNewspaper from '~icons/mdi/newspaper';
	import IconCommentTextOutline from '~icons/mdi/comment-text-outline';
	import IconAccountCircle from '~icons/mdi/account-circle';
	import IconAccountOutline from '~icons/mdi/account-outline';
	import IconCogOutline from '~icons/mdi/cog-outline';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type IconComponent = any;

	interface NavLink {
		href: string;
		icon: IconComponent;
		label: string;
	}

	interface NavGroup {
		id: string;
		icon: IconComponent;
		label: string;
		items: NavLink[];
	}

	const loggedInGroups: NavGroup[] = [
		{
			id: 'account',
			icon: IconAccountCircle,
			label: 'navbar.my_account',
			items: [
				{ href: '/dashboard/profile', icon: IconAccountOutline, label: 'navbar.profile' },
				{ href: '/dashboard/settings', icon: IconCogOutline, label: 'navbar.settings' }
			]
		},
		{
			id: 'company',
			icon: IconHelpCircleOutline,
			label: 'navbar.support_help',
			items: [
				{ href: '/how-it-works', icon: IconHelpCircleOutline, label: 'navbar.how_it_works' },
				{ href: '/faq', icon: IconFrequentlyAskedQuestions, label: 'navbar.faq' },
				{ href: '/contact', icon: IconEmailOutline, label: 'navbar.contact_support' },
				{ href: '/feedback', icon: IconCommentTextOutline, label: 'navbar.feedback' },
				{ href: '/security', icon: IconShieldCheck, label: 'footer.security' }
			]
		}
	];

	// Earning accordion items (tabs from earning page)
	const loggedInEarningGroup: NavGroup = {
		id: 'earning',
		icon: IconInvoiceTextSendOutline,
		label: 'navbar.earning',
		items: [
			{ href: '/earning/bids', icon: IconMagnify, label: 'dashboard.tabs.bids' },
			{ href: '/earning/requests', icon: IconBriefcaseOutline, label: 'dashboard.tabs.requests' },
			{ href: '/earning/contracts', icon: IconFileSign, label: 'dashboard.tabs.contracts' },
			{
				href: '/earning/my-services',
				icon: IconBriefcaseSearch,
				label: 'dashboard.services.my_services.title'
			},
			{ href: '/earning/alerts', icon: IconNewspaper, label: 'dashboard.tabs.saved_searches' }
		]
	};

	// Hiring accordion items (tabs from dashboard page)
	const loggedInHiringGroup: NavGroup = {
		id: 'hiring',
		icon: IconBriefcaseOutline,
		label: 'navbar.hiring',
		items: [
			{ href: '/dashboard?tab=tasks', icon: IconPlusCircleOutline, label: 'dashboard.tabs.tasks' },
			{ href: '/dashboard?tab=contracts', icon: IconFileSign, label: 'dashboard.tabs.contracts' },
			{
				href: '/dashboard?tab=service-requests',
				icon: IconCommentTextOutline,
				label: 'dashboard.tabs.quotes'
			}
		]
	};

	const loggedOutTopLinks: NavLink[] = [
		{ href: '/tasks', icon: IconHome, label: 'navbar.home' },
		{ href: '/how-it-works', icon: IconHelpCircleOutline, label: 'footer.how_it_works' }
	];

	const loggedOutGroups: NavGroup[] = [
		{
			id: 'taskers',
			icon: IconBriefcaseOutline,
			label: 'footer.for_taskers',
			items: [
				{ href: '/dashboard/create-task', icon: IconPlusCircleOutline, label: 'footer.post_task' },
				{ href: '/taskee-fees', icon: IconCurrencyUsd, label: 'footer.tasker_fees' },
				{ href: '/secure-payments', icon: IconShieldCheckOutline, label: 'footer.escrow' },
				{ href: '/faq', icon: IconFrequentlyAskedQuestions, label: 'footer.faq' }
			]
		},
		{
			id: 'taskees',
			icon: IconAccountHardHat,
			label: 'footer.for_taskees',
			items: [
				{ href: '/tasks', icon: IconCurrencyBtc, label: 'footer.start_earning' },
				{
					href: '/community-guidelines',
					icon: IconAccountGroup,
					label: 'footer.community_guidelines'
				},
				{ href: '/taskee-fees', icon: IconCurrencyUsd, label: 'footer.tasker_fees' },
				{
					href: '/tasker-principles',
					icon: IconInvoiceTextSendOutline,
					label: 'footer.tasker_principles'
				},
				{ href: '/faq', icon: IconFrequentlyAskedQuestions, label: 'footer.tasker_faq' }
			]
		},
		{
			id: 'company',
			icon: IconDomain,
			label: 'footer.company',
			items: [
				{ href: '/about', icon: IconInformationOutline, label: 'footer.about_us' },
				{ href: '/security', icon: IconShieldCheck, label: 'footer.security' },
				{ href: '/careers', icon: IconBriefcaseSearch, label: 'footer.careers' },
				{ href: '/press', icon: IconNewspaper, label: 'footer.press' },
				{ href: '/terms', icon: IconFileDocumentOutline, label: 'footer.terms' },
				{ href: '/privacy', icon: IconShieldAccount, label: 'footer.privacy' },
				{ href: '/contact', icon: IconEmailOutline, label: 'footer.contact' }
			]
		}
	];

	let currentSection = $state('');

	function handleBottomNavTap(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target) return;
		const interactive = target.closest('a,button,[role="button"]');
		if (!interactive) return;
	}

	$effect(() => {
		const path = page.url.pathname;
		// More specific route detection for active states
		if (path === '/dashboard' || path === '/earning') {
			currentSection = 'home';
		} else if (path === '/tasks' || path.startsWith('/tasks/')) {
			currentSection = 'find-tasks';
		} else if (path.includes('/dashboard/create-task')) {
			currentSection = 'create-task';
		} else if (path.includes('/dashboard/wallet')) {
			currentSection = 'wallet';
		} else if (path.includes('/dashboard/messages')) {
			currentSection = 'messages';
		} else if (path === '/') {
			currentSection = 'home';
		} else if (path === '/about') {
			currentSection = 'about';
		} else if (path === '/how-it-works') {
			currentSection = 'help';
		} else if (path === '/auth/signup') {
			currentSection = 'signup';
		} else {
			currentSection = path.split('dashboard/')[1] || '';
		}
	});

	let isMenuOpen = $state(false);
	let isMenuClosing = $state(false);
	let isMenuExpanding = $state(false);
	let showLogoutConfirm = $state(false);

	// Measure actual dock height (avoid relying on 80px fallback)
	let dockEl = $state<HTMLElement | null>(null);
	let dockObserver: ResizeObserver | null = null;

	$effect(() => {
		if (dockObserver) {
			dockObserver.disconnect();
			dockObserver = null;
		}

		if (!dockEl || typeof ResizeObserver === 'undefined') return;

		const updateVar = () => {
			const measured = Math.ceil(dockEl?.getBoundingClientRect().height ?? 0);
			if (measured <= 0) return;
			document.documentElement.style.setProperty('--app-dock-height', `${measured}px`);
		};

		updateVar();
		dockObserver = new ResizeObserver(() => updateVar());
		dockObserver.observe(dockEl);

		return () => {
			dockObserver?.disconnect();
			dockObserver = null;
		};
	});

	let openGroupId = $state<string | null>(null);

	function toggleGroup(id: string) {
		openGroupId = openGroupId === id ? null : id;
	}

	function closeAllCollapses() {
		openGroupId = null;
	}

	// Close menu before any navigation
	beforeNavigate(() => {
		if (isMenuOpen && !isMenuClosing) {
			closeMenu();
		}
	});

	async function toggleMenu() {
		if (isMenuOpen) {
			closeMenu();
		} else {
			// Render the menu in a collapsed state first
			isMenuOpen = true;
			isMenuClosing = false;
			isMenuExpanding = false;
			// Wait for DOM to mount the element
			await tick();
			// Ensure the collapsed state is painted before transitioning (mobile Safari/Chrome)
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			// Now enable expand class to trigger transition
			isMenuExpanding = true;
		}
	}

	function closeMenu() {
		if (isMenuOpen && !isMenuClosing) {
			// Stop the expand state so collapse animation takes precedence
			isMenuExpanding = false;
			isMenuClosing = true;
			// Close all collapses when closing the menu
			closeAllCollapses();
			// Close logout confirm if open
			showLogoutConfirm = false;
			// Wait for slide-down animation to complete before hiding
			setTimeout(() => {
				isMenuOpen = false;
				isMenuClosing = false;
			}, 300); // Match animation duration
		}
	}

	function handleLogoutClick() {
		showLogoutConfirm = true;
	}

	async function handleLogoutConfirm() {
		showLogoutConfirm = false;
		await authState.logout();
		closeMenu();
		await goto('/', { replaceState: true });
	}

	function handleLogoutCancel() {
		showLogoutConfirm = false;
	}

	async function handleNavWithMenuClose(event: MouseEvent, href: string) {
		event.preventDefault();
		event.stopPropagation();
		closeMenu();
		await goto(href, { noScroll: false, replaceState: false });
	}
</script>

{#snippet menuLink(link: NavLink)}
	{@const LinkIcon = link.icon}
	<li>
		<a
			href={link.href}
			onclick={(e) => handleNavWithMenuClose(e, link.href)}
			class="min-h-[44px] py-2 pl-6"
		>
			<LinkIcon class="text-primary" />
			<span class="font-medium">{$t(link.label)}</span>
		</a>
	</li>
{/snippet}

{#snippet topLevelLink(link: NavLink)}
	{@const LinkIcon = link.icon}
	<li>
		<a
			href={link.href}
			onclick={(e) => handleNavWithMenuClose(e, link.href)}
			class="min-h-[48px] py-3"
		>
			<LinkIcon class="text-primary" />
			<span class="font-medium">{$t(link.label)}</span>
		</a>
	</li>
{/snippet}

{#snippet hamburgerButton()}
	<div class="flex h-6 w-6 flex-col items-center justify-center">
		<span
			class="bg-primary-content block h-0.5 w-5 transition-all duration-300 ease-in-out"
			class:rotate-45={isMenuOpen && !isMenuClosing}
			class:translate-y-2={isMenuOpen && !isMenuClosing}
		></span>
		<span
			class="bg-primary-content my-1 block h-0.5 w-5 transition-opacity duration-300"
			class:opacity-0={isMenuOpen && !isMenuClosing}
		></span>
		<span
			class="bg-primary-content block h-0.5 w-5 transition-all duration-300 ease-in-out"
			class:rotate-[-45deg]={isMenuOpen && !isMenuClosing}
			class:translate-y-[-4px]={isMenuOpen && !isMenuClosing}
		></span>
	</div>
	<span class="text-primary-content text-xs font-medium">{$t('navbar.menu')}</span>
{/snippet}

{#snippet dockLink(href: string, Icon: IconComponent, label: string, section: string)}
	<a
		{href}
		class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
		section
			? 'dock-active'
			: ''}"
		data-sveltekit-reload="off"
	>
		<Icon class="text-primary-content" />
		<span class="dock-label font-medium">{$t(label)}</span>
	</a>
{/snippet}

{#snippet quickActionLink(href: string, Icon: IconComponent, label: string)}
	<a
		{href}
		onclick={(e) => handleNavWithMenuClose(e, href)}
		class="hover:bg-base-200 flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors"
	>
		<Icon class="text-primary h-6 w-6" />
		<span class="text-center text-xs font-medium">{$t(label)}</span>
	</a>
{/snippet}

<!-- Bottom-sheet menu overlay (under the dock) -->
{#if isMenuOpen || isMenuClosing}
	<div class="fixed inset-0 z-70 flex flex-col justify-end" onclickcapture={handleBottomNavTap}>
		<button
			type="button"
			class="bottom-nav-backdrop flex-1 bg-black"
			class:backdrop-visible={isMenuExpanding && !isMenuClosing}
			aria-label={$t('navbar.close_menu')}
			onclick={() => {
				if (isMenuOpen && !isMenuClosing) closeMenu();
			}}
		></button>

		<div
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			class="bottom-nav-menu w-full bg-black/30"
			class:menu-expand={isMenuExpanding && !isMenuClosing}
			class:menu-collapse={isMenuClosing || (!isMenuExpanding && !isMenuClosing)}
		>
			<div class="bg-base-100 border-base-300 overflow-hidden rounded-t-2xl border-t shadow-lg">
				<div class="bottom-nav-scroll max-h-[70vh] overflow-y-auto pt-2">
					<div class="p-2">
						{#if $authState.isAuthenticated}
							<ul class="menu w-full">
								<!-- 1. Logout -->
								<li>
									<button onclick={handleLogoutClick} class="min-h-[48px] w-full py-3 text-left">
										<IconLogout class="text-error" />
										<span class="text-error font-medium">{$t('navbar.logout')}</span>
									</button>
								</li>

								<!-- 2. Support & Help (Accordion) -->
								<li>
									<button onclick={() => toggleGroup('company')} class="min-h-[48px] py-3">
										<IconHelpCircleOutline class="text-primary" />
										<span class="font-medium">{$t('navbar.support_help')}</span>
										<svg
											class="dropdown-arrow ml-auto h-4 w-4"
											class:dropdown-open={openGroupId === 'company'}
											fill="currentColor"
											viewBox="0 0 20 20"
											stroke="currentColor"
											stroke-width="1"
										>
											<path
												fill-rule="evenodd"
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								</li>
								<li class="submenu-grid" class:submenu-open={openGroupId === 'company'}>
									<ul class="submenu-inner">
										{#each loggedInGroups.find((g) => g.id === 'company')?.items || [] as link (link.label)}
											{@render menuLink(link)}
										{/each}
									</ul>
								</li>

								<!-- 3. My Account (Accordion) -->
								<li>
									<button onclick={() => toggleGroup('account')} class="min-h-[48px] py-3">
										<IconAccountCircle class="text-primary" />
										<span class="font-medium">{$t('navbar.my_account')}</span>
										<svg
											class="dropdown-arrow ml-auto h-4 w-4"
											class:dropdown-open={openGroupId === 'account'}
											fill="currentColor"
											viewBox="0 0 20 20"
											stroke="currentColor"
											stroke-width="1"
										>
											<path
												fill-rule="evenodd"
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								</li>
								<li class="submenu-grid" class:submenu-open={openGroupId === 'account'}>
									<ul class="submenu-inner">
										{#each loggedInGroups.find((g) => g.id === 'account')?.items || [] as link (link.label)}
											{@render menuLink(link)}
										{/each}
									</ul>
								</li>

								<!-- 4. Earning (Accordion) -->
								<li>
									<button onclick={() => toggleGroup('earning')} class="min-h-[48px] py-3">
										<IconInvoiceTextSendOutline class="text-primary" />
										<span class="font-medium">{$t('navbar.earning')}</span>
										<svg
											class="dropdown-arrow ml-auto h-4 w-4"
											class:dropdown-open={openGroupId === 'earning'}
											fill="currentColor"
											viewBox="0 0 20 20"
											stroke="currentColor"
											stroke-width="1"
										>
											<path
												fill-rule="evenodd"
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								</li>
								<li class="submenu-grid" class:submenu-open={openGroupId === 'earning'}>
									<ul class="submenu-inner">
										{#each loggedInEarningGroup.items as link (link.label)}
											{@render menuLink(link)}
										{/each}
									</ul>
								</li>

								<!-- 5. Hiring (Accordion) -->
								<li>
									<button onclick={() => toggleGroup('hiring')} class="min-h-[48px] py-3">
										<IconBriefcaseOutline class="text-primary" />
										<span class="font-medium">{$t('navbar.hiring')}</span>
										<svg
											class="dropdown-arrow ml-auto h-4 w-4"
											class:dropdown-open={openGroupId === 'hiring'}
											fill="currentColor"
											viewBox="0 0 20 20"
											stroke="currentColor"
											stroke-width="1"
										>
											<path
												fill-rule="evenodd"
												d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
												clip-rule="evenodd"
											/>
										</svg>
									</button>
								</li>
								<li class="submenu-grid" class:submenu-open={openGroupId === 'hiring'}>
									<ul class="submenu-inner">
										{#each loggedInHiringGroup.items as link (link.label)}
											{@render menuLink(link)}
										{/each}
									</ul>
								</li>
							</ul>
						{:else}
							<div class="mb-2 flex items-center justify-around">
								<a
									href="/auth/login"
									class="btn btn-secondary flex w-[48%] items-center justify-center gap-2"
									onclick={(e) => handleNavWithMenuClose(e, '/auth/login')}
								>
									<IconLogin />
									{$t('navbar.login')}
								</a>
								<a
									href="/auth/signup"
									class="btn btn-primary flex w-[48%] items-center justify-center gap-2"
									onclick={(e) => handleNavWithMenuClose(e, '/auth/signup')}
								>
									<IconAccountPlus />
									{$t('navbar.signup')}
								</a>
							</div>
							<ul class="menu w-full">
								{#each loggedOutTopLinks as link (link.href)}
									{@render topLevelLink(link)}
								{/each}
								{#each loggedOutGroups as group (group.id)}
									<!-- Group dropdown -->
									<li>
										<button onclick={() => toggleGroup(group.id)} class="min-h-[48px] py-3">
											<group.icon class="text-primary" />
											<span class="font-medium">{$t(group.label)}</span>
											<svg
												class="dropdown-arrow ml-auto h-4 w-4"
												class:dropdown-open={openGroupId === group.id}
												fill="currentColor"
												viewBox="0 0 20 20"
												stroke="currentColor"
												stroke-width="1"
											>
												<path
													fill-rule="evenodd"
													d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
													clip-rule="evenodd"
												/>
											</svg>
										</button>
									</li>
									<li class="submenu-grid" class:submenu-open={openGroupId === group.id}>
										<ul class="submenu-inner">
											{#each group.items as link (link.label)}
												{@render menuLink(link)}
											{/each}
										</ul>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>

				{#if $authState.isAuthenticated}
					<div class="bottom-nav-quick border-base-300/70 bg-base-100/95 border-t px-2 py-2">
						<div class="flex gap-2">
							{@render quickActionLink('/tasks', IconMagnify, 'navbar.find_tasks')}
							{@render quickActionLink('/services', IconBriefcaseSearch, 'navbar.find_services')}
							{@render quickActionLink(
								'/dashboard/create-service',
								IconPlusCircleOutline,
								'navbar.list_service'
							)}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Bottom Navigation Bar -->
{#if $authState.isAuthenticated}
	<div
		bind:this={dockEl}
		class="dock pb-safe bg-primary border-base-300/70 z-80 border-t text-black"
		onclickcapture={handleBottomNavTap}
	>
		{@render dockLink('/dashboard', IconHome, 'navbar.home', 'home')}
		{@render dockLink(
			'/dashboard/create-task',
			IconPlusCircleOutline,
			'navbar.new_task',
			'create-task'
		)}

		<button
			data-menu-button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors"
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
		>
			{@render hamburgerButton()}
		</button>

		{@render dockLink('/dashboard/wallet', IconWalletOutline, 'navbar.wallet', 'wallet')}
		{@render dockLink('/dashboard/messages', IconChatOutline, 'navbar.messages', 'messages')}
	</div>
{:else}
	<div
		bind:this={dockEl}
		class="dock pb-safe bg-primary border-base-300/70 z-80 border-t text-black"
		onclickcapture={handleBottomNavTap}
	>
		{@render dockLink('/tasks', IconHome, 'navbar.home', 'home')}
		{@render dockLink('/about', IconInformationOutline, 'navbar.about', 'about')}

		<button
			data-menu-button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors"
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
		>
			{@render hamburgerButton()}
		</button>

		{@render dockLink('/how-it-works', IconHelpCircleOutline, 'navbar.help', 'help')}
		{@render dockLink('/auth/signup', IconAccountPlus, 'navbar.signup', 'signup')}
	</div>
{/if}

<ConfirmModal
	isOpen={showLogoutConfirm}
	title={$t('common.components.confirm_modal.logout.title')}
	message={$t('common.components.confirm_modal.logout.message')}
	onConfirm={handleLogoutConfirm}
	onCancel={handleLogoutCancel}
/>

<style>
	/*
	 * SystemBars fallback pattern for Android WebView < 140:
	 * var(--safe-area-inset-*, env(safe-area-inset-*, 0px))
	 */
	.pb-safe {
		padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
	}

	.dock {
		display: flex;
		align-items: center;
		justify-content: space-around;
		padding: 0.5rem 0;
		padding-bottom: calc(0.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
		min-height: 64px;
		height: auto;
		width: 100%;
	}

	.dock .dock-label {
		white-space: nowrap;
	}

	.bottom-nav-backdrop {
		opacity: 0;
		transition: opacity 300ms ease;
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}

	.bottom-nav-backdrop.backdrop-visible {
		opacity: 0.3;
	}

	.bottom-nav-menu {
		transform: translateY(100%);
		transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
		will-change: transform;
		backface-visibility: hidden;

		/* Panel extends behind the dock so it appears to slide from behind it */
		max-height: calc(52rem + var(--app-footer-height, var(--bottom-nav-height-safe)));
		/* Reserve space for the dock — uses measured dock height directly */
		padding-bottom: var(--app-dock-height, var(--app-footer-height, var(--bottom-nav-height-safe)));
		overflow: hidden;
	}
	.menu-expand {
		transform: translateY(0);
	}
	.menu-collapse {
		transform: translateY(100%);
	}

	.bottom-nav-menu::-webkit-scrollbar {
		width: 4px;
	}

	.bottom-nav-menu::-webkit-scrollbar-track {
		background: transparent;
	}

	.bottom-nav-menu::-webkit-scrollbar-thumb {
		background: hsl(var(--p));
		border-radius: 2px;
	}

	.bottom-nav-menu::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--p) / 0.8);
	}

	/*
	 * Submenu reveal using grid-template-rows trick for smooth layout pushing.
	 * Modern browsers optimize this heavily for performance.
	 */
	.submenu-grid {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
		overflow: hidden;
		list-style: none;
	}

	.submenu-grid.submenu-open {
		grid-template-rows: 1fr;
	}

	.submenu-inner {
		min-height: 0;
		padding: 0;
		margin: 0;
		list-style: none;
		overflow: hidden;
	}

	.dropdown-arrow {
		transform-origin: center;
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		will-change: transform;
		transform: rotate(0deg);
	}

	.dropdown-arrow.dropdown-open {
		transform: rotate(180deg);
	}

	.menu li > button:hover .dropdown-arrow {
		transform: rotate(0deg) scale(1.05);
	}

	.menu li > button:hover .dropdown-arrow.dropdown-open {
		transform: rotate(180deg) scale(1.05);
	}

	.dock button[data-menu-button] span {
		will-change: transform, opacity;
		transform-origin: center;
		backface-visibility: hidden;
	}
</style>
