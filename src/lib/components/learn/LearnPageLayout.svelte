<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { LearnPageContent, LearnPageSeo } from '$lib/types/learn';
	import Logo from '$lib/components/Logo.svelte';

	let {
		content,
		seo,
		locale: _locale = 'en',
		lastUpdated,
		breadcrumbs = [],
		relatedPages = [],
		children
	}: {
		content: LearnPageContent;
		seo: LearnPageSeo;
		locale?: 'en' | 'es';
		lastUpdated: string;
		breadcrumbs?: Array<{ label: string; href: string }>;
		relatedPages?: Array<{ title: string; href: string; description: string }>;
		children?: Snippet;
	} = $props();

	let openFaq = $state(-1);

	function toggleFaq(index: number) {
		openFaq = openFaq === index ? -1 : index;
	}
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="article" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:image" content={seo.ogImage} />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- hreflang -->
	{#each seo.hreflangLinks as link (link.lang)}
		<link rel="alternate" hreflang={link.lang} href={link.href} />
	{/each}

	<!-- Structured Data (Article + BreadcrumbList + FAQPage) -->
	{#if seo.jsonLd && seo.jsonLd.length > 0}
		{#each seo.jsonLd as schema, i (i)}
			<!-- eslint-disable svelte/no-at-html-tags svelte/require-each-key -- JSON-LD is safe static data -->
			{@html '<scr' + 'ipt type="application/ld+json">' + JSON.stringify(schema) + '</scr' + 'ipt>'}
		{/each}
	{/if}
</svelte:head>

<div class="w-full">
	<!-- Breadcrumbs -->
	{#if breadcrumbs.length > 0}
		<div class="bg-base-200 border-base-300 border-b py-2">
			<div class="container mx-auto px-4">
				<div class="breadcrumbs text-sm">
					<ul>
						{#each breadcrumbs as crumb (crumb.href)}
							<li><a href={crumb.href}>{crumb.label}</a></li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Hero Section (matches /how-it-works pattern) -->
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{content.hero.title}</h1>
				<p class="text-base-content/80 py-6 text-lg">{content.hero.subtitle}</p>
				<p class="text-base-content/50 text-sm">Updated: {lastUpdated}</p>
			</div>
		</div>
	</section>

	<!-- Answer Block (AI Overview optimization) -->
	<section class="bg-base-200 py-8">
		<div class="mx-auto max-w-4xl px-8">
			<div class="bg-base-100 rounded-box border-primary/20 border-l-4 p-6 shadow-sm">
				<p class="text-base-content/90 text-lg leading-relaxed">{content.answerBlock}</p>
			</div>
		</div>
	</section>

	<!-- Main Content Sections -->
	{#each content.sections as section (section.heading)}
		<section class="py-8">
			<div class="prose mx-auto max-w-4xl px-8">
				<h2>{section.heading}</h2>
				<p>{section.body}</p>
			</div>
		</section>
	{/each}

	<!-- Slot for page-specific content (comparison tables, custom sections) -->
	{#if children}
		{@render children?.()}
	{/if}

	<!-- BitTasker CTA -->
	<section class="bg-base-200 py-16">
		<div class="mx-auto max-w-4xl px-8 text-center">
			<h2 class="mb-4 text-3xl font-bold">{content.bitTaskerCta.heading}</h2>
			<p class="text-base-content/80 mx-auto mb-8 max-w-2xl text-lg">
				{content.bitTaskerCta.body}
			</p>
			<div class="flex flex-col justify-center gap-4 sm:flex-row">
				<a href={content.bitTaskerCta.buttonHref} class="btn btn-primary btn-lg">
					{content.bitTaskerCta.buttonText}
				</a>
				<a href="/learn" class="btn btn-outline btn-lg"> {$t('learn.browse_all')} </a>
			</div>
		</div>
	</section>

	<!-- FAQ Section -->
	{#if content.faq.length > 0}
		<section class="py-16">
			<div class="mx-auto max-w-4xl px-8">
				<h2 class="mb-8 text-center text-3xl font-bold">{$t('learn.frequently_asked')}</h2>
				<div class="space-y-4">
					{#each content.faq as item, i (i)}
						<div
							class="collapse-arrow bg-base-100 border-base-300 collapse border shadow"
							class:collapse-open={openFaq === i}
						>
							<button
								type="button"
								class="collapse-title text-left text-xl font-medium"
								onclick={() => toggleFaq(i)}
							>
								{item.question}
							</button>
							<div class="collapse-content">
								<p>{item.answer}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Related Pages -->
	{#if relatedPages.length > 0}
		<section class="bg-base-200 py-16">
			<div class="mx-auto max-w-4xl px-8">
				<h3 class="mb-6 text-center text-2xl font-bold">{$t('learn.related_topics')}</h3>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each relatedPages as page (page.href)}
						<a
							href={page.href}
							class="card bg-base-100 hover:bg-base-300 shadow-sm transition-colors"
						>
							<div class="card-body p-4">
								<h4 class="card-title text-base">{page.title}</h4>
								<p class="text-base-content/70 text-sm">{page.description}</p>
							</div>
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Last Updated -->
	<div class="py-4 text-center">
		<p class="text-base-content/50 text-sm">{$t('learn.last_updated')}: {lastUpdated}</p>
	</div>
</div>
