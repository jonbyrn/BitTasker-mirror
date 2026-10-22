<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import type { PageData } from './$types';

	let { data: seo }: { data: PageData } = $props();

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
	<meta property="og:image:alt" content="BitTasker Careers - Join the Bitcoin Revolution" />
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
				<h3>{$t('about_careers.join.title')}</h3>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('about_careers.join.description')}
				</p>
			</div>
		</div>
	</section>

	<!-- Our Culture Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<div class="mb-12 text-center">
			<h3>{$t('about_careers.culture.title')}</h3>
			<p class="text-base-content/80 py-6 text-lg">
				{$t('about_careers.culture.description')}
			</p>
		</div>
	</div>
	<!-- Why Join BitTasker Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-5 sm:px-8">
		<div class="mx-auto max-w-4xl">
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<h3>{$t('why.join.bittasker')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">
							{$t('careers.why_join.description')}
						</p>

						<div class="divider">{$t('careers.why_join.core_values')}</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('careers.why_join.bitcoin_first.title')}</h4>
									<p>
										{$t('careers.why_join.bitcoin_first.description')}
									</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('careers.why_join.fully_remote.title')}</h4>
									<p>{$t('careers.why_join.fully_remote.description')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">
										{$t('careers.why_join.innovation_driven.title')}
									</h4>
									<p>
										{$t('careers.why_join.innovation_driven.description')}
									</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('careers.why_join.mission_focused.title')}</h4>
									<p>
										{$t('careers.why_join.mission_focused.description')}
									</p>
								</div>
							</div>
						</div>

						<div class="alert alert-success alert-outline mt-6">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<p>
								{$t('careers.about.join')}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Open Positions -->
	<div class="prose mx-auto my-16 max-w-4xl px-5 sm:p-8">
		<div class="mb-4 flex items-baseline gap-4">
			<h3>{$t('careers.section_title')}</h3>
		</div>

		<div class="card bg-base-100 mb-4 shadow-lg">
			<div class="card-body">
				<p class="mb-4">{$t('careers.no_open_roles')}</p>
				<p>
					<a href={mailtoHref}>admin@bittasker.com</a>
				</p>
			</div>
		</div>
	</div>
</div>
