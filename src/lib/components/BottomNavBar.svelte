<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { authState } from '$lib/stores/auth.store';
	import { ImpactStyle, triggerHaptic } from '$lib/utils/helpers/haptics';
	// Icon imports for unplugin-icons
	import IconLogout from '~icons/mdi/logout';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import IconFrequentlyAskedQuestions from '~icons/mdi/frequently-asked-questions';
	import IconEmailOutline from '~icons/mdi/email-outline';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconShieldAccount from '~icons/mdi/shield-account';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconAccountCircle from '~icons/mdi/account-circle';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconCog from '~icons/mdi/cog';
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

	let currentSection = $state('');
	let isLoggedIn = $state(false);

	function handleBottomNavTap(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target) return;
		const interactive = target.closest('a,button,[role="button"]');
		if (!interactive) return;
		void triggerHaptic(ImpactStyle.Light);
	}

	// Route detection for active states - immediate update
	$effect(() => {
		const path = page.url.pathname;
		// More specific route detection for active states
		if (path === '/dashboard') {
			currentSection = 'home';
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
		// protectedRoute logic removed; login state handled separately
	});

	// Bottom nav should always be visible; no auto-hide on scroll.

	// Control menu visibility
	let isMenuOpen = $state(false);
	let isMenuClosing = $state(false);
	// Ensures the menu animates from collapsed -> expanded on open
	let isMenuExpanding = $state(false);

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

	// Control individual collapse states
	let isTaskersOpen = $state(false);
	let isTaskeesOpen = $state(false);
	let isCompanyOpen = $state(false);

	let unsubscribeAuth: (() => void) | undefined;

	onMount(() => {
		// Subscribe to auth store for live updates
		unsubscribeAuth = authState.subscribe((state) => {
			isLoggedIn = state.isAuthenticated;
		});

		// Initial token presence check (no Nostr libs)
		(async () => {
			const { value } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			isLoggedIn = Boolean(value);
		})();
	});

	// Close menu before any navigation
	beforeNavigate(() => {
		if (isMenuOpen && !isMenuClosing) {
			closeMenu();
		}
	});

	// Toggle menu
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

	// Close menu with animation
	function closeMenu() {
		if (isMenuOpen && !isMenuClosing) {
			// Stop the expand state so collapse animation takes precedence
			isMenuExpanding = false;
			isMenuClosing = true;
			// Close all collapses when closing the menu
			closeAllCollapses();
			// Wait for slide-down animation to complete before hiding
			setTimeout(() => {
				isMenuOpen = false;
				isMenuClosing = false;
			}, 300); // Match animation duration
		}
	}

	// Handle navigation with menu closing for SPA navigation
	async function handleNavWithMenuClose(event: MouseEvent, href: string) {
		event.preventDefault();
		event.stopPropagation();
		closeMenu();
		await goto(href, { noScroll: false, replaceState: false });
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

	onDestroy(() => {
		if (unsubscribeAuth) unsubscribeAuth();
	});
</script>

<!-- Bottom-sheet menu overlay (under the dock) -->
{#if isMenuOpen || isMenuClosing}
	<div class="bottom-nav-overlay fixed inset-0 z-70 flex flex-col justify-end" onclickcapture={handleBottomNavTap}>
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
			class="bottom-nav-menu bg-base-100/80 border-base-300 w-full rounded-t-2xl border-t shadow-lg backdrop-blur-sm"
			style="
				/* Panel extends behind the dock so it appears to slide from behind it */
				max-height: calc(52rem + var(--app-footer-height, var(--bottom-nav-height-safe)));
				/* Reserve space for the dock, but don't include the safe-area padding */
				padding-bottom: max(
					0px,
					calc(
						var(--app-dock-height, var(--app-footer-height, var(--bottom-nav-height-safe))) - env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0px))
					)
				);
				overflow: hidden;
			"
			class:menu-expand={isMenuExpanding && !isMenuClosing}
			class:menu-collapse={isMenuClosing || (!isMenuExpanding && !isMenuClosing)}
		>
			<div class="bottom-nav-scroll max-h-208 overflow-y-auto pt-2">
				<div class="p-2">
				{#if isLoggedIn}
					<!-- Logged-in user menu -->
					<ul class="menu w-full">
						<!-- Logout -->
						<li>
							<button
								onclick={() => {
									closeMenu(); /* Add logout logic here */
								}}
								class="min-h-[48px] w-full py-3 text-left"
							>
								<IconLogout class="text-error" />
								<span class="text-error font-medium">{$t('navbar.logout')}</span>
							</button>
						</li>

						<!-- Support & Help -->
						<li>
							<button onclick={toggleCompany} class="min-h-[48px] py-3">
								<IconHelpCircleOutline class="text-primary" />
								<span class="font-medium">{$t('navbar.support_help')}</span>
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
								<a href="/how-it-works" onclick={(e) => handleNavWithMenuClose(e, '/how-it-works')} class="min-h-[44px] py-2 pl-6">
									<IconHelpCircleOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.how_it_works')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/faq" onclick={(e) => handleNavWithMenuClose(e, '/faq')} class="min-h-[44px] py-2 pl-6">
									<IconFrequentlyAskedQuestions class="text-primary" />
									<span class="font-medium">{$t('navbar.faq')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/contact" onclick={(e) => handleNavWithMenuClose(e, '/contact')} class="min-h-[44px] py-2 pl-6">
									<IconEmailOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.contact_support')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/feedback" onclick={(e) => handleNavWithMenuClose(e, '/feedback')} class="min-h-[44px] py-2 pl-6">
									<IconCommentTextOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.feedback')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/security" onclick={(e) => handleNavWithMenuClose(e, '/security')} class="min-h-[44px] py-2 pl-6">
									<IconShieldCheck class="text-primary" />
									<span class="font-medium">{$t('footer.security')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/about" onclick={(e) => handleNavWithMenuClose(e, '/about')} class="min-h-[44px] py-2 pl-6">
									<IconInformationOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.about_us')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/terms" onclick={(e) => handleNavWithMenuClose(e, '/terms')} class="min-h-[44px] py-2 pl-6">
									<IconFileDocumentOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.terms_of_service')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/privacy" onclick={(e) => handleNavWithMenuClose(e, '/privacy')} class="min-h-[44px] py-2 pl-6">
									<IconShieldAccount class="text-primary" />
									<span class="font-medium">{$t('navbar.privacy_policy')}</span>
								</a>
							</li>
						{/if}

						<!-- Task Management -->
						<li>
							<button onclick={toggleTaskees} class="min-h-[48px] py-3">
								<IconBriefcaseOutline class="text-primary" />
								<span class="font-medium">{$t('navbar.task_management')}</span>
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
							<a href="/tasks" onclick={(e) => handleNavWithMenuClose(e, '/tasks')} class="min-h-[44px] py-2 pl-6">
								<IconMagnify class="text-primary" />
								<span class="font-medium">{$t('navbar.find_tasks')}</span>
							</a>
						</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/dashboard" onclick={(e) => handleNavWithMenuClose(e, '/dashboard')} class="min-h-[44px] py-2 pl-6">
									<IconFormatListBulleted class="text-primary" />
									<span class="font-medium">{$t('navbar.my_tasks')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/dashboard/create-task" onclick={(e) => handleNavWithMenuClose(e, '/dashboard/create-task')} class="min-h-[44px] py-2 pl-6">
									<IconPlusCircleOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.create_task')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/dashboard?tab=bids" onclick={(e) => handleNavWithMenuClose(e, '/dashboard?tab=bids')} class="min-h-[44px] py-2 pl-6">
									<IconInvoiceTextSendOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.bids_sent')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/dashboard?tab=contracts" onclick={(e) => handleNavWithMenuClose(e, '/dashboard?tab=contracts')} class="min-h-[44px] py-2 pl-6">
									<IconFileSign class="text-primary" />
									<span class="font-medium">{$t('navbar.contracts')}</span>
								</a>
							</li>
						{/if}

						<!-- My Account -->
						<li>
							<button onclick={toggleTaskers} class="min-h-[48px] py-3">
								<IconAccountCircle class="text-primary" />
								<span class="font-medium">{$t('navbar.my_account')}</span>
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
								<a
									href="/dashboard/messages"
									onclick={(e) => handleNavWithMenuClose(e, '/dashboard/messages')}
									class="min-h-[44px] py-2 pl-6"
								>
									<IconChatOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.messages')}</span>
								</a>
							</li>

							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a
									href="/dashboard/wallet"
									onclick={(e) => handleNavWithMenuClose(e, '/dashboard/wallet')}
									class="min-h-[44px] py-2 pl-6"
								>
									<IconWalletOutline class="text-primary" />
									<span class="font-medium">{$t('navbar.wallet')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a
									href="/dashboard/profile"
									onclick={(e) => handleNavWithMenuClose(e, '/dashboard/profile')}
									class="min-h-[44px] py-2 pl-6"
								>
									<IconAccount class="text-primary" />
									<span class="font-medium">{$t('navbar.profile')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a
									href="/dashboard/settings"
									onclick={(e) => handleNavWithMenuClose(e, '/dashboard/settings')}
									class="min-h-[44px] py-2 pl-6"
								>
									<IconCog class="text-primary" />
									<span class="font-medium">{$t('navbar.settings')}</span>
								</a>
							</li>
						{/if}

					</ul>
				{:else}
					<!-- Logged-out user menu (existing structure) -->
					<!-- Auth buttons at the top -->
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
						<!-- Main menu items - matching desktop nav structure -->
						<li>
							<a href="/tasks" onclick={(e) => handleNavWithMenuClose(e, '/tasks')} class="min-h-[48px] py-3">
								<IconHome class="text-primary" />
								<span class="font-medium">{$t('navbar.home')}</span>
							</a>
						</li>
						<li>
							<a href="/how-it-works" onclick={(e) => handleNavWithMenuClose(e, '/how-it-works')} class="min-h-[48px] py-3">
								<IconHelpCircleOutline class="text-primary" />
								<span class="font-medium">{$t('footer.how_it_works')}</span>
							</a>
						</li>

						<!-- For Taskers collapse -->
						<li>
							<button onclick={toggleTaskers} class="min-h-[48px] py-3">
								<IconBriefcaseOutline class="text-primary" />
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
								<a href="/dashboard/create-task" onclick={(e) => handleNavWithMenuClose(e, '/dashboard/create-task')} class="min-h-[44px] py-2 pl-6">
									<IconPlusCircleOutline class="text-primary" />
									<span class="font-medium">{$t('footer.post_task')}</span>
								</a>
							</li>

							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/taskee-fees" onclick={(e) => handleNavWithMenuClose(e, '/taskee-fees')} class="min-h-[44px] py-2 pl-6">
									<IconCurrencyUsd class="text-primary" />
									<span class="font-medium">{$t('footer.tasker_fees')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/secure-payments" onclick={(e) => handleNavWithMenuClose(e, '/secure-payments')} class="min-h-[44px] py-2 pl-6">
									<IconShieldCheckOutline class="text-primary" />
									<span class="font-medium">{$t('footer.escrow')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/faq" onclick={(e) => handleNavWithMenuClose(e, '/faq')} class="min-h-[44px] py-2 pl-6">
									<IconFrequentlyAskedQuestions class="text-primary" />
									<span class="font-medium">{$t('footer.faq')}</span>
								</a>
							</li>
						{/if}

						<!-- For Taskees collapse -->
						<li>
							<button onclick={toggleTaskees} class="min-h-[48px] py-3">
								<IconAccountHardHat class="text-primary" />
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
							<a href="/tasks" onclick={(e) => handleNavWithMenuClose(e, '/tasks')} class="min-h-[44px] py-2 pl-6">
								<IconCurrencyBtc class="text-primary" />
								<span class="font-medium">{$t('footer.start_earning')}</span>
							</a>
						</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/community-guidelines" onclick={(e) => handleNavWithMenuClose(e, '/community-guidelines')} class="min-h-[44px] py-2 pl-6">
									<IconAccountGroup class="text-primary" />
									<span class="font-medium">{$t('footer.community_guidelines')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/taskee-fees" onclick={(e) => handleNavWithMenuClose(e, '/taskee-fees')} class="min-h-[44px] py-2 pl-6">
									<IconCurrencyUsd class="text-primary" />
									<span class="font-medium">{$t('footer.tasker_fees')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/tasker-principles" onclick={(e) => handleNavWithMenuClose(e, '/tasker-principles')} class="min-h-[44px] py-2 pl-6">
									<IconInvoiceTextSendOutline class="text-primary" />
									<span class="font-medium">{$t('footer.tasker_principles')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/faq" onclick={(e) => handleNavWithMenuClose(e, '/faq')} class="min-h-[44px] py-2 pl-6">
									<IconFrequentlyAskedQuestions class="text-primary" />
									<span class="font-medium">{$t('footer.tasker_faq')}</span>
								</a>
							</li>
						{/if}

						<!-- Company collapse -->
						<li>
							<button onclick={toggleCompany} class="min-h-[48px] py-3">
								<IconDomain class="text-primary" />
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
								<a href="/about" onclick={(e) => handleNavWithMenuClose(e, '/about')} class="min-h-[44px] py-2 pl-6">
									<IconInformationOutline class="text-primary" />
									<span class="font-medium">{$t('footer.about_us')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/security" onclick={(e) => handleNavWithMenuClose(e, '/security')} class="min-h-[44px] py-2 pl-6">
									<IconShieldCheck class="text-primary" />
									<span class="font-medium">{$t('footer.security')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/careers" onclick={(e) => handleNavWithMenuClose(e, '/careers')} class="min-h-[44px] py-2 pl-6">
									<IconBriefcaseSearch class="text-primary" />
									<span class="font-medium">{$t('footer.careers')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/press" onclick={(e) => handleNavWithMenuClose(e, '/press')} class="min-h-[44px] py-2 pl-6">
									<IconNewspaper class="text-primary" />
									<span class="font-medium">{$t('footer.press')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/terms" onclick={(e) => handleNavWithMenuClose(e, '/terms')} class="min-h-[44px] py-2 pl-6">
									<IconFileDocumentOutline class="text-primary" />
									<span class="font-medium">{$t('footer.terms')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/privacy" onclick={(e) => handleNavWithMenuClose(e, '/privacy')} class="min-h-[44px] py-2 pl-6">
									<IconShieldAccount class="text-primary" />
									<span class="font-medium">{$t('footer.privacy')}</span>
								</a>
							</li>
							<li transition:slide={{ duration: 500, axis: 'y', easing: backOut }}>
								<a href="/contact" onclick={(e) => handleNavWithMenuClose(e, '/contact')} class="min-h-[44px] py-2 pl-6">
									<IconEmailOutline class="text-primary" />
									<span class="font-medium">{$t('footer.contact')}</span>
								</a>
							</li>
						{/if}
					</ul>
				{/if}
				</div>
			</div>

			{#if isLoggedIn}
				<!-- Quick actions pinned above the dock -->
				<div class="bottom-nav-quick border-base-300/70 bg-base-100/70 border-t px-2 py-2 backdrop-blur-sm">
					<div class="flex gap-2">
						<a
							href="/tasks"
							onclick={(e) => handleNavWithMenuClose(e, '/tasks')}
							class="hover:bg-base-200 flex flex-1 flex-col items-center justify-center gap-1 rounded-lg p-2 transition-colors"
						>
							<IconMagnify class="text-primary h-6 w-6" />
							<span class="font-medium text-xs text-center">{$t('navbar.find_tasks')}</span>
						</a>
						<a
							href="/dashboard?tab=contracts"
							onclick={(e) => handleNavWithMenuClose(e, '/dashboard?tab=contracts')}
							class="hover:bg-base-200 flex flex-1 flex-col items-center justify-center gap-1 rounded-lg p-2 transition-colors"
						>
							<IconFileSign class="text-primary h-6 w-6" />
							<span class="font-medium text-xs text-center">{$t('navbar.contracts')}</span>
						</a>
						<a
							href="/dashboard?tab=bids"
							onclick={(e) => handleNavWithMenuClose(e, '/dashboard?tab=bids')}
							class="hover:bg-base-200 flex flex-1 flex-col items-center justify-center gap-1 rounded-lg p-2 transition-colors"
						>
							<IconInvoiceTextSendOutline class="text-primary h-6 w-6" />
							<span class="font-medium text-xs text-center">{$t('navbar.bids_sent')}</span>
						</a>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Bottom Navigation Bar -->
{#if isLoggedIn}
	<!-- Dock is fixed at bottom of screen and animates in/out based on scroll -->
	<div
		bind:this={dockEl}
		class="dock pb-safe bg-primary/95 border-base-300/70 z-80 border-t text-black backdrop-blur-sm"
		onclickcapture={handleBottomNavTap}
	>
		<!-- Home -->
		<a
			href="/dashboard"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'home'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconHome class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.home')}</span>
		</a>

		<!-- New Task -->
		<a
			href="/dashboard/create-task"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'create-task'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconPlusCircleOutline class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.new_task')}</span>
		</a>

		<!-- Center Menu Button (Hamburger/X) -->
		<button
			data-menu-button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors"
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
		>
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
					class:-rotate-45={isMenuOpen && !isMenuClosing}
					class:-translate-y-1={isMenuOpen && !isMenuClosing}
				></span>
			</div>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.menu')}</span>
		</button>

		<!-- Wallet -->
		<a
			href="/dashboard/wallet"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'wallet'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconWalletOutline class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.wallet')}</span>
		</a>

		<!-- Messages -->
		<a
			href="/dashboard/messages"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'messages'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconChatOutline class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.messages')}</span>
		</a>
	</div>
{:else}
	<div
		bind:this={dockEl}
		class="dock pb-safe bg-primary/95 border-base-300/70 z-80 border-t text-black backdrop-blur-sm"
		onclickcapture={handleBottomNavTap}
	>
		<!-- Home -->
		<a
			href="/tasks"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'home'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconHome class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.home')}</span>
		</a>

		<!-- About -->
		<a
			href="/about"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'about'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconInformationOutline class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.about')}</span>
		</a>

		<!-- Center Menu Button (Hamburger/X) -->
		<button
			data-menu-button
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors"
			onclick={toggleMenu}
			aria-label={isMenuOpen ? $t('navbar.close_menu') : $t('navbar.menu')}
		>
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
					class:-rotate-45={isMenuOpen && !isMenuClosing}
					class:-translate-y-1={isMenuOpen && !isMenuClosing}
				></span>
			</div>
			<span class="text-primary-content text-xs font-medium">{$t('navbar.menu')}</span>
		</button>

		<!-- How It Works -->
		<a
			href="/how-it-works"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'help'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconHelpCircleOutline class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.help')}</span>
		</a>

		<!-- Sign Up -->
		<a
			href="/auth/signup"
			class="hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors {currentSection ===
			'signup'
				? 'dock-active'
				: ''}"
			data-sveltekit-reload="off"
		>
			<IconAccountPlus class="text-primary-content" />
			<span class="dock-label font-medium">{$t('navbar.signup')}</span>
		</a>
	</div>
{/if}

<style>
	.pb-safe {
		padding-bottom: env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0));
	}

	/* Dock positioning - flex layout with safe area insets */
	.dock {
		display: flex;
		align-items: center;
		justify-content: space-around;
		padding: 0.5rem 0;
		padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0)));
		min-height: 64px;
		height: auto;
		width: 100%;
	}

	/* Backdrop fade for seamless open/close */
	.bottom-nav-backdrop {
		opacity: 0;
		transition: opacity 300ms ease;
	}

	.bottom-nav-backdrop.backdrop-visible {
		opacity: 0.3;
	}

	/* Menu starts collapsed, expands upward using transform instead of max-height */
	.bottom-nav-menu {
		transform: translateY(100%);
		transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		will-change: transform;
	}
	.menu-expand {
		transform: translateY(0);
	}
	.menu-collapse {
		transform: translateY(100%);
	}

	/* Simplified scrollbar styling - removed problematic scrollbar-color */
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

	/* Optimized arrow animations for better performance */
	.dropdown-arrow {
		transform-origin: center;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform;
		transform: rotate(0deg);
	}

	.dropdown-arrow.dropdown-open {
		transform: rotate(180deg);
	}

	/* Simplified hover effects to avoid complex transform combinations */
	.menu li > button:hover .dropdown-arrow {
		transform: rotate(0deg) scale(1.05);
	}

	.menu li > button:hover .dropdown-arrow.dropdown-open {
		transform: rotate(180deg) scale(1.05);
	}

	/* Optimize hamburger menu animations */
	.dock button[data-menu-button] span {
		will-change: transform, opacity;
		transform-origin: center;
		backface-visibility: hidden;
	}

	/* Do not override .bottom-nav-menu transform (used for slide animation) */
	.bottom-nav-menu {
		backface-visibility: hidden;
	}

	/* Override any scrollbar-color properties that might cause issues */
	/* * {
		scrollbar-color: unset !important;
	} */

</style>
