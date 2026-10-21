<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import AboutExtras from '$lib/components/AboutExtras.svelte';
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
	<meta property="og:image:alt" content="BitTasker - Decentralized Bitcoin Task Marketplace" />
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
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{$t('how_it_works_about.hero.heading')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('how_it_works_about.hero.tagline')}
				</p>
			</div>
		</div>
	</section>

	<!-- Our Mission Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<div class="mb-12 text-center">
			<h3>{$t('about_page.mission.title')}</h3>
			<p class="text-base-content/80 py-6 text-lg">
				{$t('about_page.mission.description')}
			</p>
		</div>

		<!-- Our Beliefs Section -->
		<div class="mx-auto max-w-4xl">
			<div class="mb-8">
				<div class="mb-6 text-center">
					<h3>{$t('about_page.core_beliefs.title')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">
							{$t('about_page.core_beliefs.description')}
						</p>

						<div class="divider">{$t('about_page.core_beliefs.divider')}</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('about_page.core_beliefs.bitcoin_title')}</h4>
									<p>{$t('about_page.core_beliefs.bitcoin_text')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('about_page.core_beliefs.tasks_title')}</h4>
									<p>{$t('about_page.core_beliefs.tasks_text')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">
										{$t('about_page.core_beliefs.decentralization_title')}
									</h4>
									<p>{$t('about_page.core_beliefs.decentralization_text')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('about_page.core_beliefs.sovereignty_title')}</h4>
									<p>{$t('about_page.core_beliefs.sovereignty_text')}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Step 6: Our Platform -->
		<div class="mb-12">
			<div class="mb-6 text-center">
				<h3>{$t('about_page.platform.title')}</h3>
				<p class="text-base-content/80 mx-auto mt-4 max-w-2xl text-lg">
					{$t('about_page.platform.description')}
				</p>
			</div>

			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title">
									{$t('about_page.platform.features.communication.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about_page.platform.features.communication.description')}
								</p>
							</div>
						</div>

						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title">
									{$t('about_page.platform.features.lightning.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about_page.platform.features.lightning.description')}
								</p>
							</div>
						</div>

						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title">
									{$t('about_page.platform.features.escrow.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about_page.platform.features.escrow.description')}
								</p>
							</div>
						</div>

						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title">
									{$t('about_page.platform.features.fiat.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about_page.platform.features.fiat.description')}
								</p>
							</div>
						</div>
					</div>

					<div class="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
						<div class="flex-1">
							<h4 class="mb-2">
								{$t('about_page.platform.features.marketplace.title')}
							</h4>
							<ul class="text-base-content/80 list-inside list-disc space-y-1">
								<li>{$t('about_page.platform.features.marketplace.item1')}</li>
								<li>{$t('about_page.platform.features.marketplace.item2')}</li>
							</ul>
						</div>

						<div class="flex-1">
							<h4 class="mb-2">
								{$t('about_page.platform.features.global.title')}
							</h4>
							<ul class="text-base-content/80 list-inside list-disc space-y-1">
								<li>{$t('about_page.platform.features.global.item1')}</li>
								<li>{$t('about_page.platform.features.global.item2')}</li>
							</ul>
						</div>
					</div>

					<div class="alert alert-info alert-outline mt-6">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('about_page.platform.alert')}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
	<AboutExtras />
</div>
