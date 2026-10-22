<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import IconEmailOutline from '~icons/mdi/email-outline';

	let { data: seo } = $props();

	const mailtoHref = 'mailto:admin@bittasker.com';
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
	<meta property="og:image:alt" content="Press & Media - BitTasker" />
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
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h3>{$t('press.title')}</h3>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('press.description')}
				</p>
			</div>
		</div>
	</section>

	<!-- Content Sections -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<!-- Media Kit -->
		<!-- TODO: Add media kit once we have it -->
		<!-- <div class="card bg-base-100 shadow-lg">
			<div class="card-body">
				<h3 class="mt-6 mb-4">{$t('press.media_kit.title')}</h3>
				<p class="mb-6">{$t('press.media_kit.description')}</p>
				<div class="flex flex-wrap gap-4">
					<a
						href="/downloads/bittasker-logo-pack.zip"
						class="btn btn-outline btn-disabled text-xs sm:text-sm!"
						aria-disabled="true"
					>
						{$t('press.media_kit.logo_pack')}
					</a>
					<a
						href="/downloads/bittasker-brand-guidelines.pdf"
						class="btn btn-outline btn-disabled text-xs sm:text-sm!"
						aria-disabled="true"
					>
						{$t('press.media_kit.guidelines')}
					</a>
				</div>
				<p class="text-base-content/80 mt-4 text-sm">{$t('press.media_kit.coming_soon')}</p>
			</div>
		</div> -->

		<!-- About BitTasker -->
		<div class="prose my-12 max-w-none">
			<h3>{$t('press.about.title')}</h3>
			<p>{$t('press.about.description')}</p>
		</div>

		<!-- Media Inquiries -->
		<div class="card bg-base-100 mx-auto max-w-lg text-center shadow-lg">
			<div class="card-body text-center">
				<h3 class="mt-6 mb-4">{$t('press.inquiries.title')}</h3>
				<p class="mx-auto mb-6 max-w-lg">{$t('press.inquiries.description')}</p>
				<p class="mb-6">
					<a href={mailtoHref}>admin@bittasker.com</a>
				</p>
				<p class="mb-6">
					<a href="/images/logos/bittasker-logomark.svg">{$t('press.assets.label')}</a>
				</p>
				<div class="card-actions mt-4 flex justify-center">
					<a href={mailtoHref} class="btn btn-primary btn-wide whitespace-normal">
						<IconEmailOutline class="mr-2 text-xl" />
						{$t('press.inquiries.button')}
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
