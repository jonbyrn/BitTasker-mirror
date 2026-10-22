<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	// Icon imports for unplugin-icons
	import IconStar from '~icons/mdi/star';
	import IconCommentMultipleOutline from '~icons/mdi/comment-multiple-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconShieldAccount from '~icons/mdi/shield-account';
	import IconHandshake from '~icons/mdi/handshake';

	let { data: seo } = $props();
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
	<meta property="og:image:alt" content="Tasker Principles - BitTasker" />
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
				<h1>{$t('tasker_principles.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">{$t('tasker_principles.subtitle')}</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<div class="mb-4 flex items-baseline gap-4">
			<h3>{$t('tasker_principles.title')}</h3>
		</div>

		<div class="card bg-base-100 mb-4 shadow-lg">
			<div class="card-body">
				<p class="mb-4">{$t('tasker_principles.subtitle')}</p>

				<div class="divider">
					{$t('tasker_principles.section_title')}
				</div>

				<div class="space-y-6">
					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<IconStar class="text-primary mr-4 text-xl" />
								<div>
									<h4 class="font-medium">{$t('tasker_principles.1.title')}</h4>
									<p>{$t('tasker_principles.1.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<IconCommentMultipleOutline class="text-primary mr-4 text-xl" />
								<div>
									<h4 class="font-medium">{$t('tasker_principles.2.title')}</h4>
									<p>{$t('tasker_principles.2.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<IconCheckCircle class="text-primary mr-4 text-xl" />
								<div>
									<h4 class="font-medium">{$t('tasker_principles.3.title')}</h4>
									<p>{$t('tasker_principles.3.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<IconShieldAccount class="text-primary mr-4 text-xl" />
								<div>
									<h4 class="font-medium">{$t('tasker_principles.4.title')}</h4>
									<p>{$t('tasker_principles.4.text')}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center">
								<IconHandshake class="text-primary mr-4 text-xl" />
								<div>
									<h4 class="font-medium">{$t('tasker_principles.5.title')}</h4>
									<p>{$t('tasker_principles.5.text')}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
