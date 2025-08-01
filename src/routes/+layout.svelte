<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/stores/i18n.store';
	import { page } from '$app/stores'; // Fix import
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { darkMode, setDarkMode } from '$lib/stores/theme.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store'; // Import the store only
	import type { DeviceInfo } from '@capacitor/device';
	import TopBar from '$lib/components/TopBar.svelte';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import '../app.css';
	import { authState } from '$lib/stores/auth.store';
	let isLoggedIn = $derived($authState.isAuthenticated);

	// Global SEO JSON-LD - moved to dynamic injection
	import { BITTASKER_ORG_JSONLD, BITTASKER_WEBSITE_JSONLD, BITTASKER_SITE_NAVIGATION_JSONLD } from '$lib/utils/constants/seo.constants';

	// Import FontAwesome CSS - deferred to idle time
	let fontAwesomeLoaded = $state(false);

	const { children } = $props();

	// Control for showing top and bottom bars - can be overridden by child layouts
	let showTopBar = $state(true);
	let showFooterSection = $state(false); // Default to false, enabled in protected routes as needed
	let height = $state(window.innerHeight);
	let isLandingPage = $state(false);
	let isInitializing = $state(true); // Track initialization state

	let breadcrumbList = $state({});

	let deviceInfoValue = $state<DeviceInfo|null>(null);
	$effect(() => {
		deviceInfoValue = $deviceInfo;
	});

	// Defer device/theme/keyboard helpers to only run on relevant routes and after initial render
	const deferHelpers = () => {
		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(async () => {
				const path = $page.url.pathname;
				const isProtected = path.includes('/dashboard') || path.includes('/profile') || path.includes('/settings');
				if (isProtected) {
					const [deviceInfoModule, keyboardModule] = await Promise.all([
						import('$lib/stores/deviceInfo.store'),
						import('$lib/utils/helpers/keyboard')
					]);
					await Promise.all([
						deviceInfoModule.getDeviceInfo(),
						deviceInfoModule.getOnboardingCompleted()
					]);
					keyboardModule.setupKeyboardListeners();
					keyboardModule.setupGlobalInputFocusScroll();
				}
			}, { timeout: 2000 });
		} else {
			setTimeout(async () => {
				const path = $page.url.pathname;
				const isProtected = path.includes('/dashboard') || path.includes('/profile') || path.includes('/settings');
				if (isProtected) {
					const [deviceInfoModule, keyboardModule] = await Promise.all([
						import('$lib/stores/deviceInfo.store'),
						import('$lib/utils/helpers/keyboard')
					]);
					await Promise.all([
						deviceInfoModule.getDeviceInfo(),
						deviceInfoModule.getOnboardingCompleted()
					]);
					keyboardModule.setupKeyboardListeners();
					keyboardModule.setupGlobalInputFocusScroll();
				}
			}, 100);
		}
	};

	// Break up large functions - Critical operations only
	const initializeCriticalFeatures = async () => {
		// Only what's needed for initial render
		const { Preferences } = await import('@capacitor/preferences');
		const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });

		if (savedDarkMode) {
			$darkMode = savedDarkMode === 'true';
		}

		// Mark initialization as complete for critical operations
		isInitializing = false;
	};

	// Optimize event listeners - Use passive listeners where possible
	const setupThemeChangeListener = () => {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleThemeChange = async (e: MediaQueryListEvent) => {
			const { Preferences } = await import('@capacitor/preferences');
			const { value: changedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });
			if (!changedDarkMode) {
				$darkMode = e.matches;
			}
		};
		
		// Use passive listener where possible
		mediaQuery.addEventListener('change', handleThemeChange, { passive: true });
		
		return () => {
			mediaQuery.removeEventListener('change', handleThemeChange);
		};
	};

	// Update layout based on current route - Optimized with debouncing
	let routeChangeTimeout: ReturnType<typeof setTimeout>;
	const updateLayoutBasedOnRoute = () => {
		clearTimeout(routeChangeTimeout);
		routeChangeTimeout = setTimeout(() => {
			const path = $page.url.pathname;
			// Determine if on landing page (homepage, how-it-works, etc.)
			isLandingPage = path === '/' || path === '/how-it-works' || path.startsWith('/auth');

			// Show top bar everywhere except specific routes that handle their own layout
			showTopBar = !path.includes('/onboarding');

			// Only show bottom bar in dashboard routes
			showFooterSection = path.includes('/dashboard');

			// Generate breadcrumbs - deferred to idle time
			if (path !== '/') {
				const segments = path.split('/').filter(Boolean);
				breadcrumbList = {
					'@context': 'https://schema.org',
					'@type': 'BreadcrumbList',
					itemListElement: segments.map((segment: string, i: number) => ({
						'@type': 'ListItem',
						position: i + 1,
						name: segment.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
						item: `https://bittasker.com/${segments.slice(0, i + 1).join('/')}`
					}))
				};
			} else {
				breadcrumbList = {};
			}
		}, 50); // Small debounce to prevent excessive updates
	};

	// Optimized effect for route changes
	$effect(() => {
		updateLayoutBasedOnRoute();
	});

	$effect(() => {
		setDarkMode($darkMode);
	});

	// Font Awesome is now loaded via the link tag in the head

	// Initialize theme based on system preference - Broken up into smaller functions
	onMount(async (): Promise<any> => {
		// Critical operations first - only what's needed for initial render
		await initializeCriticalFeatures();
		
		// Setup theme change listener
		const themeCleanup = setupThemeChangeListener();
		
		// Font Awesome is loaded via link tag in the head
		
		// Defer all non-critical operations
		deferHelpers();

		// Return cleanup function for proper disposal
		return () => {
			clearTimeout(routeChangeTimeout);
			themeCleanup();
			// No cleanup needed for Font Awesome loaded via link tag
		};
	});
