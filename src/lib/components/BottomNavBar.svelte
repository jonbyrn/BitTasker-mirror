<script lang="ts">
	import type { Locales } from '$lib/stores/i18n.store';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { darkMode } from '$lib/stores/theme.store';
	import { t, locale, setLocale, LANGUAGES, getCurrentLanguageFlag } from '$lib/stores/i18n.store';
	import { slide } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import 'iconify-icon';

	// Control menu visibility
	let isMenuOpen = $state(false);
	let isMenuClosing = $state(false);

	// Control individual collapse states
	let isLanguageOpen = $state(false);
	let isClientsOpen = $state(false);
	let isTaskersOpen = $state(false);
	let isCompanyOpen = $state(false);

	// Language switcher handler
	const handleLanguageChange = async (code: Locales) => {
		try {
			await setLocale(code);
			closeMenu(); // Close menu with animation after language change
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	// Toggle menu
	function toggleMenu() {
		if (isMenuOpen) {
			closeMenu();
		} else {
			isMenuOpen = true;
			isMenuClosing = false;
		}
	}

	// Close menu with animation
	function closeMenu() {
		if (isMenuOpen && !isMenuClosing) {
			isMenuClosing = true;
			// Close all collapses when closing the menu
			closeAllCollapses();
			// Wait for slide-down animation to complete before hiding
			setTimeout(() => {
				isMenuOpen = false;
				isMenuClosing = false;
			}, 500); // Match animation duration
		}
	}

	// Close all collapse menus
	function closeAllCollapses() {
		isLanguageOpen = false;
		isClientsOpen = false;
		isTaskersOpen = false;
		isCompanyOpen = false;
	}

	// Toggle individual collapse sections
	function toggleLanguage() {
		const wasOpen = isLanguageOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isLanguageOpen = true;
		}
	}

	function toggleClients() {
		const wasOpen = isClientsOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isClientsOpen = true;
		}
	}

	function toggleTaskers() {
		const wasOpen = isTaskersOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isTaskersOpen = true;
		}
	}

	function toggleCompany() {
		const wasOpen = isCompanyOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isCompanyOpen = true;
		}
	}

	// Handle clicks outside menu to close it
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		
		// Check if click is inside the expanded menu area
		const isInsideExpandedMenu = target.closest('.bottom-nav-menu');
		
		// Check if click is on the menu button itself (center button)
		const isMenuButton = target.closest('[data-menu-button]');
		// Close menu if clicking outside the expanded menu and not on the menu button
		if (!isInsideExpandedMenu && !isMenuButton && isMenuOpen && !isMenuClosing) {
			closeMenu();
		}
	}

	onMount(() => {
		// Add click outside handler
		if (typeof document !== 'undefined') {
			document.addEventListener('click', handleClickOutside);
		}
	});

	onDestroy(() => {
		// Remove click outside handler
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<!-- Sliding Menu Overlay - Behind the navigation -->
{#if isMenuOpen || isMenuClosing}
	<div
		class="bottom-nav-menu fixed left-0 right-0 bg-base-100/80 border-t border-base-300 rounded-t-2xl shadow-lg z-40 backdrop-blur-sm"
		style="bottom: 64px; overflow: hidden;"
		class:menu-expand={isMenuOpen && !isMenuClosing}
		class:menu-collapse={isMenuClosing}
	>
		<div class="max-h-[52rem] overflow-y-auto pt-4 pb-safe">
			<div class="p-4">
				<ul class="menu w-full">
					<!-- Auth buttons at the top -->
					<li class="mb-2 flex flex-col gap-3">
						<a
							href="/auth/login"
							class="btn btn-secondary btn-block flex items-center justify-center gap-2"
							onclick={closeMenu}
						>
							<iconify-icon icon="mdi:login" width="20"></iconify-icon>
							{$t('navbar.login')}
						</a>
						<a
							href="/auth/signup"
							class="btn btn-primary btn-block flex items-center justify-center gap-2"
							onclick={closeMenu}
						>
							<iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
							{$t('navbar.signup')}
						</a>
					</li>
					<div class="divider"></div>
					<!-- Main menu items - matching desktop nav structure -->
					<li>
						<a href="/" onclick={closeMenu} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:home" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('navbar.home')}</span>
						</a>
					</li>
					<li>
						<a href="/how-it-works" onclick={closeMenu} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:help-circle-outline" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('footer.how_it_works')}</span>
						</a>
					</li>

					<!-- For Clients collapse -->
					<li>
						<button
							onclick={toggleClients}
							class="min-h-[48px] py-3"
						>
							<iconify-icon icon="mdi:briefcase-outline" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('footer.for_clients')}</span>
							<svg class="ml-auto h-4 w-4 dropdown-arrow" class:dropdown-open={isClientsOpen} fill="currentColor" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1">
								<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</button>
					</li>
					{#if isClientsOpen}
						<div transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<li>
								<a href="/dashboard/create-task" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:plus-circle-outline" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.post_task')}</span>
								</a>
							</li>
							<li>
								<a href="/how-it-works" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:help-circle-outline" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.how_it_works')}</span>
								</a>
							</li>
							<li>
								<a href="/client-fees" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:currency-usd" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.client_fees')}</span>
								</a>
							</li>
							<li>
								<a href="/escrow" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:shield-check-outline" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.escrow')}</span>
								</a>
							</li>
							<li>
								<a href="/faq" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:frequently-asked-questions" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.faq')}</span>
								</a>
							</li>
						</div>
					{/if}

					<!-- For Taskers collapse -->
					<li>
						<button
							onclick={toggleTaskers}
							class="min-h-[48px] py-3"
						>
							<iconify-icon icon="mdi:account-hard-hat" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('footer.for_taskers')}</span>
							<svg class="ml-auto h-4 w-4 dropdown-arrow" class:dropdown-open={isTaskersOpen} fill="currentColor" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1">
								<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</button>
					</li>
					{#if isTaskersOpen}
						<div transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<li>
								<a href="/dashboard/find-tasks" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:currency-btc" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.start_earning')}</span>
								</a>
							</li>
							<li>
								<a href="/community-guidelines" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:account-group" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.community_guidelines')}</span>
								</a>
							</li>
							<li>
								<a href="/tasker-fees" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:currency-usd" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.tasker_fees')}</span>
								</a>
							</li>
							<li>
								<a href="/tasker-principles" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:handshake" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.tasker_principles')}</span>
								</a>
							</li>
							<li>
								<a href="/faq" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:frequently-asked-questions" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.tasker_faq')}</span>
								</a>
							</li>
						</div>
					{/if}

					<!-- Company collapse -->
					<li>
						<button
							onclick={toggleCompany}
							class="min-h-[48px] py-3"
						>
							<iconify-icon icon="mdi:domain" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('footer.company')}</span>
							<svg class="ml-auto h-4 w-4 dropdown-arrow" class:dropdown-open={isCompanyOpen} fill="currentColor" viewBox="0 0 20 20" stroke="currentColor" stroke-width="1">
								<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</button>
					</li>
					{#if isCompanyOpen}
						<div transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<li>
								<a href="/about" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:information-outline" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.about_us')}</span>
								</a>
							</li>
							<li>
								<a href="/security" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:shield-check" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.security')}</span>
								</a>
							</li>
							<li>
								<a href="/careers" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:briefcase-search" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.careers')}</span>
								</a>
							</li>
							<li>
								<a href="/press" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:newspaper" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.press')}</span>
								</a>
							</li>
							<li>
								<a href="/terms" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:file-document-outline" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.terms')}</span>
								</a>
							</li>
							<li>
								<a href="/privacy" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:shield-account" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.privacy')}</span>
								</a>
							</li>
							<li>
								<a href="/contact" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
									<iconify-icon icon="mdi:email-outline" width="20" class="text-primary"></iconify-icon>
									<span class="font-medium">{$t('footer.contact')}</span>
								</a>
							</li>
						</div>
					{/if}
				</ul>
			</div>
		</div>
	</div>
{/if}

<!-- Bottom Navigation Bar -->
<div class="fixed bottom-0 left-0 right-0 z-50 bg-primary/95 backdrop-blur-sm pb-safe">
	<!-- Bottom Navigation Icons -->
	<div class="bottom-nav-bar flex items-center justify-between px-4 py-1">
		<!-- Home -->
		<button
			class="flex flex-col items-center gap-1 p-3 rounded-lg transition-colors hover:bg-primary-content/10 min-h-[48px] min-w-[48px]"
			onclick={() => goto('/')}
		>
			<iconify-icon icon="mdi:home" width="24" class="text-primary-content"></iconify-icon>
			<span class="text-xs font-medium text-primary-content">{$t('navbar.home')}</span>
		</button>

		<!-- About -->
		<button
			class="flex flex-col items-center gap-1 p-3 rounded-lg transition-colors hover:bg-primary-content/10 min-h-[48px] min-w-[48px]"
			onclick={() => goto('/about')}
		>
			<iconify-icon icon="mdi:information-outline" width="24" class="text-primary-content"></iconify-icon>
			<span class="text-xs font-medium text-primary-content">{$t('navbar.about')}</span>
		</button>

		<!-- Center Menu Button (Hamburger/X) -->
		<button
			data-menu-button
			class="flex flex-col items-center gap-1 p-3 rounded-lg transition-colors hover:bg-primary-content/10 min-h-[48px] min-w-[48px]"
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
		>
			<div class="flex h-6 w-6 flex-col items-center justify-center">
				<span
					class="block h-0.5 w-5 bg-primary-content transition-transform duration-300 ease-in-out"
					class:rotate-45={isMenuOpen && !isMenuClosing}
					class:translate-y-2={isMenuOpen && !isMenuClosing}
				></span>
				<span
					class="my-1 block h-0.5 w-5 bg-primary-content transition-opacity duration-300"
					class:opacity-0={isMenuOpen && !isMenuClosing}
				></span>
				<span
					class="block h-0.5 w-5 bg-primary-content transition-transform duration-300 ease-in-out"
					class:-rotate-45={isMenuOpen && !isMenuClosing}
					class:-translate-y-1={isMenuOpen && !isMenuClosing}
				></span>
			</div>
			<span class="text-xs font-medium text-primary-content">{$t('navbar.menu')}</span>
		</button>

		<!-- How It Works -->
		<button
			class="flex flex-col items-center gap-1 p-3 rounded-lg transition-colors hover:bg-primary-content/10 min-h-[48px] min-w-[48px]"
			onclick={() => goto('/how-it-works')}
		>
			<iconify-icon icon="mdi:help-circle-outline" width="24" class="text-primary-content"></iconify-icon>
			<span class="text-xs font-medium text-primary-content">{$t('navbar.help')}</span>
		</button>

		<!-- Sign Up -->
		<button
			class="flex flex-col items-center gap-1 p-3 rounded-lg transition-colors hover:bg-primary-content/10 min-h-[48px] min-w-[48px]"
			onclick={() => goto('/auth/signup')}
		>
			<iconify-icon icon="mdi:account-plus" width="24" class="text-primary-content"></iconify-icon>
			<span class="text-xs font-medium text-primary-content">{$t('navbar.signup')}</span>
		</button>
	</div>
</div>

<style>
	.pb-safe {
		padding-bottom: env(safe-area-inset-bottom, 0);
	}

	/* Menu starts collapsed (height 0), expands upward */
	.bottom-nav-menu {
		max-height: 0;
		transition: max-height 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}
	.menu-expand {
		max-height: 52rem; /* increased height to avoid scrollbars */
	}
	.menu-collapse {
		max-height: 0;
	}

	/* Custom scrollbar for menu */
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

	/* Improve button animations */
	.bottom-nav-bar button {
		transition: all 0.15s ease-out;
	}

	.bottom-nav-bar button:active {
		transform: scale(0.95);
	}

	/* Enhanced arrow animations for dropdown buttons */
	.dropdown-arrow {
		transform-origin: center;
		transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		transform: rotate(0deg);
	}
	
	.dropdown-arrow.dropdown-open {
		transform: rotate(180deg);
	}

	/* Add subtle bounce effect on arrow hover */
	.menu li > button:hover .dropdown-arrow {
		transform: scale(1.1) rotate(0deg);
	}
	
	.menu li > button:hover .dropdown-arrow.dropdown-open {
		transform: scale(1.1) rotate(180deg);
	}
</style>
