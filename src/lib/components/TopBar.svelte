<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { profileStore } from '$lib/stores/profile.store';
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import LanguageDropdown from '$lib/components/LanguageDropdown.svelte';
	import DarkModeToggle from '$lib/components/DarkModeToggle.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import {
		LOGGED_IN_MENU_SECTIONS,
		LOGGED_OUT_MENU_SECTIONS,
		AVATAR_MENU_ITEMS,
		MOBILE_DRAWER_LOGGED_IN,
		MOBILE_AUTH_BUTTONS,
		type MenuItem,
		type MenuSection
	} from '$lib/utils/constants/menu.constants';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { getProfileUrl } from '$lib/utils/helpers/profile';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { browser } from '$app/environment';

	// Control drawer visibility
	let isDrawerOpen = $state(false);

	// Control logout confirmation modal
	let showLogoutModal = $state(false);

	// Share modal state
	let userNpub = $state<string | null>(null);
	let showShareModal = $state(false);
	let qrCodeDataUrl = $state<string | null>(null);
	let qrCodeLoading = $state(false);
	let qrCodeError = $state<string | null>(null);
	let copyLinkSuccess = $state(false);
	let copyNpubSuccess = $state(false);

	// Track if user is logged in
	let isLoggedIn = $derived($authState.isAuthenticated);

	// Dropdown state - track which section ID is open
	let openSectionId = $state<string | null>(null);

	// Control avatar dropdown visibility
	let isAvatarDropdownOpen = $state(false);

	// Initialize stores when component mounts
	onMount(async () => {
		if (isLoggedIn) {
			try {
				// Initialize user store
				await user.getUserData();
				// Initialize profile store if not already done
				if (!$profileStore.data) profileStore.init();
				// Get user's npub for share functionality
				const { value } = await Preferences.get({ key: StorageKeys.NPUB });
				userNpub = value || null;
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

	// Close drawer
	function closeDrawer() {
		isDrawerOpen = false;
	}

	// Function to close all dropdown menus
	function closeDropdowns() {
		openSectionId = null;
	}

	// Toggle dropdown section
	function toggleSection(sectionId: string) {
		openSectionId = openSectionId === sectionId ? null : sectionId;
	}

	// Handle menu item click
	function handleMenuItemClick(action?: string) {
		closeDropdowns();
		if (action === 'logout') logout();
		if (action === 'share_profile') openShareModal();
	}

	// Share functions
	function openShareModal() {
		showShareModal = true;
		isAvatarDropdownOpen = false; // Close dropdown when opening modal
		qrCodeDataUrl = null;
		qrCodeError = null;
		copyLinkSuccess = false;
		copyNpubSuccess = false;
		if (browser && userNpub) {
			generateQrCode();
		}
	}

	function closeShareModal() {
		showShareModal = false;
		copyLinkSuccess = false;
		copyNpubSuccess = false;
	}

	async function generateQrCode() {
		if (!browser || !userNpub) return;

		try {
			qrCodeLoading = true;
			qrCodeError = null;

			const profileUrl = `${window.location.origin}${getProfileUrl(userNpub)}`;
			const qrUrl = await generateQrCodeUrl(profileUrl);
			qrCodeDataUrl = qrUrl;
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			qrCodeError = $t('common.profile.qr_generation_failed');
		} finally {
			qrCodeLoading = false;
		}
	}

	async function copyProfileLink() {
		if (!browser || !userNpub) return;

		const profileUrl = `${window.location.origin}${getProfileUrl(userNpub)}`;
		const success = await copyToClipboard(profileUrl);
		if (success) {
			copyLinkSuccess = true;
			setTimeout(() => {
				copyLinkSuccess = false;
			}, 2000);
		}
	}

	async function copyNpub() {
		if (!userNpub) return;

		const success = await copyToClipboard(userNpub);
		if (success) {
			copyNpubSuccess = true;
			setTimeout(() => {
				copyNpubSuccess = false;
			}, 2000);
		}
	}

	function logout() {
		closeDrawer();
		closeDropdowns();
		showLogoutModal = true;
	}

	async function confirmedLogout() {
		showLogoutModal = false;
		await authState.logout();
		goto('/');
	}

	function cancelLogout() {
		showLogoutModal = false;
	}
</script>

<!-- Snippet for rendering a menu item -->
{#snippet menuItem(item: MenuItem)}
	<li>
		{#if item.action}
			<!-- Action button (like logout) -->
			<button
				onclick={() => handleMenuItemClick(item.action)}
				class="flex w-full items-center gap-2 whitespace-nowrap"
				class:text-error={item.isError}
			>
				<item.icon class={item.isError ? 'text-error' : 'text-primary'} />
				<span>{$t(item.label)}</span>
			</button>
		{:else}
			<!-- Regular link -->
			<a
				href={item.getDynamicHref ? item.getDynamicHref(isLoggedIn) : item.href || '#'}
				onclick={() => handleMenuItemClick()}
				class="flex items-center gap-2 whitespace-nowrap"
			>
				<item.icon class="text-primary" />
				<span>{$t(item.label)}</span>
			</a>
		{/if}
	</li>
{/snippet}

<!-- Snippet for rendering a menu section with manual dropdown (logged in) -->
{#snippet menuSection(section: MenuSection)}
	<li class="relative" use:clickOutside={{ callback: () => closeDropdowns() }}>
		<button
			class="btn btn-ghost flex items-center gap-2 hover:shadow-none"
			onclick={() => toggleSection(section.id)}
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
			<ul
				class="menu dropdown-content bg-base-100 rounded-box absolute left-0 z-100 mt-1 w-auto min-w-48 p-2 whitespace-nowrap shadow-lg"
			>
				{#each section.items as item}
					{@render menuItem(item)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<!-- Main TopBar component -->
<div
	class="navbar bg-base-100/80 border-base-300 pt-safe sticky top-0 z-50 w-full border-b backdrop-blur-sm"
>
	<!-- Navbar start -->
	<div class="navbar-start ml-2 flex-1 sm:flex">
		<a href={isLoggedIn ? '/dashboard' : '/'} class="block">
			<img
				src="/images/Logos/BitTasker-square-logo.svg"
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
			{#if isLoggedIn}
				<!-- Logged-in menu sections -->
				{#each LOGGED_IN_MENU_SECTIONS as section}
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
				{#each LOGGED_OUT_MENU_SECTIONS.slice(1) as section}
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
		{#if !isLoggedIn}
			<a href="/auth/login" class="btn btn-sm sm:btn-md btn-secondary">{$t('navbar.login')}</a>
			<a href="/auth/signup" class="btn btn-sm sm:btn-md btn-primary">{$t('navbar.signup')}</a>
		{:else}
			<!-- Avatar Dropdown -->
			<details
				class="dropdown dropdown-end"
				bind:open={isAvatarDropdownOpen}
				use:clickOutside={{ callback: () => isAvatarDropdownOpen = false }}
			>
				<summary class="btn btn-ghost">
					<Avatar name={$user.picture} picture={userPicture()} size="sm" />
				</summary>
				<ul
					class="menu dropdown-content bg-base-100 rounded-box right-0 z-10 mt-2 w-56 p-2 shadow-md"
				>
					{#each AVATAR_MENU_ITEMS as item}
						{@render menuItem(item)}
					{/each}
				</ul>
			</details>
		{/if}
	</div>
</div>

<!-- Mobile Drawer - Drawer is @deprecated in favor of BottomNavBar component -->
<Drawer isOpen={isDrawerOpen} onClose={closeDrawer} position="left" isScrollable={true}>
	{#snippet children()}
		<ul class="menu w-full">
			<!-- Dark mode toggle -->
			<li><DarkModeToggle /></li>

			<!-- Language submenu -->
			<li><LanguageDropdown onLanguageChange={closeDrawer} /></li>

			<li class="divider"></li>

			{#if isLoggedIn}
				<!-- Logged-in mobile menu -->
				{#each MOBILE_DRAWER_LOGGED_IN as item}
					<li>
						{#if item.action}
							<button
								onclick={() => {
									handleMenuItemClick(item.action);
									closeDrawer();
								}}
								class="flex items-center gap-2"
							>
								<item.icon />
								{$t(item.label)}
							</button>
						{:else if item.href}
							<a href={item.href} onclick={closeDrawer} class="flex items-center gap-2">
								<item.icon />
								{$t(item.label)}
							</a>
						{/if}
					</li>
				{/each}
			{:else}
				<!-- Logged-out mobile menu -->
				{@const loginBtn = MOBILE_AUTH_BUTTONS.login}
				{@const signupBtn = MOBILE_AUTH_BUTTONS.signup}
				<li class="mt-4 flex flex-col gap-2">
					<a
						href={loginBtn.href}
						class="btn btn-secondary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
						<loginBtn.icon />
						{$t(loginBtn.label)}
					</a>
					<a
						href={signupBtn.href}
						class="btn btn-primary flex w-full items-center justify-center gap-2"
						onclick={closeDrawer}
					>
						<signupBtn.icon />
						{$t(signupBtn.label)}
					</a>
				</li>
			{/if}
		</ul>
	{/snippet}
</Drawer>

<!-- Logout Confirmation Modal -->
<ConfirmModal
	isOpen={showLogoutModal}
	title={$t('common.components.confirm_modal.logout.title')}
	message={$t('common.components.confirm_modal.logout.message')}
	confirmText={$t('common.components.confirm_modal.logout.confirm_button')}
	confirmButtonClass="btn-primary"
	onConfirm={confirmedLogout}
	onCancel={cancelLogout}
/>

<!-- Share Modal -->
{#if showShareModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<div class="mb-6">
				<h3 class="text-lg font-bold">{$t('common.profile.share_profile')}</h3>
			</div>

			<div class="space-y-4">
				<!-- QR Code -->
				<div class="flex flex-col items-center">
					{#if qrCodeLoading}
						<div class="flex h-64 w-64 items-center justify-center">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{:else if qrCodeError}
						<div class="alert alert-error alert-outline">
							<span>{qrCodeError}</span>
						</div>
					{:else if qrCodeDataUrl}
						<img src={qrCodeDataUrl} alt="Profile QR Code" class="h-64 w-64" />
					{/if}
				</div>

				<!-- Copy Link Button -->
				<button class="btn btn-primary btn-block" onclick={copyProfileLink}>
					{#if copyLinkSuccess}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.profile.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.profile.copy_link')}
					{/if}
				</button>

				<!-- Copy npub Button -->
				<button class="btn btn-outline btn-block" onclick={copyNpub}>
					{#if copyNpubSuccess}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.profile.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.profile.copy_npub')}
					{/if}
				</button>
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeShareModal}>
					{$t('common.close')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeShareModal}>X</button>
	</div>
{/if}

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

	/* Ensure dropdown positioning works correctly in navbar */
	:global(.navbar-center .menu.menu-horizontal > li.relative) {
		position: relative;
	}

	:global(.navbar-center .dropdown-content) {
		position: absolute;
		top: 100%;
		left: 0;
	}
</style>
