<script lang="ts">

	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t, setLocale } from '$lib/stores/i18n.store';
	import { slide } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import 'iconify-icon';

	let currentSection = $state('');
	let lastScrollPosition = $state(0);
	let isScrollingDown = $state(false);
	let isVisible = $state(true);
	let protectedRoute = $state(false);

	// Optimize route effect with debouncing
	let routeChangeTimeout: ReturnType<typeof setTimeout>;
	$effect.pre(() => {
		clearTimeout(routeChangeTimeout);
		routeChangeTimeout = setTimeout(() => {
			const path = page.url.pathname;
			currentSection = path.split('dashboard/')[1] || '';
			protectedRoute = page.url.pathname.includes('dashboard');
		}, 50); // Small debounce to prevent excessive updates
	});

	// Handle scroll visibility - hide when scrolling down, show when scrolling up
	// TODO: This solution is not working as expected, need to fix
	let scrollCleanup: (() => void) | undefined;

	// Control menu visibility
	let isMenuOpen = $state(false);
	let isMenuClosing = $state(false);

	// Control individual collapse states
	let isTaskersOpen = $state(false);
	let isTaskeesOpen = $state(false);
	let isCompanyOpen = $state(false);

	// Defer non-critical operations
	const deferNonCriticalOperations = () => {
		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(() => {
				// Setup scroll listeners if needed
				if (typeof window !== 'undefined') {
					window.addEventListener('scroll', handleScroll, { passive: true });
				}
			}, { timeout: 1000 });
		} else {
			// Fallback for browsers without requestIdleCallback
			setTimeout(() => {
				// Setup scroll listeners if needed
				if (typeof window !== 'undefined') {
					window.addEventListener('scroll', handleScroll, { passive: true });
				}
			}, 100);
		}
	};

	// Optimized scroll handler with throttling
	let scrollThrottleTimeout: ReturnType<typeof setTimeout>;
	function handleScroll() {
		if (scrollThrottleTimeout) return;
		
		scrollThrottleTimeout = setTimeout(() => {
			const currentScrollPosition = window.pageYOffset;
			isScrollingDown = currentScrollPosition > lastScrollPosition;
			lastScrollPosition = currentScrollPosition;
			scrollThrottleTimeout = null;
		}, 100); // Throttle scroll events
	}

	onMount(() => {
		// Defer non-critical operations
		deferNonCriticalOperations();
	});

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
		isTaskersOpen = false;
		isTaskeesOpen = false;
		isCompanyOpen = false;
	}

	function toggleTaskers() {
		const wasOpen = isTaskersOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isTaskersOpen = true;
		}
	}

	function toggleTaskees() {
		const wasOpen = isTaskeesOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isTaskeesOpen = true;
		}
	}

	function toggleCompany() {
		const wasOpen = isCompanyOpen;
		closeAllCollapses();
		if (!wasOpen) {
			isCompanyOpen = true;
		}
	}

	// Handle clicks outside menu to close it - optimized with passive listeners
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

	onDestroy(() => {
		// Clear timeouts
		clearTimeout(routeChangeTimeout);
		clearTimeout(scrollThrottleTimeout);
		
		// Remove scroll handler
		if (scrollCleanup) {
			scrollCleanup();
		}

		// Remove click outside handler
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleClickOutside);
		}

		// Remove scroll listener
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', handleScroll);
		}
	});
</script>

