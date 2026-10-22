<script lang="ts">
	import PublicListingLayoutShell from '$lib/components/listing/PublicListingLayoutShell.svelte';
	import { page } from '$app/state';
	import { getServicesBrowseSeo } from '$lib/utils/seo/servicesBrowseSeo';
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';

	let { children } = $props();

	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');
	const browseSeo = $derived(getServicesBrowseSeo(baseUrl));

	const isServiceDetailsRoute = $derived(
		page.url.pathname.startsWith('/services/') && page.url.pathname !== '/services'
	);
</script>

<svelte:head>
	{#if !isServiceDetailsRoute}
		<DocumentTitle fallback={browseSeo.title} />
		<meta name="description" content={browseSeo.description} />
		<meta name="robots" content="index, follow" />
		<link rel="canonical" href={browseSeo.canonical} />
		<meta property="og:type" content="website" />
		<meta property="og:url" content={browseSeo.canonical} />
		<meta property="og:title" content={browseSeo.title} />
		<meta property="og:description" content={browseSeo.description} />
		<meta property="og:image" content={browseSeo.ogImage} />
		<meta property="og:image:secure_url" content={browseSeo.ogImage} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content="BitTasker services browse page" />
		<meta property="og:site_name" content="BitTasker" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:url" content={browseSeo.canonical} />
		<meta name="twitter:title" content={browseSeo.title} />
		<meta name="twitter:description" content={browseSeo.description} />
		<meta name="twitter:image" content={browseSeo.ogImage} />
		<meta name="twitter:image:alt" content="BitTasker services browse page" />
		<meta name="twitter:site" content="@BitTaskerdotcom" />
		{@html `<script type="application/ld+json">${JSON.stringify(browseSeo.jsonLd)}</script>`}
	{/if}
</svelte:head>
<PublicListingLayoutShell
	layoutClassName="services-layout"
	activeSectionId="find-services"
	activeBasePath="/services"
	isDetailsRoute={isServiceDetailsRoute}
>
	{@render children?.()}
</PublicListingLayoutShell>