</script>

<svelte:head>
    <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="BitTasker" />
    <link rel="manifest" href="/site.webmanifest" />

    <!-- Font Awesome CSS is imported via app.css -->
    
    <!-- Preload critical resources -->
    <link rel="preload" href="/assets/fonts/fa-solid-900.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
    <link rel="preload" href="/assets/fonts/fa-brands-400.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
    
    <!-- Preload critical images -->
    <link rel="preload" href="/images/Logos/BitTasker-Logo-dark-mode.svg" as="image" />
    <link rel="preload" href="/images/Logos/BitTasker-Logo-light-mode.svg" as="image" />

    <!-- Global JSON-LD structured data for SEO - Inlined for critical content -->
    {@html `<script type="application/ld+json">${JSON.stringify(BITTASKER_ORG_JSONLD)}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(BITTASKER_WEBSITE_JSONLD)}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(BITTASKER_SITE_NAVIGATION_JSONLD)}</script>`}
    {#if $page.url.pathname !== '/'}
	    {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbList)}</script>`}
    {/if}
</svelte:head>

<svelte:window bind:innerHeight={height} />

<!-- Show loading state while initializing -->
{#if isInitializing}
	<div class="flex min-h-screen items-center justify-center">
		<div class="loading loading-spinner loading-lg"></div>
	</div>
{:else}
	<main
		data-theme={$darkMode ? 'BitTasker-Dark' : 'BitTasker-Light'}
		id="main"
		class="flex min-h-[100dvh] flex-col no-horizontal-scroll"
	>
		<!-- Desktop TopBar will be positioned fixed via its own component styles -->
		{#if showTopBar}
			<TopBar />
		{/if}

		<!-- <div
			class="flex flex-1 flex-col overflow-auto {deviceInfoValue?.platform === 'web' ? 'lg:pt-16' : ''}"
		> -->

		<div
			class="bg-base-200 flex flex-1 flex-col justify-between overflow-x-hidden"
			style={showFooterSection ? 'padding-bottom: var(--bottom-nav-height, 5rem);' : ''}
		>
			{#if deviceInfoValue?.platform === 'web' && !isLandingPage}
				<div class="bg-base-200 flex flex-grow lg:block">
					{@render children()}
				</div>
			{:else}
				<div
					class="bg-base-200 flex flex-1 flex-col justify-between overflow-x-hidden"
					style={showFooterSection ? 'padding-bottom: var(--bottom-nav-height, 5rem);' : ''}
				>
					{@render children()}
				</div>
			{/if}
		</div>
	{#if !showFooterSection && showTopBar}
		{#if !isLoggedIn}
			<!-- Section 7: Final Call to Action (CTA) -->
			<section class="bg-primary text-primary-content py-16">
				<div class="container mx-auto px-4 text-center">
					<h2 class="text-4xl font-bold">{$t('homepage.v2.finalcta.title')}</h2>
					<p class="mx-auto mt-4 max-w-2xl text-lg">{$t('homepage.v2.finalcta.description')}</p>
					<div class="mt-8 flex flex-col items-center space-y-6">
						<div class="flex flex-wrap justify-center gap-4">
							<a
								href="/dashboard/find-tasks"
								class="btn btn-lg border-none bg-black text-white shadow-lg hover:bg-gray-800"
							>
								{$t('homepage.v2.finalcta.tasker_cta')}
							</a>
							<a
								href="/dashboard/taskees"
								class="btn btn-lg border-none bg-black text-white shadow-lg hover:bg-gray-800"
							>
								{$t('homepage.v2.finalcta.taskee_cta')}
							</a>
						</div>
						<div>
							<a
								href="/auth/signup"
								class="btn hover:bg-primary btn-lg border-none bg-white px-8 text-black shadow-lg hover:text-white"
							>
								{$t('homepage.v2.finalcta.get_started')}
							</a>
						</div>
					</div>
				</div>
			</section>
		{/if}
		<footer class="bg-base-300 text-base-content/70 py-12">
			<div class="container mx-auto px-4">
				<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
					<!-- Company Info -->
					<div class="md:col-span-2 lg:col-span-1">
						<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.company_name')}</h4>
						<p class="mb-4">{$t('footer.company_description')}</p>
						<!-- Social media icons -->
						<div class="flex space-x-4">
							<a
								href="https://twitter.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.twitter_aria')}"
							>
								<i class="fa-brands fa-x-twitter"></i>
							</a>
							<a
								href="https://facebook.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.facebook_aria')}"
							>
								<i class="fa-brands fa-facebook"></i>
							</a>
							<a
								href="https://instagram.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.instagram_aria')}"
							>
								<i class="fa-brands fa-instagram"></i>
							</a>
							<a
								href="https://youtube.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.youtube_aria')}"
							>
								<i class="fa-brands fa-youtube"></i>
							</a>
							<a
								href="https://linkedin.com/company/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.linkedin_aria')}"
							>
								<i class="fa-brands fa-linkedin"></i>
							</a>
							<a
								href="https://reddit.com/r/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.reddit_aria')}"
							>
								<i class="fa-brands fa-reddit"></i>
							</a>
							<a
								href="https://tiktok.com/@bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.tiktok_aria')}"
							>
								<i class="fa-brands fa-tiktok"></i>
							</a>
							<a
								href="https://rumble.com/c/bittasker"
								class="hover:text-primary text-lg"
								aria-label="{$t('footer.social.rumble_aria')}"
							>
								<i class="fa-solid fa-play"></i>
							</a>
						</div>
					</div>

					<!-- Tasker and Taskee Columns (side by side on mobile) -->
					<div class="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-2">
						<!-- For Taskers -->
						<div>
							<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.for_taskers')}</h4>
							<ul class="space-y-2">
								
								
								<li><a href="/tasker-fees" class="hover:text-primary">{$t('footer.tasker_fees')}</a></li>
								<li><a href="/escrow" class="hover:text-primary">{$t('footer.escrow')}</a></li>
								<li><a href="/faq" class="hover:text-primary">{$t('footer.faq')}</a></li>
							</ul>
						</div>

						<!-- For Taskees -->
						<div>
							<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.for_taskees')}</h4>
							<ul class="space-y-2">
								<li>
									<a href="/dashboard/find-tasks" class="hover:text-primary">
										{$t('footer.start_earning')}
									</a>
								</li>
								<li>
									<a href="/community-guidelines" class="hover:text-primary"
										>{$t('footer.community_guidelines')}</a
									>
								</li>
								<li>
									<a href="/taskee-fees" class="hover:text-primary">{$t('footer.taskee_fees')}</a>
								</li>
								<li>
									<a href="/tasker-principles" class="hover:text-primary"
										>{$t('footer.tasker_principles')}</a
									>
								</li>
								<li>
									<a href="/faq" class="hover:text-primary">{$t('footer.tasker_faq')}</a>
								</li>
							</ul>
						</div>
					</div>

					<!-- Company -->
					<div class="lg:col-span-1">
						<h4 class="text-base-content mb-4 text-lg font-bold">{$t('footer.company')}</h4>
						<ul class="space-y-2">
							<li><a href="/about" class="hover:text-primary">{$t('footer.about_us')}</a></li>
							<li><a href="/security" class="hover:text-primary">{$t('footer.security')}</a></li>
							<li><a href="/careers" class="hover:text-primary">{$t('footer.careers')}</a></li>
							<li><a href="/press" class="hover:text-primary">{$t('footer.press')}</a></li>
							<li><a href="/terms" class="hover:text-primary">{$t('footer.terms')}</a></li>
							<li><a href="/privacy" class="hover:text-primary">{$t('footer.privacy')}</a></li>
							<li><a href="/contact" class="hover:text-primary">{$t('footer.contact')}</a></li>
						</ul>
					</div>
				</div>

				<div class="border-base-content/10 mt-12 border-t pt-8 text-center">
					<p>© {new Date().getFullYear()} {$t('footer.company_name')}. {$t('footer.copyright')}</p>
					<p class="mt-2 text-sm">
						{$t('footer.made_with')} 
						<svg class="inline-block w-4 h-4 mx-1" fill="currentColor" viewBox="0 0 24 24" style="color: #ef4444;">
							<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
						</svg>
						{$t('footer.and')} 
						<svg class="inline-block w-4 h-4 mx-1" viewBox="0 0 512 512" style="color: #F7931B;">
							<path d="M362.199,243.996c24.913-12.74,40.767-35.39,37.088-73.044    c-4.814-51.526-47.131-68.796-103.188-73.607V26.001H252.5v69.362c-11.325,0-22.932,0.283-34.539,0.564V26.001h-43.6v71.344    c-16.029,0.484-34.698,0.248-87.479,0v46.43c34.423-0.609,52.483-2.821,56.623,19.251V358.37    c-2.629,17.515-16.643,14.991-47.846,14.438l-8.775,51.809c79.495,0,87.479,0.284,87.479,0.284v61.099h43.601v-60.25    c11.888,0.285,23.498,0.285,34.539,0.285v59.965h43.599V424.9c73.043-3.964,121.871-22.366,128.384-91.16    C429.579,278.535,403.531,253.903,362.199,243.996z M218.811,146.889c24.631,0,101.639-7.643,101.639,43.599    c0,48.979-77.007,43.315-101.639,43.315V146.889z M218.811,373.093v-95.691c29.445,0,119.608-8.209,119.608,47.847    C338.418,379.321,248.255,373.093,218.811,373.093L218.811,373.093z" fill="currentColor"/>
						</svg>
						{$t('footer.in_el_salvador')}
					</p>
				</div>
			</div>
		</footer>
	{/if}

	<!-- BottomNavBar: Show on mobile/tablet (≤1024px) and native platforms -->
	{#if showTopBar}
		<div class="pb-safe right-0 bottom-0 left-0 z-50 lg:hidden">
			<BottomNavBar />
		</div>
	{/if}

	<!-- Toast notifications -->
	<Toast />
</main>
{/if}

