<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeTheme } from '$lib/stores/theme.store';
	import { applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';
	import { initializeStatusBar } from '$lib/utils/helpers/statusBar';
	import {
		BITTASKER_ORG_JSONLD,
		BITTASKER_SITE_NAVIGATION_JSONLD
	} from '$lib/utils/constants/seo.constants';
	import '../app.css';

	const { children } = $props();

	$effect.pre(() => {
		applyIOSPwaSafeAreaFix();
	});

	onMount(() => {
		initializeTheme();
		initializeStatusBar();
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="shortcut icon" href="/favicon.ico" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="BitTasker" />
	<link rel="manifest" href="/site.webmanifest" />

	<link href="/images/logos/bittasker-logo-dark.svg" as="image" />
	<link href="/images/logos/bittasker-logo-light.svg" as="image" />

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

<main id="main" class="app-shell bg-base-200">
	{@render children()}
</main>
