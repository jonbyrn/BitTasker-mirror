<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import '$lib/i18n/i18n';
	import { page } from '$app/state';
	import { darkMode, initializeTheme } from '$lib/stores/theme.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import TopBar from '$lib/components/TopBar.svelte';
	import { authState } from '$lib/stores/auth.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import {
		BITTASKER_ORG_JSONLD,
		BITTASKER_SITE_NAVIGATION_JSONLD
	} from '$lib/utils/constants/seo.constants';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
	import BitTaskerFooter from '$lib/components/BitTaskerFooter.svelte';
	import '../app.css';

	const { children } = $props();

	// Derive layout state from current route
	const currentPath = $derived(page.url.pathname);
	const isOnboardingPage = $derived(currentPath.includes('/onboarding'));
	const isLandingPage = $derived(
		currentPath === '/' || currentPath === '/how-it-works' || currentPath.startsWith('/auth')
	);
	const showTopBar = $derived(!isOnboardingPage);
	const showFooterSection = $derived(currentPath.includes('/dashboard'));
	const shouldHideFooterForLoggedInTaskPage = $derived(
		$authState.isAuthenticated && currentPath.match(/^\/tasks\/[^/]+$/)
	);
	const shouldHideFooterForLoggedInNpubPage = $derived(
		$authState.isAuthenticated && currentPath.match(/^\/npub\/[^/]+$/)
	);

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
		// Initialize theme from saved preference
		initializeTheme();

		// Setup keyboard helpers for protected routes
		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(() => initializeProtectedRouteHelpers(), { timeout: 2000 });
		} else {
			setTimeout(() => initializeProtectedRouteHelpers(), 100);
		}

		// Global error handler
		const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
			const error = event instanceof ErrorEvent ? event.error : event.reason;
			console.error('[Global Error Handler]:', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				type: event instanceof ErrorEvent ? 'error' : 'unhandledrejection',
				timestamp: new Date().toISOString()
			});
			if (event instanceof ErrorEvent) event.preventDefault();
		};

		window.addEventListener('error', handleError);
		window.addEventListener('unhandledrejection', handleError);

		return () => {
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
					(window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden');
				if (isHidden) {
					document.documentElement.style.setProperty('--app-footer-height', `0px`);
				} else {
					// When switching from desktop->mobile, the footer can briefly report 0 before layout stabilizes.
					// Use the safe fallback immediately so floating UI doesn't get covered by the dock.
					document.documentElement.style.setProperty('--app-footer-height', `var(--bottom-nav-height-safe)`);
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
				// eslint-disable-next-line deprecation/deprecation
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
					// eslint-disable-next-line deprecation/deprecation
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
	{@html `<script type="application/ld+json">${JSON.stringify(BITTASKER_ORG_JSONLD)}</script>`}
	{@html `<script type="application/ld+json">${JSON.stringify(BITTASKER_SITE_NAVIGATION_JSONLD)}</script>`}
	{#if page.url.pathname !== '/'}
		{@html `<script type="application/ld+json">${JSON.stringify(breadcrumbList)}</script>`}
	{/if}

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
		<div class="bg-base-200 overflow-x-hidden pb-8">
			{#if $devicePlatform === 'web' && !isLandingPage}
				<div class="bg-base-200 overflow-x-hidden">
					{@render children()}
				</div>
			{:else}
				<div class="bg-base-200 flex min-h-0 flex-1 flex-col justify-between overflow-x-hidden pb-8">
					{@render children()}
				</div>
			{/if}
		</div>

		{#if !showFooterSection && showTopBar && !isOnboardingPage && !shouldHideFooterForLoggedInTaskPage && !shouldHideFooterForLoggedInNpubPage}
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