<!-- Sliding Menu Overlay - Behind the navigation -->
{#if isMenuOpen || isMenuClosing}
	<div
		class="bottom-nav-menu bg-base-100/80 border-base-300 fixed right-0 left-0 z-40 rounded-t-2xl border-t shadow-lg backdrop-blur-sm"
		style="bottom: 64px; overflow: hidden;"
		class:menu-expand={isMenuOpen && !isMenuClosing}
		class:menu-collapse={isMenuClosing}
	>
		<div class="pb-safe max-h-[52rem] overflow-y-auto pt-4">
			<div class="p-4">
				<!-- Auth buttons at the top -->
				<div class="mb-2 flex items-center justify-around">
					<a
						href="/auth/login"
						class="btn btn-secondary flex w-[48%] items-center justify-center gap-2"
						onclick={closeMenu}
					>
						<iconify-icon icon="mdi:login" width="20"></iconify-icon>
						{$t('navbar.login')}
					</a>
					<a
						href="/auth/signup"
						class="btn btn-primary flex w-[48%] items-center justify-center gap-2"
						onclick={closeMenu}
					>
						<iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
						{$t('navbar.signup')}
					</a>
				</div>
				<ul class="menu w-full">
					<li class="divider"></li>
					<!-- Main menu items - matching desktop nav structure -->
					<li>
						<a href="/" onclick={closeMenu} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:home" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('navbar.home')}</span>
						</a>
					</li>
					<li>
						<a href="/how-it-works" onclick={closeMenu} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:help-circle-outline" width="24" class="text-primary"
							></iconify-icon>
							<span class="font-medium">{$t('footer.how_it_works')}</span>
						</a>
					</li>

					<!-- For Taskers collapse -->
					<li>
						<button onclick={toggleTaskers} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:briefcase-outline" width="24" class="text-primary"
							></iconify-icon>
							<span class="font-medium">{$t('footer.for_taskers')}</span>
							<svg
								class="dropdown-arrow ml-auto h-4 w-4"
								class:dropdown-open={isTaskersOpen}
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
					{#if isTaskersOpen}
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/dashboard/create-task" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:plus-circle-outline" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.post_task')}</span>
							</a>
						</li>
					
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/taskee-fees" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:currency-usd" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.tasker_fees')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/escrow" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:shield-check-outline" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.escrow')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/faq" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon
									icon="mdi:frequently-asked-questions"
									width="20"
									class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.faq')}</span>
							</a>
						</li>
					{/if}

					<!-- For Taskees collapse -->
					<li>
						<button onclick={toggleTaskees} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:account-hard-hat" width="24" class="text-primary"
							></iconify-icon>
							<span class="font-medium">{$t('footer.for_taskees')}</span>
							<svg
								class="dropdown-arrow ml-auto h-4 w-4"
								class:dropdown-open={isTaskeesOpen}
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
					{#if isTaskeesOpen}
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/dashboard/find-tasks" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:currency-btc" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.start_earning')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/community-guidelines" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:account-group" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.community_guidelines')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/taskee-fees" onclick={closeMenu} class="pl-6 min-h-[44px] py-2">
								<iconify-icon icon="mdi:currency-usd" width="20" class="text-primary"></iconify-icon>
								<span class="font-medium">{$t('footer.tasker_fees')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/tasker-principles" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:handshake" width="20" class="text-primary"></iconify-icon>
								<span class="font-medium">{$t('footer.tasker_principles')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/faq" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon
									icon="mdi:frequently-asked-questions"
									width="20"
									class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.tasker_faq')}</span>
							</a>
						</li>
					{/if}

					<!-- Company collapse -->
					<li>
						<button onclick={toggleCompany} class="min-h-[48px] py-3">
							<iconify-icon icon="mdi:domain" width="24" class="text-primary"></iconify-icon>
							<span class="font-medium">{$t('footer.company')}</span>
							<svg
								class="dropdown-arrow ml-auto h-4 w-4"
								class:dropdown-open={isCompanyOpen}
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
					{#if isCompanyOpen}
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/about" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:information-outline" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.about_us')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/security" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:shield-check" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.security')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/careers" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:briefcase-search" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.careers')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/press" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:newspaper" width="20" class="text-primary"></iconify-icon>
								<span class="font-medium">{$t('footer.press')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/terms" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:file-document-outline" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.terms')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/privacy" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:shield-account" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.privacy')}</span>
							</a>
						</li>
						<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
							<a href="/contact" onclick={closeMenu} class="min-h-[44px] py-2 pl-6">
								<iconify-icon icon="mdi:email-outline" width="20" class="text-primary"
								></iconify-icon>
								<span class="font-medium">{$t('footer.contact')}</span>
							</a>
						</li>
					{/if}
				</ul>
			</div>
		</div>
	</div>
{/if}

<!-- Bottom Navigation Bar -->
{#if protectedRoute}
	<!-- Dock is fixed at bottom of screen and animates in/out based on scroll -->
	<div class="dock bg-primary/95 border-base-300/70 border-t backdrop-blur-sm text-black" class:hidden={!isVisible}>
		{#each sections as section}
			{#if section.mobile}
				<a
					href={`/dashboard/${section.id}`}
					class={currentSection === section.id ? 'dock-active' : ''}
					data-sveltekit-reload="off"
				>
					<iconify-icon icon={section.icon} width="24" class="text-primary-content"></iconify-icon>
					<span class="dock-label font-medium">{section.label}</span>
				</a>
			{/if}
		{/each}
	</div>
{:else}
	<div class="dock bg-primary/95 border-base-300/70 border-t backdrop-blur-sm">
		<!-- Home -->
		<button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg p-3 transition-colors"
			onclick={() => goto('/')}
		>
			<iconify-icon icon="mdi:home" width="24" class="text-primary-content"></iconify-icon>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.home')}</span>
		</button>

		<!-- About -->
		<button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg p-3 transition-colors"
			onclick={() => goto('/about')}
		>
			<iconify-icon icon="mdi:information-outline" width="24" class="text-primary-content"
			></iconify-icon>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.about')}</span>
		</button>

		<!-- Center Menu Button (Hamburger/X) -->
		<button
			data-menu-button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors"
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
		>
			<div class="flex h-6 w-6 flex-col items-center justify-center">
				<span
					class="bg-primary-content block h-0.5 w-5 transition-transform duration-300 ease-in-out"
					class:rotate-45={isMenuOpen && !isMenuClosing}
					class:translate-y-2={isMenuOpen && !isMenuClosing}
				></span>
				<span
					class="bg-primary-content my-1 block h-0.5 w-5 transition-opacity duration-300"
					class:opacity-0={isMenuOpen && !isMenuClosing}
				></span>
				<span
					class="bg-primary-content block h-0.5 w-5 transition-transform duration-300 ease-in-out"
					class:-rotate-45={isMenuOpen && !isMenuClosing}
					class:-translate-y-1={isMenuOpen && !isMenuClosing}
				></span>
			</div>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.menu')}</span>
		</button>

		<!-- How It Works -->
		<button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg p-3 transition-colors"
			onclick={() => goto('/how-it-works')}
		>
			<iconify-icon icon="mdi:help-circle-outline" width="24" class="text-primary-content"
			></iconify-icon>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.help')}</span>
		</button>

		<!-- Sign Up -->
		<button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg p-3 transition-colors"
			onclick={() => goto('/auth/signup')}
		>
			<iconify-icon icon="mdi:account-plus" width="24" class="text-primary-content"></iconify-icon>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.signup')}</span>
		</button>
	</div>
{/if}

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
