<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { profileStore } from '$lib/stores/profile.store';
	import Avatar from '$lib/components/Avatar.svelte';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import DarkModeToggle from '$lib/components/DarkModeToggle.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import NotificationCenter from '$lib/components/notifications/NotificationCenter.svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconQrcode from '~icons/mdi/qrcode';
	import NpubQrCodeModal from '$lib/components/NpubQrCodeModal.svelte';
	import {
		LOGGED_IN_MENU_SECTIONS,
		LOGGED_OUT_MENU_SECTIONS,
		AVATAR_MENU_ITEMS,
		type MenuItem,
		type MenuSection
	} from '$lib/utils/constants/menu.constants';
	import { clickOutside } from '$lib/utils/clickOutside';

	// Control logout confirmation modal
	let showLogoutModal = $state(false);

	// Control npub QR code modal
	let showNpubQrModal = $state(false);

	// Dropdown state - track which section ID is open
	let openSectionId = $state<string | null>(null);

	// Popover transition for section dropdowns (kept for compatibility)
	function popoverTransition(
		node: Element,
		{ duration = 200, y = -8, start = 0.98 }: { duration?: number; y?: number; start?: number } = {}
	): TransitionConfig {
		return {
			duration,
			easing: cubicOut,
			css: (t) => {
				const ty = (1 - t) * y;
				const s = start + (1 - start) * t;
				return `transform: translate3d(0, ${ty}px, 0) scale(${s}); opacity: ${t};`;
			}
		};
	}

	function handleTopNavTap(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target) return;
		const interactive = target.closest('a,button,summary,[role="button"]');
		if (!interactive) return;
	}

	// Initialize stores when component mounts
	onMount(async () => {
		if ($authState.isAuthenticated) {
			try {
				// Initialize user store
				await user.getUserData();
				// Initialize profile store if not already done
				if (!$profileStore.data) profileStore.init();
			} catch (error) {
				console.error('Failed to initialize stores:', error);
			}
		}
	});

	// Derived values for avatar - prioritize username from database
	let userPicture = $derived(() => {
		// First priority: first image from pictures array
		if ($profileStore.data?.pictures && $profileStore.data.pictures.length > 0) {
			return $profileStore.data.pictures[0].url;
		}
		// Second priority: user store picture
		if ($user.picture) {
			return $user.picture;
		}
		// Third priority: profile store picture
		if ($profileStore.data?.picture) {
			return $profileStore.data.picture;
		}
		return '';
	});

	// Derived values for user display name
	let userDisplayName = $derived($profileStore.data?.name || $user.name || '');

	// Function to close all dropdown menus
	function closeDropdowns() {
		openSectionId = null;
	}

	// Toggle dropdown section
	function toggleSection(sectionId: string) {
		// If clicking the same section that's already open, close it
		// Otherwise, open the clicked section
		openSectionId = openSectionId === sectionId ? null : sectionId;
	}

	// Handle menu item click
	async function handleMenuItemClick(event: MouseEvent, action?: string, href?: string) {
		event.preventDefault();
		event.stopPropagation();
		closeDropdowns();
		if (action === 'logout') {
			logout();
		} else if (href) {
			await goto(href, { noScroll: false, replaceState: false });
		}
	}

	function logout() {
		closeDropdowns();
		showLogoutModal = true;
	}

	async function confirmedLogout() {
		showLogoutModal = false;
		await authState.logout();
		await goto('/', { replaceState: true });
	}

	function cancelLogout() {
		showLogoutModal = false;
	}

	function showNpubQrCode() {
		showNpubQrModal = true;
	}

	function closeNpubQrModal() {
		showNpubQrModal = false;
	}
</script>

