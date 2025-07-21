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
	<div class="hero bg-base-200 mb-8 py-8">
		<div class="hero-content flex-col text-center">
			<img
				src={$darkMode
					? '/images/Bittasker-logo-tagline-dark.svg'
					: '/images/Bittasker-logo-tagline-light.svg'}
				alt="BitTasker Logo"
				class="mx-auto mb-4 block md:min-w-[500px]"
			/>
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">{$t('taskee_principles.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">{$t('taskee_principles.subtitle')}</p>
			</div>
		</div>
	</div>

	<div class="mx-auto mb-8 max-w-4xl">
		<div class="mb-4 flex items-baseline gap-4">
			<h3 class="text-2xl font-bold">{$t('taskee_principles.title')}</h3>
		</div>

		<div class="card bg-base-100 mb-4 shadow-lg">
			<div class="card-body">
				<p class="mb-4">{$t('taskee_principles.subtitle')}</p>

				<div class="divider">
					{$t('taskee_principles.section_title') || 'Principles'}
				</div>

				<div class="space-y-6">
					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<i class="fa-solid fa-star text-primary mr-4 text-xl"></i>
								<div>
									<h4 class="font-semibold">{$t('taskee_principles.1.title')}</h4>
									<p>{$t('taskee_principles.1.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<i class="fa-solid fa-comments text-primary mr-4 text-xl"></i>
								<div>
									<h4 class="font-semibold">{$t('taskee_principles.2.title')}</h4>
									<p>{$t('taskee_principles.2.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<i class="fa-solid fa-check-circle text-primary mr-4 text-xl"></i>
								<div>
									<h4 class="font-semibold">{$t('taskee_principles.3.title')}</h4>
									<p>{$t('taskee_principles.3.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<i class="fa-solid fa-user-shield text-primary mr-4 text-xl"></i>
								<div>
									<h4 class="font-semibold">{$t('taskee_principles.4.title')}</h4>
									<p>{$t('taskee_principles.4.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<i class="fa-solid fa-handshake text-primary mr-4 text-xl"></i>
								<div>
									<h4 class="font-semibold">{$t('taskee_principles.5.title')}</h4>
									<p>{$t('taskee_principles.5.text')}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
