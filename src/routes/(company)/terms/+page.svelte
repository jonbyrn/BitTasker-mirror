<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
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
	<meta property="og:image:alt" content="Terms of Service - BitTasker" />
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
				<h1 class="text-5xl font-bold">{$t('terms.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('terms.subtitle')}
				</p>
				<p class="text-base-content/70 mt-2 text-sm">
					{$t('terms.last_updated')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto mt-12 max-w-4xl px-8 pb-12">
		<!-- Aquí empieza el contenido de los términos -->

		<p>{@html $t('terms.intro')}</p>


		<h2>{$t('terms.definitions.title')}</h2>
		<p>{$t('terms.definitions.intro')}</p>
		<ul>
			<li>{@html $t('terms.definitions.bitTasker')}</li>
			<li>{@html $t('terms.definitions.services')}</li>
			<li>{@html $t('terms.definitions.platform')}</li>
			<li>{@html $t('terms.definitions.user')}</li>
			<li>{@html $t('terms.definitions.tasker')}</li>
			<li>{@html $t('terms.definitions.taskee')}</li>
			<li>{@html $t('terms.definitions.task_contract')}</li>
			<li>{@html $t('terms.definitions.nostr')}</li>
			<li>{@html $t('terms.definitions.bitcoin')}</li>
			<li>{@html $t('terms.definitions.service_fee')}</li>
		</ul>

		<h2>{$t('terms.scope.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<p class="m-0 font-semibold">{$t('terms.scope.subsection')}</p>
			<ul class="ml-5">
				<li>{$t('terms.scope.point1')}</li>
				<li>{$t('terms.scope.point2')}</li>
				<li>{$t('terms.scope.point3')}</li>
				<li>{$t('terms.scope.point4')}</li>
				<li>{$t('terms.scope.point5')}</li>
			</ul>
		</div>

		<h2>{$t('terms.role.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.role.point1')}</li>
				<li>{$t('terms.role.point2')}</li>
				<li>{$t('terms.role.point3')}</li>
				<li>
					{$t('terms.role.point4')}
					<ul class="mt-2 ml-5">
						<li>{$t('terms.role.point4a')}</li>
						<li>{$t('terms.role.point4b')}</li>
						<li>{$t('terms.role.point4c')}</li>
					</ul>
				</li>
				<li>{$t('terms.role.point5')}</li>
				<li>{$t('terms.role.point6')}</li>
				<li>{$t('terms.role.point7')}</li>
			</ul>
		</div>

		<h2>{$t('terms.user.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<p class="m-0">{$t('terms.user.intro')}</p>
			<ul class="ml-5">
				<li>{$t('terms.user.point1')}</li>
				<li>{$t('terms.user.point2')}</li>
				<li>{$t('terms.user.point3')}</li>
				<li>{$t('terms.user.point4')}</li>
				<li>{$t('terms.user.point5')}</li>
				<li>{$t('terms.user.point6')}</li>
			</ul>

			<p class="mt-4 mb-2">{$t('terms.user.subintro')}</p>
			<ul class="ml-5">
				<li>{$t('terms.user.subpoint1')}</li>
				<li>{$t('terms.user.subpoint2')}</li>
				<li>{$t('terms.user.subpoint3')}</li>
				<li>{$t('terms.user.subpoint4')}</li>
				<li>{$t('terms.user.subpoint5')}</li>
				<li>{$t('terms.user.subpoint6')}</li>
				<li>{$t('terms.user.subpoint7')}</li>
			</ul>
		</div>
		<h2>{$t('terms.bitcoin.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.bitcoin.point1')}</li>
				<li>{$t('terms.bitcoin.point2')}</li>
				<li>{$t('terms.bitcoin.point3')}</li>
				<li>{$t('terms.bitcoin.point4')}</li>
				<li>{$t('terms.bitcoin.point5')}</li>
				<li>{$t('terms.bitcoin.point6')}</li>
			</ul>
		</div>

		<h2>{$t('terms.fees.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.fees.point1')}</li>
				<li>{$t('terms.fees.point2')}</li>
				<li>{$t('terms.fees.point3')}</li>
				<li>{$t('terms.fees.point4')}</li>
				<li>{$t('terms.fees.point5')}</li>
			</ul>
		</div>

		<h2>{$t('terms.encryption.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.encryption.point1')}</li>
				<li>{$t('terms.encryption.point2')}</li>
				<li>{$t('terms.encryption.point3')}</li>
				<li>{$t('terms.encryption.point4')}</li>
				<li>
					{$t('terms.encryption.point5')}
					<a href="/privacy" class="link link-primary">{$t('terms.encryption.privacy_link')}</a>.
				</li>
			</ul>
		</div>

		<h2>{$t('terms.language.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.language.point1')}</li>
				<li>{$t('terms.language.point2')}</li>
				<li>{$t('terms.language.point3')}</li>
				<li>{$t('terms.language.point4')}</li>
			</ul>
		</div>

		<h2>{$t('terms.disputes.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.disputes.point1')}</li>
				<li>{$t('terms.disputes.point2')}</li>
				<li>{$t('terms.disputes.point3')}</li>
				<li>{$t('terms.disputes.point4')}</li>
				<li>
					{$t('terms.disputes.point5')}
					<a href="/escrow" class="link link-primary">{$t('terms.disputes.escrow_link')}</a>.
				</li>
			</ul>
		</div>

		<h2>{$t('terms.ip.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.ip.point1')}</li>
				<li>{$t('terms.ip.point2')}</li>
				<li>{$t('terms.ip.point3')}</li>
				<li>{$t('terms.ip.point4')}</li>
			</ul>
		</div>

		<h2>{$t('terms.liability.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.liability.point1')}</li>
				<li>{$t('terms.liability.point2')}</li>
				<li>{$t('terms.liability.point3')}</li>
				<li>{$t('terms.liability.point4')}</li>
				<li>{$t('terms.liability.point5')}</li>
			</ul>
		</div>

		<h2>{$t('terms.indemnification.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.indemnification.point1')}</li>
				<li class="ml-6">{$t('terms.indemnification.point2')}</li>
				<li class="ml-6">{$t('terms.indemnification.point3')}</li>
				<li class="ml-6">{$t('terms.indemnification.point4')}</li>
				<li class="ml-6">{$t('terms.indemnification.point5')}</li>
				<li class="ml-6">{$t('terms.indemnification.point6')}</li>
				<li>{$t('terms.indemnification.point7')}</li>
			</ul>
		</div>

		<h2>{$t('terms.classWaiver.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>
					<strong>{$t('terms.classWaiver.point1.label')}</strong>
					{$t('terms.classWaiver.point1.text')}
				</li>
				<li>
					<strong>{$t('terms.classWaiver.point2.label')}</strong>
					{$t('terms.classWaiver.point2.text')}
				</li>
				<li>
					<strong>{$t('terms.classWaiver.point3.label')}</strong>
					{$t('terms.classWaiver.point3.text')}
				</li>
				<li>
					<strong>{$t('terms.classWaiver.point4.label')}</strong>
					{$t('terms.classWaiver.point4.text')}
				</li>
				<li>
					<strong>{$t('terms.classWaiver.point5.label')}</strong>
					{$t('terms.classWaiver.point5.text')}
				</li>
			</ul>
		</div>

		<h2>{$t('terms.termination.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.termination.point1')}</li>
				<li>{$t('terms.termination.point2')}</li>
				<li>{$t('terms.termination.point3')}</li>
				<li>{$t('terms.termination.point4')}</li>
				<li>{$t('terms.termination.point5')}</li>
			</ul>
		</div>

		<h2>{$t('terms.disclaimers.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>
					<strong>{$t('terms.disclaimers.point1.label')}</strong>
					{$t('terms.disclaimers.point1.text')}
				</li>
				<li>
					<strong>{$t('terms.disclaimers.point2.label')}</strong>
					{$t('terms.disclaimers.point2.text')}
				</li>
				<li>
					<strong>{$t('terms.disclaimers.point3.label')}</strong>
					{$t('terms.disclaimers.point3.text')}
				</li>
				<li>
					<strong>{$t('terms.disclaimers.point4.label')}</strong>
					{$t('terms.disclaimers.point4.text')}
				</li>
				<li>
					<strong>{$t('terms.disclaimers.point5.label')}</strong>
					{$t('terms.disclaimers.point5.text')}
				</li>
			</ul>
		</div>

		<h2>{$t('terms.forceMajeure.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.forceMajeure.point1')}</li>
				<li>{$t('terms.forceMajeure.point2')}</li>
			</ul>
		</div>

		<h2>{$t('terms.changes.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.changes.point1')}</li>
				<li>{$t('terms.changes.point2')}</li>
				<li>{$t('terms.changes.point3')}</li>
			</ul>
		</div>

		<h2>{$t('terms.law.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.law.point1')}</li>
				<li>{$t('terms.law.point2')}</li>
				<li>{$t('terms.law.point3')}</li>
			</ul>
		</div>

		<h2>{$t('terms.severability.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.severability.point1')}</li>
				<li>{$t('terms.severability.point2')}</li>
			</ul>
		</div>

		<h2>{$t('terms.entire_agreement.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul class="ml-5">
				<li>{$t('terms.entire_agreement.point1')}</li>
				<li>{$t('terms.entire_agreement.point2')}</li>
			</ul>
		</div>

		<h2>{$t('terms.contact_info.title')}</h2>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<p>{@html $t('terms.contact_info.point1')}</p>
			<p class="mt-2">{$t('terms.contact_info.point2')}</p>
		</div>
	</div>
</div>
