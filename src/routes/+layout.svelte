<script lang="ts">
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import '$lib/i18n/i18n';
	import { page } from '$app/state';
	import { darkMode, initializeTheme } from '$lib/stores/theme.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import TopBar from '$lib/components/TopBar.svelte';
	import { authState } from '$lib/stores/auth.store';
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
		// Global "prerender ready" signal for bot-rendering snapshots.
		// This helps Browser Rendering know when the SPA finished navigation and head tags are settled.
		const markNotReady = () => {
			window.__PRERENDER_READY__ = false;
			window.__PRERENDER_PATH__ = page.url.pathname;
		};

		const markReadySoon = async () => {
			// Allow a full microtask + DOM flush + 2 RAFs so <svelte:head> updates have time to apply.
			await tick();
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					window.__PRERENDER_READY__ = true;
					window.__PRERENDER_PATH__ = page.url.pathname;
				});
			});
		};

		markNotReady();
		markReadySoon();

		beforeNavigate(() => {
			markNotReady();
		});
		afterNavigate(() => {
			markNotReady();
			markReadySoon();
		});

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

<main
	data-theme={$darkMode ? 'dark' : 'light'}
	id="main"
	class="no-horizontal-scroll bg-base-200 min-h-dvh"
>
	<!-- Desktop TopBar will be positioned fixed via its own component styles -->
	{#if showTopBar}
		<TopBar />
	{/if}

	<div class="bg-base-200 overflow-x-hidden pb-8">
		{#if $devicePlatform === 'web' && !isLandingPage}
			<div class="bg-base-200 overflow-x-hidden">
				{@render children()}
			</div>
		{:else}
			<div
				class="bg-base-200 flex flex-1 flex-col justify-between overflow-x-hidden pb-8"
				style={showFooterSection ? 'padding-bottom: var(--bottom-nav-height, 5rem);' : ''}
			>
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
					<p class="mx-auto mt-4 max-w-2xl text-lg">{$t('homepage.v2.finalcta.description')}</p>
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

	<!-- BottomNavBar: Show on mobile/tablet (≤1024px) and native platforms -->
	{#if showTopBar}
		<div class="pb-safe right-0 bottom-0 left-0 z-50 lg:hidden">
			<BottomNavBar />
		</div>
	{/if}

	<!-- Toast notifications -->
	<Toast />
</main>

<InfiniteScroll />
