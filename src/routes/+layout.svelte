<script lang="ts">
	import { onMount } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { page } from '$app/state';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import { initializeTheme } from '$lib/stores/theme.store';
	import { applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';
	import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
	import { hideSplashScreenWhenReady } from '$lib/utils/helpers/splashScreen';
	import {
		BITTASKER_ORG_JSONLD,
		BITTASKER_SITE_NAVIGATION_JSONLD
	} from '$lib/utils/constants/seo.constants';
	import '../app.css';

	const { children } = $props();

	const showDock = $derived(!page.url.pathname.includes('/onboarding'));

	const measureFooter: Attachment = (node) => {
		const updateVar = () => {
			const isLgUp = window.matchMedia('(min-width: 1024px)').matches;
			if (isLgUp || getComputedStyle(node).display === 'none') {
				document.documentElement.style.setProperty('--app-footer-height', '0px');
				return;
			}
			const measured = Math.ceil(node.getBoundingClientRect().height ?? 0);
			document.documentElement.style.setProperty(
				'--app-footer-height',
				measured > 0 ? `${measured}px` : 'var(--bottom-nav-height-safe)'
			);
		};

		updateVar();
		const mq = window.matchMedia('(min-width: 1024px)');
		mq.addEventListener('change', updateVar);
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateVar);
		observer?.observe(node);

		return () => {
			observer?.disconnect();
			mq.removeEventListener('change', updateVar);
			document.documentElement.style.setProperty('--app-footer-height', '0px');
		};
	};

	$effect.pre(() => {
		applyIOSPwaSafeAreaFix();
	});

	onMount(() => {
		initializeTheme();
		initializeStatusBar();
		hideSplashScreenWhenReady(300);

		const CHUNK_RELOAD_KEY = `chunk-reload-${__BUILD_VERSION__}`;

		const onPreloadError = (event: Event & { payload: Error }) => {
			if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
				event.preventDefault();
				sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
				location.reload();
			}
		};

		const onError = (event: ErrorEvent) => {
			const error = event.error;
			if (error === null || error === undefined) return;

			const errorMessage =
				error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
			if (!errorMessage || errorMessage === 'null' || errorMessage === 'undefined') return;

			console.error('[Global Error Handler]:', {
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
				type: 'error',
				timestamp: new Date().toISOString()
			});
			if (!/url parse|wasm/i.test(errorMessage)) {
				event.preventDefault();
			}
		};

		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			const error = event.reason;
			if (error === null || error === undefined) return;

			const errorMessage =
				error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
			if (!errorMessage || errorMessage === 'null' || errorMessage === 'undefined') return;

			console.error('[Global Error Handler]:', {
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
				type: 'unhandledrejection',
				timestamp: new Date().toISOString()
			});
		};

		window.addEventListener('vite:preloadError', onPreloadError);
		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onUnhandledRejection);

		return () => {
			window.removeEventListener('vite:preloadError', onPreloadError);
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onUnhandledRejection);
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

	<!-- eslint-disable svelte/no-at-html-tags -->
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(BITTASKER_ORG_JSONLD)}</script>`}
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(BITTASKER_SITE_NAVIGATION_JSONLD)}</script>`}
	<!-- eslint-enable svelte/no-at-html-tags -->

	{#if import.meta.env.MODE === 'production'}
		<script
			defer
			src="https://analyze.bittasker.com/script.js"
			data-website-id="60d3abf1-1032-4652-8b01-612280814595"
		></script>
	{/if}
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>
<main id="main" class="app-shell bg-base-200" tabindex="-1">
	{@render children?.()}
	{#if showDock}
		<footer {@attach measureFooter} class="app-shell__footer lg:hidden">
			<BottomNavBar />
		</footer>
	{/if}
</main>
