<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import AboutExtras from '$lib/components/AboutExtras.svelte';
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import { t } from 'svelte-i18n';
	import type { PageData } from './$types';

	let { data: seo }: { data: PageData } = $props();

	const jsonLdScript = $derived(
		seo.jsonLd
			? '<' + 'script type="application/ld+json">' + JSON.stringify(seo.jsonLd) + '</' + 'script>'
			: ''
	);
</script>

<svelte:head>
	<DocumentTitle fallback={seo.title} />
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />

	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="BitTasker" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />

	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{#if jsonLdScript}
		<!-- eslint-disable svelte/no-at-html-tags -->
		{@html jsonLdScript}
		<!-- eslint-enable svelte/no-at-html-tags -->
	{/if}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[40vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{$t('about_page.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">{$t('about_page.lead')}</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<div class="card bg-base-100 mb-6 shadow-lg">
			<div class="card-body">
				<h2>{$t('about_page.company_title')}</h2>
				<p>{$t('about_page.company')}</p>
			</div>
		</div>

		<div class="card bg-base-100 mb-6 shadow-lg">
			<div class="card-body">
				<h2>{$t('about_page.payments_title')}</h2>
				<p>{$t('about_page.payments')}</p>
			</div>
		</div>

		<div class="card bg-base-100 shadow-lg">
			<div class="card-body">
				<h2>{$t('about_page.areas_title')}</h2>
				<ul>
					<li>{$t('about_page.areas.tasks')}</li>
					<li>{$t('about_page.areas.services')}</li>
					<li>{$t('about_page.areas.goods')}</li>
					<li>{$t('about_page.areas.staff')}</li>
				</ul>
			</div>
		</div>
	</div>
	<AboutExtras />
</div>
