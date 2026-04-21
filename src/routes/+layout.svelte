<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import '$lib/i18n/i18n';
	import { page } from '$app/state';
	import { darkMode, initializeTheme } from '$lib/stores/theme.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import { hideSplashScreenWhenReady } from '$lib/utils/helpers/splashScreen';
	import {
		BITTASKER_ORG_JSONLD,
		BITTASKER_SITE_NAVIGATION_JSONLD
	} from '$lib/utils/constants/seo.constants';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
	import BitTaskerFooter from '$lib/components/BitTaskerFooter.svelte';
	import '../app.css';

	const { children } = $props();

	/**
	 * vite:preloadError fires when a dynamic import chunk fails to load,
	 * which happens when the user has stale in-memory JS after a new deployment
	 * replaced the old chunk hashes. Calling event.preventDefault() suppresses
	 * the error from propagating to unhandledrejection, then we reload once to
	 * fetch fresh index.html with the new chunk references.
	 * The key is scoped to the build version so a flag from a previous deployment
	 * never blocks a reload for a different deployment.
	 */
	const CHUNK_RELOAD_KEY = `chunk-reload-${__BUILD_VERSION__}`;

	const handlePreloadError = (event: Event & { payload: Error }) => {
		if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
			// First failure for this build version: suppress + reload once.
			event.preventDefault();
			sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
			location.reload();
		}
		// Flag already set: this is a persistent error (not a stale-cache issue).
		// Let the error propagate naturally so handleError in hooks.client.ts
		// can surface it through Sentry.
	};

	// Derive layout state from current route
	const currentPath = $derived(page.url.pathname);
	const isOnboardingPage = $derived(currentPath.includes('/onboarding'));
	const isLandingPage = $derived(
		currentPath === '/' || currentPath === '/how-it-works' || currentPath.startsWith('/auth')
	);
	const showTopBar = $derived(!isOnboardingPage);
	const showFooterSection = $derived(
		currentPath.includes('/dashboard') || currentPath.includes('/earning')
	);
	const shouldHideFooterForLoggedInTaskPage = $derived(
		($authState.isAuthenticated || $user?.npub) && currentPath.match(/^\/tasks\/[^/]+$/)
	);
	const shouldHideFooterForTasksPage = $derived(currentPath === '/tasks');
	const shouldHideFooterForLoggedInNpubPage = $derived(
		($authState.isAuthenticated || $user?.npub) && currentPath.match(/^\/npub\/[^/]+$/)
	);
	const shouldHideFooterForLoggedInServicePage = $derived(
		($authState.isAuthenticated || $user?.npub) && currentPath.match(/^\/services\/[^/]+$/)
	);
	const shouldHideFooterForServicesPage = $derived(currentPath === '/services');
	const shouldHideFooterForReviewsPage = $derived(currentPath === '/reviews');

	// Generate breadcrumbs from current path
	const breadcrumbList = $derived.by(() => {
		if (currentPath === '/') return {};

		const segments = currentPath.split('/').filter(Boolean);
		return {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: segments.map((segment: string, i: number) => ({
				'@type': 'ListItem',
				position: i + 1,
				name: segment.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
				item: `https://bittasker.com/${segments.slice(0, i + 1).join('/')}`
			}))
		};
	});

	// Initialize keyboard helpers for protected routes
	async function initializeProtectedRouteHelpers() {
		const isProtected =
			currentPath.includes('/dashboard') ||
			currentPath.includes('/earning') ||
			currentPath.includes('/profile') ||
			currentPath.includes('/settings');

		if (!isProtected) return;

		const [deviceModule, keyboardModule] = await Promise.all([
			import('$lib/stores/device.store'),
			import('$lib/utils/helpers/keyboard')
		]);

		await Promise.all([
			deviceModule.initializeDevicePlatform(),
			deviceModule.getOnboardingCompleted()
		]);

		keyboardModule.setupKeyboardListeners();
		keyboardModule.setupGlobalInputFocusScroll();
	}

	onMount(() => {
		initializeTheme();
		hideSplashScreenWhenReady(300);

		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(() => initializeProtectedRouteHelpers(), { timeout: 2000 });
		} else {
			setTimeout(() => initializeProtectedRouteHelpers(), 100);
		}

		window.addEventListener('vite:preloadError', handlePreloadError);

		// Global error handler
		const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
			const error = event instanceof ErrorEvent ? event.error : event.reason;

			// Skip logging null/undefined errors (often from third-party libraries like SES)
			if (error === null || error === undefined) {
				return;
			}

			// Only log meaningful errors
			const errorMessage =
				error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);

			// Skip empty or meaningless error messages
			if (!errorMessage || errorMessage === 'null' || errorMessage === 'undefined') {
				return;
			}

			console.error('[Global Error Handler]:', {
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
				type: event instanceof ErrorEvent ? 'error' : 'unhandledrejection',
				timestamp: new Date().toISOString()
			});
			if (event instanceof ErrorEvent) event.preventDefault();
		};

		window.addEventListener('error', handleError);
		window.addEventListener('unhandledrejection', handleError);

		return () => {
			window.removeEventListener('vite:preloadError', handlePreloadError);
			window.removeEventListener('error', handleError);
			window.removeEventListener('unhandledrejection', handleError);
		};
	});

	// Primary app scroll container (middle area in app-shell layout)
	let scrollEl = $state<HTMLElement | null>(null);
	onMount(() => {
		appScrollContainer.set(scrollEl);
		return () => appScrollContainer.set(null);
	});

	$effect(() => {
		// Keep store up to date when element binds
		if (scrollEl) appScrollContainer.set(scrollEl);
	});

	// Measure the actual footer height and expose it as a CSS variable.
	// This avoids any bottom-nav overlap caused by height rounding, fonts, or safe-area differences.
	let footerEl = $state<HTMLElement | null>(null);
	let footerObserver: ResizeObserver | null = null;

	$effect(() => {
		if (footerObserver) {
			footerObserver.disconnect();
			footerObserver = null;
		}

		// If the footer is unmounted (or not rendered on desktop), ensure we don't keep a stale value.
		if (!footerEl) {
			if (typeof document !== 'undefined') {
				document.documentElement.style.setProperty('--app-footer-height', `0px`);
			}
			return;
		}

		if (typeof ResizeObserver === 'undefined') return;

		let mq: MediaQueryList | null = null;
		const onMqChange = () => updateVar();

		function updateVar() {
			const el = footerEl;
			if (!el || typeof document === 'undefined') return;

			// Desktop (lg+) has no bottom dock/footer; avoid leaving a stale mobile value around.
			const isLgUp =
				typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
			if (isLgUp) {
				document.documentElement.style.setProperty('--app-footer-height', `0px`);
				return;
			}

			// Avoid setting 0px during first paint / hidden states, which would
			// cause bottom-positioned UI to slip under the dock.
			const measured = Math.ceil(el.getBoundingClientRect().height ?? 0);
			if (measured <= 0) {
				// If the footer is actually hidden by CSS, 0 is correct.
				const isHidden =
					typeof window !== 'undefined' &&
					(window.getComputedStyle(el).display === 'none' ||
						window.getComputedStyle(el).visibility === 'hidden');
				if (isHidden) {
					document.documentElement.style.setProperty('--app-footer-height', `0px`);
				} else {
					// When switching from desktop->mobile, the footer can briefly report 0 before layout stabilizes.
					// Use the safe fallback immediately so floating UI doesn't get covered by the dock.
					document.documentElement.style.setProperty(
						'--app-footer-height',
						`var(--bottom-nav-height-safe)`
					);
				}
				return;
			}
			const h = Math.max(0, measured);
			document.documentElement.style.setProperty('--app-footer-height', `${h}px`);
		}

		updateVar();
		// Keep the variable in sync across breakpoint changes.
		if (typeof window !== 'undefined') {
			mq = window.matchMedia('(min-width: 1024px)');
			try {
				mq.addEventListener('change', onMqChange);
			} catch {
				// Safari fallback
				mq.addListener(onMqChange);
			}
		}
		footerObserver = new ResizeObserver(() => updateVar());
		footerObserver.observe(footerEl);

		return () => {
			footerObserver?.disconnect();
			footerObserver = null;
			if (mq) {
				try {
					mq.removeEventListener('change', onMqChange);
				} catch {
					mq.removeListener(onMqChange);
				}
			}
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

	<!-- Preload critical images -->
	<link href="/images/Logos/BitTasker-Logo-dark-mode.svg" as="image" />
	<link href="/images/Logos/BitTasker-Logo-light-mode.svg" as="image" />

	<!-- Global JSON-LD structured data for SEO - Inlined for critical content -->
	<!-- svelte-eslint-parser bug: literal `<script` inside template literals causes "Parsing error: Unexpected keyword or identifier". -->
	<!-- Workaround: use \u{73} for the 's' so the parser never sees a `<script` token. See: https://github.com/sveltejs/svelte-eslint-parser/issues/346 -->
	<!-- eslint-disable svelte/no-at-html-tags -->
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(BITTASKER_ORG_JSONLD)}</script>`}
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(BITTASKER_SITE_NAVIGATION_JSONLD)}</script>`}
	{#if page.url.pathname !== '/'}
		{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(breadcrumbList)}</script>`}
	{/if}
	<!-- eslint-enable svelte/no-at-html-tags -->

	<!-- Analytics tracking - only load in production -->
	{#if import.meta.env.MODE === 'production'}
		<script
			defer
			src="https://analyze.bittasker.com/script.js"
			data-website-id="60d3abf1-1032-4652-8b01-612280814595"
		></script>
	{/if}
</svelte:head>

<main data-theme={$darkMode ? 'dark' : 'light'} id="main" class="app-shell bg-base-200">
	{#if showTopBar}
		<header class="app-shell__header">
			<TopBar />
		</header>
	{/if}

	<!-- Scrollable middle content. This is the ONLY app-level scroll container. -->
	<div bind:this={scrollEl} class="app-shell__content bg-base-200">
		<div class="bg-base-200 overflow-x-hidden">
			{#if $devicePlatform === 'web' && !isLandingPage}
				<!-- Ensure web routes can use full-height (no unintended outer scrolling) -->
				<div class="bg-base-200 flex h-full min-h-0 flex-col overflow-x-hidden">
					{@render children()}
				</div>
			{:else}
				<div class="bg-base-200 flex min-h-0 flex-1 flex-col justify-between overflow-x-hidden">
					{@render children()}
				</div>
			{/if}
		</div>

		{#if !showFooterSection && showTopBar && !isOnboardingPage && !shouldHideFooterForLoggedInTaskPage && !shouldHideFooterForLoggedInServicePage && !shouldHideFooterForLoggedInNpubPage && !shouldHideFooterForTasksPage && !shouldHideFooterForServicesPage && !shouldHideFooterForReviewsPage}
			<div class="tasks-page-footer pt-12 lg:pt-16">
				{#if !$authState.isAuthenticated}
					<!-- Section 7: Final Call to Action (CTA) -->
					<section class="bg-primary text-primary-content py-16">
						<div class="container mx-auto px-4 text-center">
							<h2 class="text-4xl font-bold">{$t('homepage.v2.finalcta.title')}</h2>
							<p class="mx-auto mt-4 max-w-2xl text-lg">
								{$t('homepage.v2.finalcta.description')}
							</p>
							<div class="mt-8 flex flex-col items-center space-y-6">
								<div class="flex flex-wrap justify-center gap-4">
									<a
										href="/tasks"
										class="btn btn-lg border-none bg-black text-white shadow-lg transition-all duration-300 ease-in-out hover:bg-gray-800"
									>
										{$t('homepage.v2.finalcta.tasker_cta')}
									</a>
								</div>
								<div>
									<a
										href="/auth/signup"
										class="btn hover:bg-primary btn-lg border-none bg-white px-8 text-black shadow-lg transition-all duration-300 ease-in-out hover:text-white"
									>
										{$t('homepage.v2.finalcta.get_started')}
									</a>
								</div>
							</div>
						</div>
					</section>
				{/if}
				<BitTaskerFooter />
			</div>
		{/if}
	</div>

	<!-- BottomNavBar: Show on mobile/tablet (≤1024px) -->
	{#if showTopBar}
		<footer bind:this={footerEl} class="app-shell__footer lg:hidden">
			<BottomNavBar />
		</footer>
	{/if}
</main>

<!-- Toast notifications (fixed positioned) -->
<Toast />

<InfiniteScroll />

<!-- Global portal target — overlays (dropdowns, modals) teleport here to escape
     overflow:hidden/overflow-x:hidden ancestors that break fixed positioning -->
<div id="portal-root" style="position:relative;z-index:9999;"></div>

<style>
	/* Hide footer on mobile/tablet for tasks page */
	@media (max-width: 1023px) {
		.tasks-page-footer {
			display: none !important;
		}
	}
</style>
