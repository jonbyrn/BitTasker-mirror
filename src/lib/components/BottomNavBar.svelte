<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { authState } from '$lib/stores/auth.store';
	import { staggerGridItems } from '$lib/utils/animations';
	import {
		LOGGED_IN_MENU_SECTIONS,
		LOGGED_OUT_MENU_SECTIONS,
		visibleMenuSections,
		type MenuSection
	} from '$lib/utils/constants/menu.constants';
	import type { GridItem, NavGroup } from './bottomNav/NavGrid.svelte';
	import NavGrid from './bottomNav/NavGrid.svelte';
	import DockIcon from './bottomNav/DockIcon.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import IconHome from '~icons/mdi/home';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import IconAccountPlus from '~icons/mdi/account-plus';
	import IconMagnify from '~icons/mdi/magnify';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconLogout from '~icons/mdi/logout';
	import IconAccountCircle from '~icons/mdi/account-circle';
	import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconAccountHardHat from '~icons/mdi/account-hard-hat';
	import IconDomain from '~icons/mdi/domain';
	import IconCog from '~icons/mdi/cog';
	import { isMarketEnabled, isTempStaffEnabled } from '$lib/services/feature-flags';
	import IconStorefrontOutline from '~icons/mdi/storefront-outline';

	function sectionsToGroups(sections: MenuSection[]): NavGroup[] {
		return sections
			.filter((s) => s.items.length > 0)
			.map((s) => ({
				id: s.id,
				icon: s.icon,
				label: s.label,
				items: s.items
					.filter((item) => item.href)
					.map((item) => ({ href: item.href!, icon: item.icon, label: item.label }))
			}));
	}

	const loggedInGridItemsData: GridItem[] = [
		{
			id: 'logout',
			icon: IconLogout,
			label: 'navbar.logout',
			action: 'navigate',
			variant: 'danger'
		},
		{
			id: 'support',
			icon: IconHelpCircleOutline,
			label: 'navbar.support_help',
			action: 'group',
			groupId: 'support-help'
		},
		{
			id: 'account',
			icon: IconAccountCircle,
			label: 'navbar.my_account',
			action: 'group',
			groupId: 'my-account'
		},
		{
			id: 'settings',
			icon: IconCog,
			label: 'navbar.settings',
			action: 'group',
			groupId: 'settings'
		},
		{
			id: 'find-tasks',
			icon: IconMagnify,
			label: 'navbar.browse_tasks',
			action: 'navigate',
			href: '/browse/tasks'
		},
		{
			id: 'hiring',
			icon: IconBriefcaseOutline,
			label: 'navbar.hiring',
			action: 'group',
			groupId: 'hiring'
		},
		{
			id: 'list-service',
			icon: IconPlusCircleOutline,
			label: 'navbar.list_service',
			action: 'navigate',
			href: '/create-service'
		},
		{
			id: 'find-services',
			icon: IconBriefcaseSearch,
			label: 'navbar.browse_services',
			action: 'navigate',
			href: '/browse/services'
		},
		{
			id: 'earning',
			icon: IconInvoiceTextSendOutline,
			label: 'navbar.earning',
			action: 'group',
			groupId: 'earning'
		}
	];

	const loggedOutGridItemsData: GridItem[] = [
		{ id: 'home', icon: IconHome, label: 'navbar.home', action: 'navigate', href: '/tasks' },
		{
			id: 'how-it-works',
			icon: IconHelpCircleOutline,
			label: 'footer.how_it_works',
			action: 'navigate',
			href: '/how-it-works'
		},
		{
			id: 'taskers',
			icon: IconBriefcaseOutline,
			label: 'footer.for_taskers',
			action: 'group',
			groupId: 'for-taskers'
		},
		{
			id: 'taskees',
			icon: IconAccountHardHat,
			label: 'footer.for_taskees',
			action: 'group',
			groupId: 'for-taskees'
		},
		{
			id: 'company',
			icon: IconDomain,
			label: 'footer.company',
			action: 'group',
			groupId: 'company'
		}
	];

	const currentSection = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/' || path.startsWith('/hiring') || path.startsWith('/earning')) return 'home';
		if (path.startsWith('/browse/tasks')) return 'browse-tasks';
		if (path.startsWith('/browse/services')) return 'browse-services';
		if (path.startsWith('/browse/staff')) return 'browse-staff';
		if (path.startsWith('/browse/goods')) return 'browse-goods';
		if (path === '/tasks' || path.startsWith('/tasks/')) return 'find-tasks';
		if (path.includes('/create-task')) return 'create-task';
		if (path.includes('/wallet')) return 'wallet';
		if (path.includes('/messages')) return 'messages';
		if (path === '/about') return 'about';
		if (path === '/how-it-works') return 'help';
		if (path === '/auth/signup') return 'signup';
		return path.split('/').filter(Boolean).pop() || '';
	});

	const staffOn = isTempStaffEnabled();
	const goodsOn = isMarketEnabled();
	const extraNav = staffOn || goodsOn;

	const gridItems = $derived(
		$authState.isAuthenticated ? loggedInGridItemsData : loggedOutGridItemsData
	);
	const navGroups = $derived(
		$authState.isAuthenticated
			? sectionsToGroups(visibleMenuSections(LOGGED_IN_MENU_SECTIONS))
			: sectionsToGroups(visibleMenuSections(LOGGED_OUT_MENU_SECTIONS))
	);

	let isMenuOpen = $state(false);
	let showLogoutConfirm = $state(false);
	let dockEl = $state<HTMLElement | null>(null);
	let drawerPanelEl = $state<HTMLElement | null>(null);
	let gridContainerEl = $state<HTMLElement | null>(null);
	let navGridRef = $state<{ reset(): void } | null>(null);

	onMount(() => {
		if (!dockEl || typeof ResizeObserver === 'undefined') return;

		const updateVar = () => {
			const measured = Math.ceil(dockEl?.getBoundingClientRect().height ?? 0);
			if (measured > 0) {
				document.documentElement.style.setProperty('--app-dock-height', `${measured}px`);
			}
		};

		updateVar();
		const observer = new ResizeObserver(updateVar);
		observer.observe(dockEl);

		return () => observer.disconnect();
	});

	beforeNavigate(() => {
		if (isMenuOpen) isMenuOpen = false;
	});

	async function openMenu() {
		isMenuOpen = true;
		await tick();
		if (gridContainerEl) staggerGridItems(gridContainerEl);
	}

	function closeMenu() {
		isMenuOpen = false;
		showLogoutConfirm = false;
	}

	function toggleMenu() {
		if (isMenuOpen) {
			closeMenu();
		} else {
			openMenu();
		}
	}

	async function handleNavigate(href: string) {
		closeMenu();
		await goto(href, { noScroll: false, replaceState: false });
	}

	function handleLogoutClick() {
		showLogoutConfirm = true;
	}

	async function handleLogoutConfirm() {
		showLogoutConfirm = false;
		closeMenu();
		await authState.logout();
	}

	function handleLogoutCancel() {
		showLogoutConfirm = false;
	}
