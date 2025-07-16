<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	import { t } from '$lib/stores/i18n.store';

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
	<meta property="og:image" content={seo.image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="BitTasker - Decentralized Bitcoin Task Marketplace" />
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

<div class="container mx-auto px-4 py-8 md:px-8">
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
				<h1 class="text-5xl font-bold">{$t('how_it_works.hero.heading')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('how_it_works.hero.tagline')}
				</p>
			</div>
		</div>
	</div>

	<!-- Our Mission Section -->
	<div class="prose mx-auto max-w-4xl py-8">
		<div class="mb-12 text-center">
			<h2 class="text-4xl font-bold">{$t('about.mission.title')}</h2>
			<p class="text-base-content/80 mt-4 text-lg">
				{$t('about.mission.description')}
			</p>
		</div>

		<!-- Our Beliefs Section -->
		<div class="mx-auto max-w-4xl">
			<div class="mb-8">
				<div class="mb-6 text-center">
					<h2 class="text-4xl font-bold">{$t('about.core_beliefs.title')}</h2>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">
							{$t('about.core_beliefs.description')}
						</p>

						<div class="divider">{$t('about.core_beliefs.divider')}</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">{$t('about.core_beliefs.bitcoin_title')}</h4>
									<p>{$t('about.core_beliefs.bitcoin_text')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">{$t('about.core_beliefs.tasks_title')}</h4>
									<p>{$t('about.core_beliefs.tasks_text')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">
										{$t('about.core_beliefs.decentralization_title')}
									</h4>
									<p>{$t('about.core_beliefs.decentralization_text')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">{$t('about.core_beliefs.sovereignty_title')}</h4>
									<p>{$t('about.core_beliefs.sovereignty_text')}</p>
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
				<h2 class="text-4xl font-bold">{$t('about.platform.title')}</h2>
				<p class="text-base-content/80 mx-auto mt-4 max-w-2xl text-lg">
					{$t('about.platform.description')}
				</p>
			</div>

			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title text-lg font-semibold">
									{$t('about.platform.features.communication.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about.platform.features.communication.description')}
								</p>
							</div>
						</div>

						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title text-lg font-semibold">
									{$t('about.platform.features.lightning.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about.platform.features.lightning.description')}
								</p>
							</div>
						</div>

						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title text-lg font-semibold">
									{$t('about.platform.features.escrow.title')}
								</h4>
								<p class="text-base-content/80">
									{$t('about.platform.features.escrow.description')}
								</p>
							</div>
						</div>

						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<h4 class="card-title text-lg font-semibold">
									{$t('about.platform.features.fiat.title')}
								</h4>
								<p class="text-base-content/80">{$t('about.platform.features.fiat.description')}</p>
							</div>
						</div>
					</div>

					<div class="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
						<div class="flex-1">
							<h4 class="mb-2 text-lg font-semibold">
								{$t('about.platform.features.marketplace.title')}
							</h4>
							<ul class="text-base-content/80 list-inside list-disc space-y-1">
								<li>{$t('about.platform.features.marketplace.item1')}</li>
								<li>{$t('about.platform.features.marketplace.item2')}</li>
							</ul>
						</div>

						<div class="flex-1">
							<h4 class="mb-2 text-lg font-semibold">
								{$t('about.platform.features.global.title')}
							</h4>
							<ul class="text-base-content/80 list-inside list-disc space-y-1">
								<li>{$t('about.platform.features.global.item1')}</li>
								<li>{$t('about.platform.features.global.item2')}</li>
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
						<span>{$t('about.platform.alert')}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
