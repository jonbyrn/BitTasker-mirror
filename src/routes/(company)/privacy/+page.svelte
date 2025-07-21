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
		<h1 class="text-4xl font-bold">{$t('privacy.title')}</h1>
		<p class="text-base-content/80 mx-auto mt-4 max-w-3xl text-lg">
			{$t('privacy.subtitle')}
		</p>
		<p class="text-base-content/70 mt-2 text-sm">
			{$t('privacy.last_updated')}
		</p>
	</div>

	<div class="prose mx-auto mt-12 max-w-4xl">
		<h2>{$t('privacy.sections.philosophy.title')}</h2>
		<p>{@html $t('privacy.sections.philosophy.content')}</p>

		<h2>{$t('privacy.sections.data_collection.title')}</h2>
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

		<h2>{$t('privacy.sections.analytics.title')}</h2>
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

		<h2>{$t('privacy.sections.use_of_info.title')}</h2>
		<p>{$t('privacy.sections.use_of_info.content')}</p>

		<h2>{$t('privacy.sections.storage.title')}</h2>
		<p>{$t('privacy.sections.storage.content')}</p>

		<h2>{$t('privacy.sections.rights.title')}</h2>
		<p>{$t('privacy.sections.rights.content')}</p>

		<h2>{$t('privacy.sections.changes.title')}</h2>
		<p>{$t('privacy.sections.changes.content')}</p>

		<h2>{$t('privacy.sections.contact.title')}</h2>
		<p>{@html $t('privacy.sections.contact.content')}</p>
	</div>
</div>