</script>

{#snippet hamburgerIcon()}
	<div class="flex h-6 w-6 flex-col items-center justify-center">
		<span
			class="bg-primary-content block h-0.5 w-5 transition-all duration-300 ease-in-out"
			class:rotate-45={isMenuOpen}
			class:translate-y-2={isMenuOpen}
		></span>
		<span
			class="bg-primary-content my-1 block h-0.5 w-5 transition-opacity duration-300"
			class:opacity-0={isMenuOpen}
		></span>
		<span
			class="bg-primary-content block h-0.5 w-5 transition-all duration-300 ease-in-out"
			class:rotate-[-45deg]={isMenuOpen}
			class:translate-y-[-4px]={isMenuOpen}
		></span>
	</div>
	<span class="text-primary-content text-xs font-medium">{$t('navbar.menu')}</span>
{/snippet}

{#if isMenuOpen}
	<div class="drawer-overlay" transition:fade|global={{ duration: 160, easing: cubicOut }}>
		<button
			type="button"
			class="drawer-backdrop"
			aria-label={$t('navbar.close_menu')}
			onclick={closeMenu}
		></button>

		<div
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			class="drawer-panel"
			transition:fly|global={{ x: -4, duration: 160, easing: cubicOut }}
			bind:this={drawerPanelEl}
		>
			<div class="drawer-content bg-base-100 border-base-300 h-full border-r shadow-sm">
				<div class="drawer-scroll">
					<div class="drawer-inner" bind:this={gridContainerEl}>
						{#if $authState.isAuthenticated}
							<NavGrid
								bind:this={navGridRef}
								items={gridItems}
								groups={navGroups}
								onNavigate={handleNavigate}
								onLogout={handleLogoutClick}
							/>
						{:else}
							<div class="auth-buttons">
								<a
									href="/auth/login"
									class="btn btn-secondary btn-sm flex-1"
									onclick={(e) => {
										e.preventDefault();
										handleNavigate('/auth/login');
									}}
								>
									{$t('navbar.login')}
								</a>
								<a
									href="/auth/signup"
									class="btn btn-primary btn-sm flex-1"
									onclick={(e) => {
										e.preventDefault();
										handleNavigate('/auth/signup');
									}}
								>
									{$t('navbar.signup')}
								</a>
							</div>
							<NavGrid
								bind:this={navGridRef}
								items={gridItems}
								groups={navGroups}
								onNavigate={handleNavigate}
								onLogout={handleLogoutClick}
							/>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<div bind:this={dockEl} class="dock pb-safe bg-primary border-base-300/70 border-t text-black">
	<DockIcon
		href="/browse/tasks"
		Icon={IconMagnify}
		label={$t('navbar.browse_tasks')}
		isActive={currentSection === 'browse-tasks'}
	/>
	<DockIcon
		href="/browse/services"
		Icon={IconBriefcaseSearch}
		label={$t('navbar.browse_services')}
		isActive={currentSection === 'browse-services'}
	/>
	{#if staffOn}
		<DockIcon
			href="/browse/staff"
			Icon={IconAccountHardHat}
			label={$t('navbar.browse_staff')}
			isActive={currentSection === 'browse-staff'}
		/>
	{/if}
	{#if goodsOn}
		<DockIcon
			href="/browse/goods"
			Icon={IconStorefrontOutline}
			label={$t('navbar.buy_sell')}
			isActive={currentSection === 'browse-goods'}
		/>
	{/if}
	<button
		class="dock-menu-btn"
		onclick={toggleMenu}
		aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
	>
		{@render hamburgerIcon?.()}
	</button>
	{#if $authState.isAuthenticated}
		<DockIcon
			href="/wallet"
			Icon={IconWalletOutline}
			label={$t('navbar.wallet')}
			isActive={currentSection === 'wallet'}
		/>
		{#if !extraNav}
			<DockIcon
				href="/messages"
				Icon={IconChatOutline}
				label={$t('navbar.messages')}
				isActive={currentSection === 'messages'}
			/>
		{/if}
	{:else}
		{#if !extraNav}
			<DockIcon
				href="/how-it-works"
				Icon={IconHelpCircleOutline}
				label={$t('navbar.help')}
				isActive={currentSection === 'help'}
			/>
		{/if}
		<DockIcon
			href="/auth/signup"
			Icon={IconAccountPlus}
			label={$t('navbar.signup')}
			isActive={currentSection === 'signup'}
		/>
	{/if}
</div>

<ConfirmModal
	isOpen={showLogoutConfirm}
	title={$t('common.components.confirm_modal.logout.title')}
	message={$t('common.components.confirm_modal.logout.message')}
	onConfirm={handleLogoutConfirm}
	onCancel={handleLogoutCancel}
/>

<style>
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
		z-index: 80;
	}

	.dock-menu-btn {
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-height: 48px;
		min-width: 0;
		max-width: 100%;
		padding: 0.25rem 0.5rem;
		border-radius: 0.75rem;
		transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1);
		-webkit-tap-highlight-color: transparent;
	}

	.dock-menu-btn:active {
		opacity: 0.7;
	}

	.dock-menu-btn:hover {
		background: hsl(var(--pc) / 0.1);
	}

	/*
	 * Drawer overlay: fills the full screen. The dark backdrop is always
	 * visible once the overlay mounts, so the user sees it immediately.
	 * The drawer-panel slides up from behind the dock using CSS transform.
	 * The panel itself has a solid bg-base-100 background so the rounded
	 * corners of drawer-content blend seamlessly into the panel.
	 */
	.drawer-overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
	}

	.drawer-backdrop {
		position: absolute;
		inset: 0;
		background: hsl(0 0% 0% / 0.35);
	}

	.drawer-panel {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: min(20rem, 86vw);
		background: hsl(var(--b1));
		will-change: transform;
	}

	.drawer-content {
		overflow: hidden;
	}

	.drawer-scroll {
		max-height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		padding: 0.5rem 0.5rem 0.75rem;
	}

	.drawer-inner {
		position: relative;
	}

	.auth-buttons {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.dock-menu-btn:active {
			transform: none;
		}
	}

	.drawer-scroll::-webkit-scrollbar {
		width: 4px;
	}

	.drawer-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.drawer-scroll::-webkit-scrollbar-thumb {
		background: hsl(var(--p));
		border-radius: 2px;
	}

	.drawer-scroll::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--p) / 0.8);
	}
</style>
