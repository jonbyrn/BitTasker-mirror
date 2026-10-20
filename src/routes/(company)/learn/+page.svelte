<script lang="ts">
	import { t } from 'svelte-i18n';
	import Logo from '$lib/components/Logo.svelte';

	let { data: seo } = $props();

	const categories = [
		{
			icon: '🪪',
			titleKey: 'learn.category_wallets',
			descKey: 'learn.desc_wallets',
			href: '/learn/wallet/best-bitcoin-wallet/'
		},
		{
			icon: '💼',
			titleKey: 'learn.category_freelancing',
			descKey: 'learn.desc_freelancing',
			href: '/learn/freelancing/upwork-alternatives/'
		},
		{
			icon: '₿',
			titleKey: 'learn.category_bitcoin',
			descKey: 'learn.desc_bitcoin',
			href: '/learn/bitcoin/lightning-network/'
		},
		{
			icon: '🔒',
			titleKey: 'learn.category_security',
			descKey: 'learn.desc_security',
			href: '/learn/security/is-bittasker-safe/'
		},
		{
			icon: '💰',
			titleKey: 'learn.category_bitcoin_freelancing',
			descKey: 'learn.desc_bitcoin_freelancing',
			href: '/learn/bitcoin-freelancing/get-paid-in-bitcoin/'
		},
		{
			icon: '🔗',
			titleKey: 'learn.category_layer2',
			descKey: 'learn.desc_layer2',
			href: '/learn/bitcoin-layer-2/comparison-table/'
		},
		{
			icon: '🌍',
			titleKey: 'learn.category_future',
			descKey: 'learn.desc_future',
			href: '/learn/future-of-work/decentralized-labor/'
		}
	];
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:site_name" content="BitTasker" />
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:site" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	<!-- eslint-disable svelte/no-at-html-tags -- JSON-LD structured data is safe -->
	{@html '<scr' +
		'ipt type="application/ld+json">' +
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: seo.title,
			description: seo.description,
			url: seo.canonical,
			inLanguage: 'en',
			publisher: {
				'@type': 'Organization',
				name: 'BitTasker',
				url: 'https://bittasker.com'
			}
		}) +
		'</scr' +
		'ipt>'}
	{@html '<scr' +
		'ipt type="application/ld+json">' +
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://bittasker.com/' },
				{ '@type': 'ListItem', position: 2, name: 'Learn', item: 'https://bittasker.com/learn/' }
			]
		}) +
		'</scr' +
		'ipt>'}
</svelte:head>

<div class="w-full">
	<!-- Hero -->
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>Learn Bitcoin, Freelancing & More</h1>
				<p class="text-base-content/80 py-6 text-lg">
					Free guides on Bitcoin wallets, freelancing platforms, Lightning payments, crypto
					security, and how to earn with BitTasker.
				</p>
			</div>
		</div>
	</section>

	<!-- Category Grid -->
	<section class="py-16">
		<div class="container mx-auto px-4">
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
				{#each categories as cat (cat.href)}
					<a
						href={cat.href}
						class="card bg-base-100 border-base-300 hover:border-primary border shadow-sm transition-all hover:shadow-lg"
					>
						<div class="card-body">
							<span class="text-3xl">{cat.icon}</span>
							<h2 class="card-title mt-2">{$t(cat.titleKey)}</h2>
							<p class="text-base-content/70 text-sm">{$t(cat.descKey)}</p>
						</div>
					</a>
				{/each}
			</div>
		</div>
	</section>
</div>
