<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	import { t } from '$lib/stores/i18n.store';

	let { data } = $props();
	const seo = data.seo;

	// Obfuscate email address to make it harder for simple bots to scrape.
	// This is constructed on the client-side.
	const user = 'hello';
	const domain = 'bittasker.com';
	const mailtoHref = `mailto:${user}@${domain}`;
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

<div class="container mx-auto p-4 py-8 md:p-12">
	<img
		src={$darkMode
			? '/images/Bittasker-logo-tagline-dark.svg'
			: '/images/Bittasker-logo-tagline-light.svg'}
		alt="BitTasker Logo"
		class="mx-auto mb-4 block md:min-w-[500px]"
	/>
	<div class="text-center">
		<h1 class="text-4xl font-bold">{$t('contact.title')}</h1>
		<p class="text-base-content/80 mx-auto mt-4 max-w-2xl text-lg">
			{$t('contact.description')}
		</p>
	</div>

	<div class="mt-12 flex justify-center">
		<div class="card border-base-300 bg-base-100 w-full max-w-md border shadow-xl">
			<div class="card-body items-center text-center">
				<h2 class="card-title text-2xl">{$t('contact.general_inquiries')}</h2>
				<p>{$t('contact.general_info')}</p>
				<div class="card-actions justify-end">
					<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
						<i class="fa-solid fa-envelope fa-xl"></i>
						{$t('contact.send_button')}
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