<!-- Snippet for rendering a menu item -->
{#snippet menuItem(item: MenuItem)}
	<li>
		{#if item.action}
			<!-- Action button (like logout) -->
			<button
				onclick={(e) => handleMenuItemClick(e, item.action)}
				class="text-base-content flex w-full items-center gap-2 whitespace-nowrap"
				class:text-error={item.isError}
			>
				<item.icon class={`size-4 ${item.isError ? 'text-error' : 'text-base-content'}`} />
				<span>{$t(item.label)}</span>
			</button>
		{:else}
			<!-- Regular link -->
			{@const itemHref = item.getDynamicHref
				? item.getDynamicHref($authState.isAuthenticated)
				: item.href || '#'}
			<a
				href={itemHref}
				onclick={(e) => handleMenuItemClick(e, undefined, itemHref)}
				class="text-base-content flex items-center gap-2 whitespace-nowrap"
			>
				<item.icon class="text-base-content size-4" />
				<span>{$t(item.label)}</span>
			</a>
		{/if}
	</li>
{/snippet}

<!-- Snippet for rendering a menu section with manual dropdown (logged in) -->
{#snippet menuSection(section: MenuSection)}
	{@const buttonId = `menu-button-${section.id}`}
	<li class="relative">
		<button
			id={buttonId}
			class="btn btn-ghost flex items-center gap-2 hover:shadow-none"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				toggleSection(section.id);
			}}
			aria-expanded={openSectionId === section.id}
			aria-haspopup="true"
		>
			<section.icon class="text-primary" />
			<span>{$t(section.label)}</span>
			<IconChevronDown
				class={`transition-all duration-150 ${openSectionId === section.id ? 'rotate-180' : ''}`}
			/>
		</button>
		{#if openSectionId === section.id}
			<div
				class="absolute top-full left-0"
				use:clickOutside={{
					callback: () => closeDropdowns(),
					exclude: `#${buttonId}`
				}}
			>
				<div
					class="menu dropdown-content bg-base-100 rounded-box z-100 mt-1 w-auto min-w-48 p-2 whitespace-nowrap shadow-lg"
					style="transform-origin: top left;"
					role="menu"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Escape') {
							closeDropdowns();
						}
					}}
					transition:popoverTransition={{ duration: 200, y: -8, start: 0.98 }}
				>
					<ul>
						{#each section.items as item (item.label)}
							{@render menuItem(item)}
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</li>
{/snippet}

<!-- Main TopBar component -->
<div
	class="navbar bg-base-100/80 border-base-300 pt-safe sticky top-0 z-50 w-full border-b backdrop-blur-sm"
	onclickcapture={handleTopNavTap}
>
	<!-- Navbar start -->
	<div class="navbar-start ml-2 flex-1 sm:flex">
		<a href={$authState.isAuthenticated ? '/dashboard' : '/'} class="block">
			<img
				src="/images/logos/bittasker-logomark.svg"
				alt={$t('common.components.topbar.logo_alt')}
				class="mx-auto block max-h-10"
				width="40"
				height="40"
				style="aspect-ratio: 1/1;"
			/>
		</a>
		<LanguageDropdown onLanguageChange={closeDropdowns} />
	</div>

	<!-- Hide navbar-center on mobile and tablet -->
	<div class="navbar-center mx-auto hidden lg:flex">
		<ul class="menu menu-horizontal px-1">
			{#if $authState.isAuthenticated}
				<!-- Logged-in menu sections -->
				{#each LOGGED_IN_MENU_SECTIONS as section (section.id)}
					{@render menuSection(section)}
				{/each}
			{:else}
				<!-- Logged-out menu sections -->
				<!-- First item is standalone link -->
				{@const firstSection = LOGGED_OUT_MENU_SECTIONS[0]}
				<li>
					<a href="/how-it-works" class="btn btn-ghost">
						<firstSection.icon class="text-primary" />
						<span>{$t('footer.how_it_works')}</span>
					</a>
				</li>
				<!-- Rest are dropdown sections using DaisyUI details -->
				{#each LOGGED_OUT_MENU_SECTIONS.slice(1) as section (section.id)}
					{@render menuSection(section)}
				{/each}
			{/if}
		</ul>
	</div>

	<!-- Navbar End -->
	<div class="navbar-end mr-2 flex w-full flex-1 gap-1">
		<!-- Dark mode toggle and language dropdown -->
		<div class="mr-1 items-center md:flex">
			<DarkModeToggle />
		</div>
		<!-- login/signup or notification + avatar -->
		{#if !$authState.isAuthenticated}
			<a href="/auth/login" class="btn btn-sm sm:btn-md btn-secondary" data-testid="login-link"
				>{$t('navbar.login')}</a
			>
			<a href="/auth/signup" class="btn btn-sm sm:btn-md btn-primary">{$t('navbar.signup')}</a>
		{:else}
			<!-- Notification Center -->
			<NotificationCenter />
			<!-- Avatar Dropdown - uses Skeleton Popover with Portal -->
			<Popover>
				<Popover.Trigger class="btn btn-ghost min-w-0 flex-shrink-0 p-0 hover:shadow-none">
					<Avatar name={$user.name} picture={userPicture()} size="sm" />
				</Popover.Trigger>
				<Portal>
					<Popover.Positioner class="z-[100]" placement="bottom-end">
						<Popover.Content
							class="menu dropdown-content bg-base-100 rounded-box w-auto min-w-48 p-2 text-sm shadow-lg"
						>
							<!-- User Info Header -->
							{#if userDisplayName}
								<div class="border-base-content/10 border-b px-2 pb-2">
									<button
										onclick={showNpubQrCode}
										class="text-base-content flex w-full items-center gap-2 whitespace-nowrap"
									>
										<IconQrcode class="text-base-content size-4" />
										<span class="wrap-break-words font-bold whitespace-normal"
											>{userDisplayName}</span
										>
									</button>
								</div>
							{/if}
							<ul>
								{#each AVATAR_MENU_ITEMS as item (item.label)}
									{@render menuItem(item)}
								{/each}
							</ul>
						</Popover.Content>
					</Popover.Positioner>
				</Portal>
			</Popover>
		{/if}
	</div>
</div>

<!-- Logout Confirmation Modal -->
<ConfirmModal
	isOpen={showLogoutModal}
	title={$t('common.components.confirm_modal.logout.title')}
	message={$t('common.components.confirm_modal.logout.message')}
	confirmText={$t('common.components.confirm_modal.confirm')}
	confirmButtonClass="btn-primary"
	onConfirm={confirmedLogout}
	onCancel={cancelLogout}
/>

<!-- NPub QR Code Modal -->
<NpubQrCodeModal isOpen={showNpubQrModal} onClose={closeNpubQrModal} />

<style>
	/* Use SystemBars fallback pattern for safe area insets
	 * SystemBars injects --safe-area-inset-* variables for Android WebView < 140
	 * Fallback order: --safe-area-inset-* (SystemBars) -> env() (native) -> 0px
	 */
	.pt-safe {
		padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
	}
	/* Add bottom spacing when bottom nav is present */
	:global(body) {
		margin-bottom: 0;
	}

	/* iOS touch improvements for avatar dropdown button */
	:global(.navbar-end .btn.btn-ghost) {
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		cursor: pointer;
	}

	/* Ensure avatar button is clickable on iOS */
	:global(.navbar-end [class*='avatar']) {
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}
</style>
