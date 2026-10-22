<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { afterNavigate } from '$app/navigation';
	import { locale, t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { scrollAfterNavigation } from '$lib/utils/scroll-on-navigate';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import { initializeTheme } from '$lib/stores/theme.store';
	import { applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';
	import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
	import { hideSplashScreenWhenReady } from '$lib/utils/helpers/splashScreen';
	import {
		BITTASKER_ORG_JSONLD,
		BITTASKER_SITE_NAVIGATION_JSONLD
	} from '$lib/utils/constants/seo.constants';
	import { routeDocumentTitle } from '$lib/seo/route-titles';
	import { isBenignRelayClose } from '$lib/utils/relayUrls';
	import '../app.css';

	const { children } = $props();

	afterNavigate((navigation) => {
		scrollAfterNavigation(navigation);
	});

	const showDock = $derived(!page.url.pathname.includes('/onboarding'));
	const skipLabel = $derived.by(() => {
		let value = '';
		try {
			value = $t('common.accessibility.skip');
		} catch {
			value = '';
		}
		const boot = typeof document === 'undefined' ? '' : document.documentElement.dataset.btLocale;
		const spanish = String($locale || boot || '').startsWith('es');
		if (
			spanish &&
			(!value || value === 'common.accessibility.skip' || value === 'Skip to content')
		) {
			return 'Saltar al contenido';
		}
		return value || 'Skip to content';
	});

	function markLocaleReady() {
		document.documentElement.dataset.btReady = '1';
	}

	const documentTitle = $derived.by(() => {
		const boot =
			typeof document === 'undefined' ? '' : document.documentElement.dataset.btLocale || '';
		const lang = String($locale || boot || 'en');
		return routeDocumentTitle(page.url.pathname, lang);
	});

	$effect(() => {
		const next = documentTitle;
		if (!next) return;
		void tick().then(() => {
			if (documentTitle === next) document.title = next;
		});
	});

	$effect(() => {
		const boot = document.documentElement.dataset.btLocale;
		const spanish = String($locale || boot || '').startsWith('es');
		let home = '';
		try {
			home = $t('navbar.dock.home');
		} catch {
			return;
		}
		if (!spanish || (home && home !== 'navbar.dock.home' && home !== 'Home')) {
			markLocaleReady();
		}
	});

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
		const revealLocale = setTimeout(markLocaleReady, 2000);
		document.getElementById('wallet-boot-skeleton')?.remove();
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
			if (isBenignRelayClose(error) || isBenignRelayClose(event.message)) {
				event.preventDefault();
				return;
			}
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
			if (isBenignRelayClose(error)) {
				event.preventDefault();
				return;
			}
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
			clearTimeout(revealLocale);
			window.removeEventListener('vite:preloadError', onPreloadError);
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onUnhandledRejection);
		};
	});
</script>

<svelte:head>
	{#if documentTitle}
		<title>{documentTitle}</title>
	{/if}
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

<a class="skip-link" href="#main">{skipLabel}</a>
<main id="main" class="app-shell bg-base-200" tabindex="-1">
	{@render children?.()}
	{#if showDock}
		<footer {@attach measureFooter} class="app-shell__footer lg:hidden">
			<BottomNavBar />
		</footer>
	{/if}
</main>
