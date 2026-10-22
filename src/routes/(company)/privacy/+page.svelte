<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';

	let { data: seo } = $props();
</script>

<!-- eslint-disable svelte/no-at-html-tags -->
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
	<meta property="og:image:alt" content="Privacy Policy - BitTasker" />
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
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h3>{$t('privacy.title')}</h3>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('privacy.subtitle')}
				</p>
				<p class="text-base-content/80 mt-2 text-sm">
					{$t('privacy.last_updated')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<h3>{$t('privacy.sections.philosophy.title')}</h3>
		<p>{@html $t('privacy.sections.philosophy.content')}</p>

		<h3>{$t('privacy.sections.data_collection.title')}</h3>
		<p>{$t('privacy.sections.data_collection.content')}</p>

		<h3>{$t('privacy.sections.public_data.title')}</h3>
		<p>{$t('privacy.sections.public_data.intro')}</p>
		<ul>
			<li>{$t('privacy.sections.public_data.npub')}</li>
			<li>{$t('privacy.sections.public_data.profile')}</li>
			<li>{$t('privacy.sections.public_data.actions')}</li>
			<li>{$t('privacy.sections.public_data.transactions')}</li>
		</ul>
		<p>{$t('privacy.sections.public_data.warning')}</p>

		<h3>{$t('privacy.sections.private_data.title')}</h3>
		<p>{@html $t('privacy.sections.private_data.content')}</p>

		<h3>{$t('privacy.sections.location_data.title')}</h3>
		<p>{$t('privacy.sections.location_data.content')}</p>

		<h3>{$t('privacy.sections.email_data.title')}</h3>
		<p>{$t('privacy.sections.email_data.content')}</p>

		<h3>{$t('privacy.sections.device_data.title')}</h3>
		<p>{$t('privacy.sections.device_data.content')}</p>

		<h3>{$t('privacy.sections.third_party.title')}</h3>
		<p>{$t('privacy.sections.third_party.intro')}</p>
		<ul>
			<li>{$t('privacy.sections.third_party.sentry')}</li>
			<li>{$t('privacy.sections.third_party.firebase')}</li>
			<li>{$t('privacy.sections.third_party.maps')}</li>
			<li>{$t('privacy.sections.third_party.translate')}</li>
			<li>{$t('privacy.sections.third_party.turnstile')}</li>
			<li>{$t('privacy.sections.third_party.analytics')}</li>
			<li>{$t('privacy.sections.third_party.swaps')}</li>
		</ul>

		<h3>{$t('privacy.sections.analytics.title')}</h3>
		<p>{$t('privacy.sections.analytics.intro')}</p>
		<p>
			<strong>{$t('privacy.sections.analytics.warning_title')}</strong>
			{$t('privacy.sections.analytics.warning_body')}
		</p>
		<p>{$t('privacy.sections.analytics.details_intro')}</p>
		<ul>
			<li>{$t('privacy.sections.analytics.usage')}</li>
			<li>{$t('privacy.sections.analytics.referrals')}</li>
			<li>{$t('privacy.sections.analytics.performance')}</li>
		</ul>

		<h3>{$t('privacy.sections.use_of_info.title')}</h3>
		<p>{$t('privacy.sections.use_of_info.content')}</p>

		<h3>{$t('privacy.sections.storage.title')}</h3>
		<p>{$t('privacy.sections.storage.content')}</p>

		<h3>{$t('privacy.sections.rights.title')}</h3>
		<p>{$t('privacy.sections.rights.content')}</p>

		<h3>{$t('privacy.sections.changes.title')}</h3>
		<p>{$t('privacy.sections.changes.content')}</p>

		<h3>{$t('privacy.sections.contact.title')}</h3>
		<p>{@html $t('privacy.sections.contact.content')}</p>
	</div>
</div>
