<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import IconEmailOutline from '~icons/mdi/email-outline';
	import IconLogin from '~icons/mdi/login';
	import IconShieldAlert from '~icons/mdi/shield-alert';
	import IconCheckCircle from '~icons/mdi/check-circle-outline';
	import IconInformation from '~icons/mdi/information-outline';

	let { data: seo } = $props();

	const supportUser = 'hello';
	const supportDomain = 'bittasker.com';
	const mailtoHref = `mailto:${supportUser}@${supportDomain}?subject=Account%20Deletion%20Request`;
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
	<meta property="og:image:alt" content="Delete Account - BitTasker" />
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
	<!-- eslint-disable svelte/no-at-html-tags -->
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<!-- Hero -->
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{$t('delete_account.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('delete_account.subtitle')}
				</p>
			</div>
		</div>
	</section>

	<div class="mx-auto my-16 max-w-4xl space-y-16 px-8">
		<!-- How It Works -->
		<section>
			<h3 class="mb-8 text-center">{$t('delete_account.how_it_works.title')}</h3>

			<ol class="space-y-4">
				<li class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body flex-row items-start gap-4 p-6">
						<div class="badge badge-primary badge-lg shrink-0 text-lg font-bold">1</div>
						<div>
							<p class="font-semibold">{$t('delete_account.how_it_works.step1_title')}</p>
							<p class="text-base-content/70 mt-1 text-sm">
								{$t('delete_account.how_it_works.step1_description')}
							</p>
						</div>
					</div>
				</li>

				<li class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body flex-row items-start gap-4 p-6">
						<div class="badge badge-primary badge-lg shrink-0 text-lg font-bold">2</div>
						<div>
							<p class="font-semibold">{$t('delete_account.how_it_works.step2_title')}</p>
							<p class="text-base-content/70 mt-1 text-sm">
								{$t('delete_account.how_it_works.step2_description')}
							</p>
						</div>
					</div>
				</li>

				<li class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body flex-row items-start gap-4 p-6">
						<div class="badge badge-primary badge-lg shrink-0 text-lg font-bold">3</div>
						<div>
							<p class="font-semibold">{$t('delete_account.how_it_works.step3_title')}</p>
							<p class="text-base-content/70 mt-1 text-sm">
								{$t('delete_account.how_it_works.step3_description')}
							</p>
						</div>
					</div>
				</li>

				<li class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body flex-row items-start gap-4 p-6">
						<div class="badge badge-error badge-lg shrink-0 text-lg font-bold">4</div>
						<div>
							<p class="font-semibold">{$t('delete_account.how_it_works.step4_title')}</p>
							<p class="text-base-content/70 mt-1 text-sm">
								{$t('delete_account.how_it_works.step4_description')}
							</p>
						</div>
					</div>
				</li>
			</ol>
		</section>

		<!-- CTA: Go to Settings -->
		<section>
			<div class="card border-base-300 bg-base-100 border shadow-xl">
				<div class="card-body items-center text-center">
					<IconShieldAlert class="text-error text-4xl" />
					<h3 class="card-title">{$t('delete_account.cta.logged_in_title')}</h3>
					<p class="text-base-content/70">{$t('delete_account.cta.logged_in_description')}</p>
					<div class="card-actions mt-4">
						<a href="/settings" class="btn btn-error btn-wide">
							<IconLogin class="text-xl" />
							{$t('delete_account.cta.go_to_settings')}
						</a>
					</div>
				</div>
			</div>
		</section>

		<!-- What Gets Deleted -->
		<section>
			<h3 class="mb-6 text-center">{$t('delete_account.what_gets_deleted.title')}</h3>

			<div class="card bg-base-100 border-base-300 border shadow">
				<div class="card-body">
					<ul class="space-y-3">
						<li class="flex items-start gap-3">
							<IconCheckCircle class="text-success mt-0.5 shrink-0 text-xl" />
							<span>{$t('delete_account.what_gets_deleted.item1')}</span>
						</li>
						<li class="flex items-start gap-3">
							<IconCheckCircle class="text-success mt-0.5 shrink-0 text-xl" />
							<span>{$t('delete_account.what_gets_deleted.item2')}</span>
						</li>
						<li class="flex items-start gap-3">
							<IconCheckCircle class="text-success mt-0.5 shrink-0 text-xl" />
							<span>{$t('delete_account.what_gets_deleted.item3')}</span>
						</li>
					</ul>

					<div class="alert alert-outline alert-warning mt-6">
						<IconInformation class="shrink-0 text-xl" />
						<div>
							<p class="font-semibold">
								{$t('delete_account.what_gets_deleted.nostr_note_title')}
							</p>
							<p class="mt-1 text-sm">
								{$t('delete_account.what_gets_deleted.nostr_note_description')}
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Lost Access -->
		<section>
			<h3 class="mb-6 text-center">{$t('delete_account.lost_access.title')}</h3>

			<p class="text-base-content/70 mb-6 text-center">
				{$t('delete_account.lost_access.description')}
			</p>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body p-5">
						<p class="font-semibold">{$t('delete_account.lost_access.option1_title')}</p>
						<p class="text-base-content/70 text-sm">
							{$t('delete_account.lost_access.option1_description')}
						</p>
					</div>
				</div>

				<div class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body p-5">
						<p class="font-semibold">{$t('delete_account.lost_access.option2_title')}</p>
						<p class="text-base-content/70 text-sm">
							{$t('delete_account.lost_access.option2_description')}
						</p>
					</div>
				</div>

				<div class="card bg-base-100 border-base-300 border shadow">
					<div class="card-body p-5">
						<p class="font-semibold">{$t('delete_account.lost_access.option3_title')}</p>
						<p class="text-base-content/70 text-sm">
							{$t('delete_account.lost_access.option3_description')}
						</p>
					</div>
				</div>
			</div>

			<div class="alert alert-outline alert-info mt-6">
				<IconInformation class="shrink-0 text-xl" />
				<div>
					<p class="font-semibold">{$t('delete_account.lost_access.no_access_title')}</p>
					<p class="mt-1 text-sm">{$t('delete_account.lost_access.no_access_description')}</p>
				</div>
			</div>
		</section>

		<!-- Contact Support -->
		<section class="pb-8">
			<div class="card border-base-300 bg-base-100 border shadow-xl">
				<div class="card-body items-center text-center">
					<h3 class="card-title">{$t('delete_account.cta.contact_title')}</h3>
					<p class="text-base-content/70">{$t('delete_account.cta.contact_description')}</p>
					<div class="card-actions mt-4">
						<a href={mailtoHref} class="btn btn-primary btn-wide">
							<IconEmailOutline class="text-xl" />
							{$t('delete_account.cta.contact_button')}
						</a>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>
