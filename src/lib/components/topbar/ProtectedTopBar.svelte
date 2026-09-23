<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { profileStore } from '$lib/stores/profile.store';
	import Avatar from '$lib/components/Avatar.svelte';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import DarkModeToggle from '$lib/components/DarkModeToggle.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import NotificationCenter from '$lib/components/notifications/NotificationBell.svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconQrcode from '~icons/mdi/qrcode';
	import NpubQrCodeModal from '$lib/components/NpubQrCodeModal.svelte';
	import {
		LOGGED_IN_MENU_SECTIONS,
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

	// Control avatar dropdown visibility
	let isAvatarDropdownOpen = $state(false);

	function popoverTransition(
		_node: Element,
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

	// Toggle avatar dropdown - pure JS controlled for iOS compatibility
	function toggleAvatarDropdown(event: MouseEvent) {
		event.stopPropagation();
		isAvatarDropdownOpen = !isAvatarDropdownOpen;
	}

	// Initialize stores when component mounts
	onMount(async () => {
		try {
			// Initialize user store
			await user.getUserData();
			// Initialize profile store if not already done
			if (!$profileStore.data) profileStore.init();
		} catch (error) {
			console.error('Failed to initialize stores:', error);
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
		isAvatarDropdownOpen = false;
		if (action === 'logout') {
			logout();
		} else if (href) {
			await goto(href, { noScroll: false, replaceState: false });
		}
	}

	function logout() {
		closeDropdowns();
		isAvatarDropdownOpen = false;
		showLogoutModal = true;
	}

	async function confirmedLogout() {
		showLogoutModal = false;
		await authState.logout();
	}

	function cancelLogout() {
		showLogoutModal = false;
	}

	function pathMatches(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/hiring' || href === '/earning' || href === '/wallet') {
			return path === href || path.startsWith(`${href}/`);
		}
		return path === href;
	}

	function activeItemHref(items: MenuItem[]): string | null {
		const matches = items
			.map((item) => item.href)
			.filter((href): href is string => Boolean(href) && pathMatches(href));
		if (matches.length === 0) return null;
		return matches.sort((left, right) => right.length - left.length)[0];
	}

	function activeHref(section: MenuSection): string | null {
		return activeItemHref(section.items);
	}

	function showNpubQrCode() {
		showNpubQrModal = true;
	}

	function closeNpubQrModal() {
		showNpubQrModal = false;
	}
</script>

<!-- Snippet for rendering a menu item -->
{#snippet menuItem(item: MenuItem, active: boolean)}
	<li>
		{#if item.action}
			<!-- Action button (like logout) -->
			<button
				onclick={(e) => handleMenuItemClick(e, item.action)}
				class="flex w-full items-center gap-2 whitespace-nowrap"
				class:text-error={item.isError}
			>
				<item.icon class={item.isError ? 'text-error' : 'text-primary'} />
				<span>{$t(item.label)}</span>
			</button>
		{:else}
			<!-- Regular link -->
			{@const itemHref = item.href || '#'}
			<a
				href={itemHref}
				onclick={(e) => handleMenuItemClick(e, undefined, itemHref)}
				class="flex items-center gap-2 whitespace-nowrap"
				class:font-semibold={active}
				aria-current={active ? 'page' : undefined}
			>
				<item.icon class="text-primary" />
				<span>{$t(item.label)}</span>
			</a>
		{/if}
	</li>
{/snippet}

<!-- Snippet for rendering a menu section with manual dropdown -->
{#snippet menuSection(section: MenuSection)}
	{@const buttonId = `menu-button-${section.id}`}
	<li class="relative">
		<button
			id={buttonId}
			class="btn btn-ghost flex items-center gap-2 hover:shadow-none"
			class:btn-active={activeHref(section) !== null}
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
						if (e.key === 'Escape') closeDropdowns();
					}}
					transition:popoverTransition={{ duration: 200, y: -8, start: 0.98 }}
				>
					<ul>
						{#each section.items as item (item.label)}
							{@render menuItem?.(item, activeHref(section) === item.href)}
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</li>
{/snippet}

<!-- Main TopBar component (authenticated users only) -->
<div
	class="navbar bg-base-100/80 border-base-300 sticky top-0 z-50 w-full border-b backdrop-blur-sm"
	onclickcapture={handleTopNavTap}
>
	<!-- Navbar start -->
	<div class="navbar-start ml-2 flex-1 sm:flex">
		<a href="/hiring" class="block">
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
			{#each LOGGED_IN_MENU_SECTIONS as section (section.id)}
				{@render menuSection?.(section)}
			{/each}
		</ul>
	</div>

	<!-- Navbar End -->
	<div class="navbar-end mr-2 flex w-full flex-1 gap-1">
		<!-- Dark mode toggle -->
		<div class="mr-1 items-center md:flex">
			<DarkModeToggle />
		</div>
		<!-- Notification Center -->
		<NotificationCenter />
		<!-- Avatar Dropdown - Pure JS controlled for iOS compatibility (no DaisyUI dropdown class) -->
		<div class="relative" use:clickOutside={{ callback: () => (isAvatarDropdownOpen = false) }}>
			<button
				class="btn btn-ghost"
				onclick={toggleAvatarDropdown}
				aria-haspopup="true"
				aria-expanded={isAvatarDropdownOpen}
			>
				<Avatar name={$user.name} picture={userPicture()} size="sm" />
			</button>
			{#if isAvatarDropdownOpen}
				<div
					class="menu bg-base-100 absolute top-full right-0 z-50 mt-2 w-56 rounded-sm p-2 shadow-md"
					style="transform-origin: top right;"
					role="menu"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Escape') isAvatarDropdownOpen = false;
					}}
					transition:popoverTransition={{ duration: 200, y: -8, start: 0.98 }}
				>
					<ul>
						<!-- User Info Header -->
						{#if userDisplayName}
							<li class="border-base-300 mb-2 border-b pb-2">
								<button
									onclick={showNpubQrCode}
									class="flex w-full items-center gap-2 whitespace-nowrap"
								>
									<IconQrcode class="text-primary" />
									<span class="wrap-break-words font-bold whitespace-normal">{userDisplayName}</span
									>
								</button>
							</li>
						{/if}
						{#each AVATAR_MENU_ITEMS as item (item.label)}
							{@render menuItem?.(item, activeItemHref(AVATAR_MENU_ITEMS) === item.href)}
						{/each}
					</ul>
				</div>
			{/if}
		</div>
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
	:global(body) {
		margin-bottom: 0;
	}
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
	:global(.navbar-center .menu.menu-horizontal > li.relative) {
		position: relative;
	}
	:global(.navbar-center .dropdown-content) {
		position: absolute;
		top: 100%;
		left: 0;
	}
</style>
