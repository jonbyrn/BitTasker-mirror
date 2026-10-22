<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';

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
	<!-- eslint-disable svelte/no-at-html-tags -->
	{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h3>{$t('terms.title')}</h3>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('terms.subtitle')}
				</p>
				<p class="text-base-content/80 mt-2 text-sm">
					{$t('terms.last_updated')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<!-- Aquí empieza el contenido de los términos -->

		<p>{@html $t('terms.intro')}</p>

		<h3>{$t('terms.definitions.title')}</h3>
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

		<h3>{$t('terms.scope.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.scope.point1')}</li>
				<li>{$t('terms.scope.point2')}</li>
				<li>{$t('terms.scope.point3')}</li>
				<li>{$t('terms.scope.point4')}</li>
				<li>{$t('terms.scope.point5')}</li>
			</ul>
		</div>

		<h3>{$t('terms.role.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.role.point1')}</li>
				<li>{$t('terms.role.point2')}</li>
				<li>{$t('terms.role.point3')}</li>
				<li>
					{$t('terms.role.point4')}
					<ul class="mt-2">
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

		<h3>{$t('terms.user.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<p class="m-0">{$t('terms.user.intro')}</p>
			<ul>
				<li>{$t('terms.user.point1')}</li>
				<li>{$t('terms.user.point2')}</li>
				<li>{$t('terms.user.point3')}</li>
				<li>{$t('terms.user.point4')}</li>
				<li>{$t('terms.user.point5')}</li>
				<li>{$t('terms.user.point6')}</li>
			</ul>

			<p class="mt-4 mb-2">{$t('terms.user.subintro')}</p>
			<ul>
				<li>{$t('terms.user.subpoint1')}</li>
				<li>{$t('terms.user.subpoint2')}</li>
				<li>{$t('terms.user.subpoint3')}</li>
				<li>{$t('terms.user.subpoint4')}</li>
				<li>{$t('terms.user.subpoint5')}</li>
				<li>{$t('terms.user.subpoint6')}</li>
				<li>{$t('terms.user.subpoint7')}</li>
			</ul>
		</div>
		<h3>{$t('terms.ugc.title')}</h3>
		<p>{$t('terms.ugc.intro')}</p>

		<h4>{$t('terms.ugc.objectionable_title')}</h4>
		<p>{$t('terms.ugc.objectionable_intro')}</p>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.ugc.objectionable1')}</li>
				<li>{$t('terms.ugc.objectionable2')}</li>
				<li>{$t('terms.ugc.objectionable3')}</li>
				<li>{$t('terms.ugc.objectionable4')}</li>
				<li>{$t('terms.ugc.objectionable5')}</li>
				<li>{$t('terms.ugc.objectionable6')}</li>
				<li>{$t('terms.ugc.objectionable7')}</li>
				<li>{$t('terms.ugc.objectionable8')}</li>
				<li>{$t('terms.ugc.objectionable9')}</li>
			</ul>
		</div>

		<h4>{$t('terms.ugc.reporting_title')}</h4>
		<p>{$t('terms.ugc.reporting_intro')}</p>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.ugc.reporting1')}</li>
				<li>{$t('terms.ugc.reporting2')}</li>
				<li>{$t('terms.ugc.reporting3')}</li>
				<li>{$t('terms.ugc.reporting4')}</li>
			</ul>
			<p class="mt-3 mb-0">{$t('terms.ugc.reporting_types')}</p>
		</div>

		<h4>{$t('terms.ugc.blocking_title')}</h4>
		<p>{$t('terms.ugc.blocking_intro')}</p>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.ugc.blocking1')}</li>
				<li>{$t('terms.ugc.blocking2')}</li>
				<li>{$t('terms.ugc.blocking3')}</li>
			</ul>
		</div>

		<h4>{$t('terms.ugc.action_title')}</h4>
		<p>{$t('terms.ugc.action_intro')}</p>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<h5 class="mb-2 font-semibold">{$t('terms.ugc.action_sla_title')}</h5>
			<p class="mb-2">{$t('terms.ugc.action_sla_intro')}</p>
			<ul>
				<li>{$t('terms.ugc.action_sla1')}</li>
				<li>{$t('terms.ugc.action_sla2')}</li>
				<li>{$t('terms.ugc.action_sla3')}</li>
				<li>{$t('terms.ugc.action_sla4')}</li>
			</ul>
			<div class="divider my-2"></div>
			<ul>
				<li>{$t('terms.ugc.action1')}</li>
				<li>{$t('terms.ugc.action2')}</li>
				<li>{$t('terms.ugc.action3')}</li>
			</ul>
			<p class="mt-3 mb-0 text-sm opacity-70">{$t('terms.ugc.decentralized_note')}</p>
		</div>

		<h3>{$t('terms.bitcoin.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.bitcoin.point1')}</li>
				<li>{$t('terms.bitcoin.point2')}</li>
				<li>{$t('terms.bitcoin.point3')}</li>
				<li>{$t('terms.bitcoin.point4')}</li>
				<li>{$t('terms.bitcoin.point5')}</li>
				<li>{$t('terms.bitcoin.point6')}</li>
			</ul>
		</div>

		<h3>{$t('terms.fees.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.fees.point1')}</li>
				<li>{$t('terms.fees.point2')}</li>
				<li>{$t('terms.fees.point3')}</li>
				<li>{$t('terms.fees.point4')}</li>
				<li>{$t('terms.fees.point5')}</li>
			</ul>
		</div>

		<h3>{$t('terms.encryption.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
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

		<h3>{$t('terms.language.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.language.point1')}</li>
				<li>{$t('terms.language.point2')}</li>
				<li>{$t('terms.language.point3')}</li>
				<li>{$t('terms.language.point4')}</li>
			</ul>
		</div>

		<h3>{$t('terms.disputes.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.disputes.point1')}</li>
				<li>{$t('terms.disputes.point2')}</li>
				<li>{$t('terms.disputes.point3')}</li>
				<li>{$t('terms.disputes.point4')}</li>
				<li>
					{$t('terms.disputes.point5')}
					<a href="/secure-payments" class="link link-primary">{$t('terms.disputes.escrow_link')}</a
					>.
				</li>
			</ul>
		</div>

		<h3>{$t('terms.ip.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.ip.point1')}</li>
				<li>{$t('terms.ip.point2')}</li>
				<li>{$t('terms.ip.point3')}</li>
				<li>{$t('terms.ip.point4')}</li>
			</ul>
		</div>

		<h3>{$t('terms.liability.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.liability.point1')}</li>
				<li>{$t('terms.liability.point2')}</li>
				<li>{$t('terms.liability.point3')}</li>
				<li>{$t('terms.liability.point4')}</li>
				<li>{$t('terms.liability.point5')}</li>
			</ul>
		</div>

		<h3>{$t('terms.indemnification.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.indemnification.point1')}</li>
				<li class="ml-6">{$t('terms.indemnification.point2')}</li>
				<li class="ml-6">{$t('terms.indemnification.point3')}</li>
				<li class="ml-6">{$t('terms.indemnification.point4')}</li>
				<li class="ml-6">{$t('terms.indemnification.point5')}</li>
				<li class="ml-6">{$t('terms.indemnification.point6')}</li>
				<li>{$t('terms.indemnification.point7')}</li>
			</ul>
		</div>

		<h3>{$t('terms.classWaiver.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
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

		<h3>{$t('terms.termination.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.termination.point1')}</li>
				<li>{$t('terms.termination.point2')}</li>
				<li>{$t('terms.termination.point3')}</li>
				<li>{$t('terms.termination.point4')}</li>
				<li>{$t('terms.termination.point5')}</li>
			</ul>
		</div>

		<h3>{$t('terms.disclaimers.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
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

		<h3>{$t('terms.forceMajeure.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.forceMajeure.point1')}</li>
				<li>{$t('terms.forceMajeure.point2')}</li>
			</ul>
		</div>

		<h3>{$t('terms.changes.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.changes.point1')}</li>
				<li>{$t('terms.changes.point2')}</li>
				<li>{$t('terms.changes.point3')}</li>
			</ul>
		</div>

		<h3>{$t('terms.law.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.law.point1')}</li>
				<li>{$t('terms.law.point2')}</li>
				<li>{$t('terms.law.point3')}</li>
			</ul>
		</div>

		<h3>{$t('terms.severability.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.severability.point1')}</li>
				<li>{$t('terms.severability.point2')}</li>
			</ul>
		</div>

		<h3>{$t('terms.entire_agreement.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{$t('terms.entire_agreement.point1')}</li>
				<li>{$t('terms.entire_agreement.point2')}</li>
			</ul>
		</div>

		<h3>{$t('terms.contact_info.title')}</h3>
		<div class="bg-base-100 rounded-box border-base-300 mb-4 border p-4">
			<ul>
				<li>{@html $t('terms.contact_info.point1')}</li>
				<li>{$t('terms.contact_info.point2')}</li>
			</ul>
		</div>
	</div>
</div>
