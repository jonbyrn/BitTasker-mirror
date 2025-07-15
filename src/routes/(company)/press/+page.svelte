<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	
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
	<meta property="og:image" content={seo.image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Press & Media - BitTasker" />
	<meta property="og:site_name" content="BitTasker" />
	
	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:image" content={seo.image} />
	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />
	
	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="container mx-auto p-4 py-8 md:p-12">
	<div class="text-center">
		<img
			src={$darkMode
				? '/images/Bittasker-logo-tagline-dark.svg'
				: '/images/Bittasker-logo-tagline-light.svg'}
			alt="BitTasker Logo"
			class="mx-auto mb-4 block md:min-w-[500px]"
		/>
		<h1 class="text-4xl font-bold">Press & Media</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			BitTasker is revolutionizing how taskers and taskees connect, work, and get paid through Bitcoin-powered escrow.
		</p>
	</div>

	<div class="mx-auto mt-16 grid max-w-4xl gap-12">
		<!-- Media Kit -->
		<div class="rounded-box border border-base-300 bg-base-100 p-8">
			<h2 class="mb-4 text-2xl font-bold">Media Kit</h2>
			<p class="mb-6">
				Download our official brand assets, including logos, leadership headshots, and brand
				guidelines to ensure accuracy in your reporting.
			</p>
			<div class="flex flex-wrap gap-4">
				<a href="/downloads/bittasker-logo-pack.zip" class="btn btn-primary btn-disabled" aria-disabled="true">Download Logo Pack (.zip)</a>
				<a href="/downloads/bittasker-brand-guidelines.pdf" class="btn btn-secondary btn-disabled" aria-disabled="true">Download Brand Guidelines (.pdf)</a>
			</div>
			<p class="mt-4 text-sm text-base-content/60">*Media assets coming soon.</p>
		</div>

		<!-- About BitTasker -->
		<div class="prose max-w-none">
			<h2 class="text-2xl font-bold">About BitTasker</h2>
			<p>
				BitTasker is a revolutionary gig economy platform that connects individuals and businesses
				with skilled professionals for a wide range of tasks. By integrating Bitcoin for fast,
				secure, and low-cost payments, and leveraging decentralized technologies like Nostr for
				identity, BitTasker is building a more open, global, and equitable marketplace for
				services.
			</p>
		</div>

		<!-- Media Inquiries -->
		<div class="rounded-box border border-base-300 bg-base-100 p-8 text-center">
			<h2 class="mb-4 text-2xl font-bold">Media Inquiries</h2>
			<p class="mx-auto mb-6 max-w-lg">
				For all press and media-related inquiries, please contact our communications team. We're
				happy to provide interviews, statements, and additional information.
			</p>
			<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
				<i class="fa-solid fa-envelope fa-xl"></i>
				Contact Us
			</a>
		</div>
	</div>
</div>

