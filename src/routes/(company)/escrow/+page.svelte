<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';

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
	<meta property="og:image:alt" content="Bitcoin Escrow Service - Secure Task Payments" />
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
				<h1>{$t('title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('subtitle')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<h3 class="text-center">{$t('guideTitle')}</h3>
		<p>
			{@html $t('guideIntro')}
		</p>

		<h3>{$t('step1Title')}</h3>
		<p>
			{$t('step1Text1')}
		</p>
		<p>
			{$t('step1Text2')}
		</p>
		<p>
			{$t('step1Text3')}
		</p>

		<h3>
			{$t('step2Title')}
		</h3>
		<p>
			{$t('step2Text1')}
		</p>
		<ul>
			<li>
				{@html $t('step2List1')}
			</li>
			<li>
				{@html $t('step2List2')}
			</li>
		</ul>

		<h3>{$t('whatIfTitle')}</h3>
		<p>{$t('whatIfIntro')}</p>
		<ul>
			<li>
				{@html $t('whatIfList1')}
			</li>
			<li>
				{@html $t('whatIfList2')}
			</li>
			<li>
				{@html $t('whatIfList3')}
			</li>
		</ul>
		<div class="divider my-12"></div>

		<!-- Technical Section -->
		<h3 class="text-center">{$t('techTitle')}</h3>
		<p>
			{@html $t('techIntro')}
		</p>

		<h3>{$t('mechanismTitle')}</h3>
		<p>
			{$t('mechanismText')}
		</p>

		<h3>{$t('lifecycleTitle')}</h3>
		<ol>
			<li>
				{@html $t('lifecycleList1')}
			</li>
			<li>
				{@html $t('lifecycleList2')}
			</li>
			<li>
				{@html $t('lifecycleList3')}
			</li>
			<li>
				{@html $t('lifecycleList4')}
			</li>
		</ol>

		<p>
			{$t('lifecycleConclusion')}
		</p>

		<h3>{$t('feesTitle')}</h3>
		<p>
			{$t('feesText')}
		</p>
	</div>
</div>
