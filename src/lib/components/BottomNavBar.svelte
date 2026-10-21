<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { authState } from '$lib/stores/auth.store';
	import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
	import { isMarketEnabled, isTempStaffEnabled } from '$lib/services/feature-flags';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import IconHome from '~icons/mdi/home';
	import IconPlus from '~icons/mdi/plus';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import IconAccountPlus from '~icons/mdi/account-plus';
	import IconMagnify from '~icons/mdi/magnify';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconLogout from '~icons/mdi/logout';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconAccountHardHat from '~icons/mdi/account-hard-hat';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconCog from '~icons/mdi/cog';
	import IconStorefrontOutline from '~icons/mdi/storefront-outline';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';

	const currentSection = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/') return 'home';
		if (path === '/about' || path.startsWith('/about/')) return 'about';
		if (path === '/how-it-works' || path.startsWith('/how-it-works/')) return 'help';
		if (path === '/auth/signup') return 'signup';
		if (path.includes('/create-task')) return 'post';
		if (path.includes('/wallet')) return 'wallet';
		return '';
	});

	const unreadCount = $derived(
		$authState.isAuthenticated ? $notificationCenterStore.unreadCount : 0
	);

	let isMenuOpen = $state(false);
	let showLogoutConfirm = $state(false);

	const measureDock: Attachment = (node) => {
		const updateVar = () => {
			const measured = Math.ceil(node.getBoundingClientRect().height ?? 0);
			if (measured > 0) {
				document.documentElement.style.setProperty('--app-dock-height', `${measured}px`);
			}
		};
		updateVar();
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateVar);
		observer?.observe(node);
		const stopAuth = authState.subscribe((state) => {
			if (state.isAuthenticated) void notificationCenterStore.fetchUnreadCount();
		});
		return () => {
			observer?.disconnect();
			stopAuth();
		};
	};

	beforeNavigate(() => {
		if (isMenuOpen) isMenuOpen = false;
	});

	function closeMenu() {
		isMenuOpen = false;
		showLogoutConfirm = false;
	}

	function toggleMenu() {
		if (isMenuOpen) closeMenu();
		else isMenuOpen = true;
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
	<div class="flex h-8 w-8 flex-col items-center justify-center">
		<span
			class="bg-primary-content block h-0.5 w-6 transition-all duration-300 ease-in-out"
			class:rotate-45={isMenuOpen}
			class:translate-y-2={isMenuOpen}
		></span>
		<span
			class="bg-primary-content my-1 block h-0.5 w-6 transition-opacity duration-300"
			class:opacity-0={isMenuOpen}
		></span>
		<span
			class="bg-primary-content block h-0.5 w-6 transition-all duration-300 ease-in-out"
			class:rotate-[-45deg]={isMenuOpen}
			class:translate-y-[-6px]={isMenuOpen}
		></span>
	</div>
	<span class="dock-label text-primary-content text-xs font-semibold">{$t('navbar.dock.menu')}</span
	>
{/snippet}

{#if isMenuOpen}
	<div class="sheet-overlay" transition:fade|global={{ duration: 160, easing: cubicOut }}>
		<button
			type="button"
			class="sheet-backdrop"
			aria-label={$t('navbar.close_menu')}
			onclick={closeMenu}
		></button>

		<div
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			class="sheet-panel bg-base-100"
			data-testid="menu-sheet"
			transition:fly|global={{ y: 24, duration: 180, easing: cubicOut }}
		>
			<div class="sheet-list">
				<a class="sheet-row" href={resolve('/(app)/browse/tasks')} data-testid="sheet-find-work">
					<IconMagnify class="sheet-icon text-primary" />
					<span>{$t('navbar.sheet.find_work')}</span>
				</a>
				<a class="sheet-row" href={resolve('/(app)/browse/services')} data-testid="sheet-find-help">
					<IconBriefcaseSearch class="sheet-icon text-primary" />
					<span>{$t('navbar.sheet.find_help')}</span>
				</a>
				{#if isTempStaffEnabled()}
					<a class="sheet-row" href={resolve('/(app)/browse/staff')} data-testid="sheet-hire-staff">
						<IconAccountHardHat class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.hire_staff')}</span>
					</a>
				{/if}
				{#if isMarketEnabled()}
					<a class="sheet-row" href={resolve('/(app)/browse/goods')} data-testid="sheet-buy-sell">
						<IconStorefrontOutline class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.buy_sell')}</span>
					</a>
				{/if}
				{#if $authState.isAuthenticated}
					<a class="sheet-row" href={resolve('/my-jobs')} data-testid="sheet-my-jobs">
						<IconBriefcaseOutline class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.my_jobs')}</span>
					</a>
					<a class="sheet-row" href={resolve('/create-service')} data-testid="sheet-offer-service">
						<IconPlusCircleOutline class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.offer_service')}</span>
					</a>
					<a class="sheet-row" href={resolve('/settings')} data-testid="sheet-settings">
						<IconCog class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.settings')}</span>
					</a>
				{:else}
					<a class="sheet-row" href={resolve('/auth/login')} data-testid="sheet-my-jobs">
						<IconBriefcaseOutline class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.my_jobs')}</span>
					</a>
					<a class="sheet-row" href={resolve('/auth/login')} data-testid="sheet-offer-service">
						<IconPlusCircleOutline class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.offer_service')}</span>
					</a>
					<a class="sheet-row" href={resolve('/auth/login')} data-testid="sheet-settings">
						<IconCog class="sheet-icon text-primary" />
						<span>{$t('navbar.sheet.settings')}</span>
					</a>
				{/if}
				<a class="sheet-row" href={resolve('/how-it-works')} data-testid="sheet-help">
					<IconHelpCircleOutline class="sheet-icon text-primary" />
					<span>{$t('navbar.sheet.help')}</span>
				</a>
			</div>
			{#if $authState.isAuthenticated}
				<div class="sheet-logout">
					<button
						type="button"
						class="sheet-row sheet-row-danger"
						onclick={handleLogoutClick}
						data-testid="sheet-logout"
					>
						<IconLogout class="sheet-icon" />
						<span>{$t('navbar.sheet.logout')}</span>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<div {@attach measureDock} class="dock pb-safe bg-primary text-black" data-testid="bottom-dock">
	<a
		class="dock-link"
		class:dock-active={currentSection === 'home'}
		href={resolve('/')}
		aria-current={currentSection === 'home' ? 'page' : undefined}
		data-testid="dock-home"
	>
		<IconHome class="text-primary-content h-8 w-8" />
		<span class="dock-label">{$t('navbar.dock.home')}</span>
	</a>
	{#if $authState.isAuthenticated}
		<button
			class="dock-menu-btn"
			class:dock-menu-open={isMenuOpen}
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.dock.menu')}
			data-testid="dock-menu"
		>
			{#if unreadCount > 0}
				<span class="dock-count" data-testid="dock-unread"
					>{unreadCount > 99 ? '99+' : unreadCount}</span
				>
			{/if}
			{@render hamburgerIcon()}
		</button>
		<a
			class="dock-link"
			class:dock-active={currentSection === 'post'}
			href={resolve('/create-task')}
			aria-current={currentSection === 'post' ? 'page' : undefined}
			data-testid="dock-post"
		>
			<span
				class="bg-primary-content text-primary flex h-9 w-9 items-center justify-center rounded-full"
			>
				<IconPlus class="h-6 w-6" />
			</span>
			<span class="dock-label">{$t('navbar.dock.post')}</span>
		</a>
		<a
			class="dock-link"
			class:dock-active={currentSection === 'wallet'}
			href={resolve('/wallet')}
			aria-current={currentSection === 'wallet' ? 'page' : undefined}
			data-testid="dock-wallet"
		>
			<IconWalletOutline class="text-primary-content h-8 w-8" />
			<span class="dock-label">{$t('navbar.dock.wallet')}</span>
		</a>
		<a
			class="dock-link"
			class:dock-active={currentSection === 'help'}
			href={resolve('/how-it-works')}
			aria-current={currentSection === 'help' ? 'page' : undefined}
			data-testid="dock-help"
		>
			<IconHelpCircleOutline class="text-primary-content h-8 w-8" />
			<span class="dock-label">{$t('navbar.dock.help')}</span>
		</a>
	{:else}
		<a
			class="dock-link"
			class:dock-active={currentSection === 'about'}
			href={resolve('/about')}
			aria-current={currentSection === 'about' ? 'page' : undefined}
			data-testid="dock-about"
		>
			<IconInformationOutline class="text-primary-content h-8 w-8" />
			<span class="dock-label">{$t('navbar.dock.about')}</span>
		</a>
		<button
			class="dock-menu-btn"
			class:dock-menu-open={isMenuOpen}
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.dock.menu')}
			data-testid="dock-menu"
		>
			{@render hamburgerIcon()}
		</button>
		<a
			class="dock-link"
			class:dock-active={currentSection === 'help'}
			href={resolve('/how-it-works')}
			aria-current={currentSection === 'help' ? 'page' : undefined}
			data-testid="dock-help"
		>
			<IconHelpCircleOutline class="text-primary-content h-8 w-8" />
			<span class="dock-label">{$t('navbar.dock.help')}</span>
		</a>
		<a
			class="dock-link"
			class:dock-active={currentSection === 'signup'}
			href={resolve('/auth/signup')}
			aria-current={currentSection === 'signup' ? 'page' : undefined}
			data-testid="dock-signup"
		>
			<IconAccountPlus class="text-primary-content h-8 w-8" />
			<span class="dock-label">{$t('navbar.dock.signup')}</span>
		</a>
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
		align-items: stretch;
		justify-content: space-around;
		padding: 0.35rem 0.25rem;
		padding-bottom: calc(0.35rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
		min-height: 72px;
		width: 100%;
		z-index: 100;
	}

	.dock-link {
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-width: 0;
		min-height: 3.5rem;
		padding: 0.25rem;
		border-radius: 0.75rem;
		-webkit-tap-highlight-color: transparent;
	}

	.dock-link.dock-active {
		background: hsl(var(--pc) / 0.18);
	}

	.dock-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
		line-height: 1.1;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.dock-menu-btn {
		position: relative;
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 3.5rem;
		min-width: 0;
		max-width: 100%;
		padding: 0.25rem;
		border-radius: 0.75rem;
		-webkit-tap-highlight-color: transparent;
	}

	.dock-menu-open,
	.dock-menu-btn:hover {
		background: hsl(var(--pc) / 0.18);
	}

	.dock-count {
		position: absolute;
		top: 0.15rem;
		right: 0.35rem;
		min-width: 1.125rem;
		height: 1.125rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: #111;
		color: #fff;
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1.125rem;
		text-align: center;
		white-space: nowrap;
	}

	.sheet-overlay {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		bottom: var(--app-dock-height, 5rem);
		z-index: 90;
	}

	.sheet-backdrop {
		position: absolute;
		inset: 0;
		background: hsl(0 0% 0% / 0.35);
	}

	.sheet-panel {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		max-height: 100%;
		overflow: auto;
		border-radius: 1.25rem 1.25rem 0 0;
		padding: 0.5rem 0 0.25rem;
	}

	.sheet-list,
	.sheet-logout {
		display: flex;
		flex-direction: column;
	}

	.sheet-logout {
		margin-top: 0.5rem;
		border-top: 1px solid var(--color-base-300);
	}

	:global(.sheet-row) {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		min-height: 4rem;
		padding: 0.75rem 1.25rem;
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.2;
		text-align: left;
		color: var(--color-base-content);
	}

	:global(.sheet-row:hover) {
		background: color-mix(in srgb, var(--color-base-content), transparent 94%);
	}

	:global(.sheet-icon) {
		width: 2rem;
		height: 2rem;
		flex: 0 0 auto;
	}

	.sheet-row-danger {
		color: var(--color-error);
	}

	.sheet-row-danger :global(.sheet-icon) {
		color: var(--color-error);
	}
</style>
