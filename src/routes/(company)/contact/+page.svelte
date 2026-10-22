<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import IconEmailOutline from '~icons/mdi/email-outline';
	
	let { data: seo } = $props();

	// Obfuscate email address to make it harder for simple bots to scrape.
	// This is constructed on the client-side.
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
	<meta property="og:image:alt" content="Contact BitTasker - Support & Partnership Inquiries" />
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
					<h3>{$t('contact.title')}</h3>
					<p class="text-base-content/80 py-6 text-lg">
						{$t('contact.description')}
					</p>
				</div>
			</div>
	</section>

	<div class="prose mx-auto max-w-4xl my-16 px-8">
		<div class="flex justify-center">
		<div class="card border-base-300 bg-base-100 w-full max-w-md border shadow-xl">
			<div class="card-body items-center text-center">
				<h3 class="card-title">{$t('contact.general_inquiries')}</h3>
				<p>{$t('contact.general_info')}</p>
				<p>
					<a href={mailtoHref}>admin@bittasker.com</a>
				</p>
				<div class="card-actions justify-end">
					<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
						<IconEmailOutline class="text-xl" />
						{$t('contact.send_button')}
					</a>
				</div>
			</div>
		</div>
	</div>
	</div>
</div>
