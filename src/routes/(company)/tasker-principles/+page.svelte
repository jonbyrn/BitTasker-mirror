<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	
	let { data } = $props();
	const seo = data.seo;
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
	<meta property="og:image:alt" content="Taskee Principles - BitTasker" />
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

<div class="container mx-auto px-4 py-12 md:px-8">
	<img
	src={$darkMode
		? '/images/Bittasker-logo-tagline-dark.svg'
		: '/images/Bittasker-logo-tagline-light.svg'}
	alt="BitTasker Logo"
	class="mx-auto mb-4 block md:min-w-[500px]"
	/>
	<div class="prose mx-auto max-w-4xl">
		<div class="text-center">
			<h1 class="text-4xl font-bold">Taskee Principles</h1>
			<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
				The values that guide how taskees should conduct themselves on BitTasker.
			</p>
		</div>

		<h2>Our Taskee Principles</h2>
		<p>
			These principles guide how taskees should conduct themselves on BitTasker. They represent the values that make our platform trustworthy and beneficial for both taskers and taskees.
		</p>
		<h3 class="text-2xl font-bold mb-4">For Taskees</h3>
		<div class="space-y-4">
			<div class="bg-base-100 rounded-box p-4">
				<h4 class="font-bold">1. Deliver Excellence</h4>
				<p class="text-base-content/80">
					Complete every task to the highest possible standard. Your reputation depends on consistent quality work.
				</p>
			</div>
			<div class="bg-base-100 rounded-box p-4">
				<h4 class="font-bold">2. Communicate Clearly</h4>
				<p class="text-base-content/80">
					Keep taskers informed about progress, potential issues, and any changes to the agreed scope.
				</p>
			</div>
			<div class="bg-base-100 rounded-box p-4">
				<h4 class="font-bold">3. Be Reliable</h4>
				<p class="text-base-content/80">
					Honor your commitments and meet deadlines. If issues arise, communicate early and work toward solutions.
				</p>
			</div>
			<div class="bg-base-100 rounded-box p-4">
				<h4 class="font-bold">4. Respect Privacy</h4>
				<p class="text-base-content/80">
					Protect confidential information and respect the privacy of taskers and their business.
				</p>
			</div>
			<div class="bg-base-100 rounded-box p-4">
				<h4 class="font-bold">5. Be Professional</h4>
				<p class="text-base-content/80">
					Maintain professional conduct in all interactions and represent BitTasker with integrity.
				</p>
			</div>
		</div>
	</div>
</div>
