<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	import { t } from '$lib/stores/i18n.store';

	let { data } = $props();
	const seo = data.seo;

	const emailUser = 'press';
	const emailDomain = 'bittasker.com';
	const mailtoHref = `mailto:${emailUser}@${emailDomain}`;
</script>

<svelte:head>
	<title>{seo.title}</title>
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

<div class="container mx-auto px-4 py-8 md:px-8">
	<!-- Hero Section -->
	<div class="hero bg-base-200 py-8">
		<div class="hero-content flex-col text-center">
			<img
				src={$darkMode
					? '/images/Bittasker-logo-tagline-dark.svg'
					: '/images/Bittasker-logo-tagline-light.svg'}
				alt="BitTasker Logo"
				class="mx-auto mb-4 block md:min-w-[500px]"
			/>
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">{$t('press.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('press.description')}
				</p>
			</div>
		</div>
	</div>

	<!-- Content Sections -->
	<div class="mx-auto max-w-4xl space-y-12 py-16">
		<!-- Media Kit -->
		<div class="card bg-base-100 shadow-lg">
			<div class="card-body">
				<h2 class="mb-4 text-2xl font-bold">{$t('press.media_kit.title')}</h2>
				<p class="mb-6">{$t('press.media_kit.description')}</p>
				<div class="flex flex-wrap gap-4">
					<a
						href="/downloads/bittasker-logo-pack.zip"
						class="btn btn-primary btn-disabled"
						aria-disabled="true"
					>
						{$t('press.media_kit.logo_pack')}
					</a>
					<a
						href="/downloads/bittasker-brand-guidelines.pdf"
						class="btn btn-outline btn-disabled"
						aria-disabled="true"
					>
						{$t('press.media_kit.guidelines')}
					</a>
				</div>
				<p class="text-base-content/60 mt-4 text-sm">{$t('press.media_kit.coming_soon')}</p>
			</div>
		</div>

		<!-- About BitTasker -->
		<div class="prose max-w-none">
			<h2 class="text-2xl font-bold">{$t('press.about.title')}</h2>
			<p>{$t('press.about.description')}</p>
		</div>

		<!-- Media Inquiries -->
		<div class="card bg-base-100 text-center shadow-lg">
			<div class="card-body text-center">
				<h2 class="mb-4 text-2xl font-bold">{$t('press.inquiries.title')}</h2>
				<p class="mx-auto mb-6 max-w-lg">{$t('press.inquiries.description')}</p>
				<div class="card-actions mt-4 flex justify-center">
					<a href={mailtoHref} class="btn btn-primary btn-wide">
						<i class="fa-solid fa-envelope fa-xl mr-2"></i>
						{$t('press.inquiries.button')}
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
