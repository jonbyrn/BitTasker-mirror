<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	/* eslint-disable svelte/no-at-html-tags */
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
	<meta property="og:image:alt" content="Fees when I want work - BitTasker" />
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
	<!-- Hero Section -->
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{$t('fees.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('fees.subtitle')}
				</p>
			</div>
		</div>
	</section>

	<!-- Main Content Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<!-- Fee Structure Introduction -->
		<div class="mb-12">
			<h2>{$t('fees.structure.title')}</h2>
			<p class="text-base-content/80 mb-6 text-lg">
				{$t('fees.structure.description')}
			</p>
			<p class="text-base-content/80 mb-6 text-lg">
				{$t('fees.structure.areas')}
			</p>
		</div>

		<!-- Savings Alert -->
		<div class="alert alert-success alert-outline mb-8">
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
				></path>
			</svg>
			<span>
				{@html $t('fees.structure.note')}
			</span>
		</div>

		<!-- Tier Cards Grid -->
		<div class="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
			<!-- Tier 1 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body text-center">
					<div class="badge badge-primary mb-2">{$t('fees.tiers.1.badge')}</div>
					<h3 class="card-title mx-auto text-center">
						{@html $t('fees.tiers.1.title')}
					</h3>
					<div class="mb-4 flex justify-center">
						<img
							src="/images/badges/BitTasker-Nakamoto-Newbie-256x256.webp"
							alt="Nakamoto Newbie Badge"
							class="h-48 w-48 object-contain"
						/>
					</div>
					<p class="text-sm">{$t('fees.tiers.1.criteria')}</p>

					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('fees.tiers.1.bitcoin.label')}</div>
								<div class="stat-value text-primary">{$t('fees.tiers.1.bitcoin.rate')}</div>
							</div>
						</div>
					</div>

					<div class="text-base-content/80 text-sm">
						<p>{$t('fees.tiers.1.example')}</p>
					</div>
				</div>
			</div>

			<!-- Tier 2 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body text-center">
					<div class="badge badge-primary mb-2">{$t('fees.tiers.2.badge')}</div>
					<h3 class="card-title mx-auto text-center">
						{@html $t('fees.tiers.2.title')}
					</h3>
					<div class="mb-4 flex justify-center">
						<img
							src="/images/badges/BitTasker-Satoshi-Stacker-256x256.webp"
							alt="Satoshi Stacker Badge"
							class="h-48 w-48 object-contain"
						/>
					</div>
					<p class="text-sm">{$t('fees.tiers.2.criteria')}</p>

					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('fees.tiers.2.bitcoin.label')}</div>
								<div class="stat-value text-primary">{$t('fees.tiers.2.bitcoin.rate')}</div>
							</div>
						</div>
					</div>

					<div class="text-base-content/80 text-sm">
						<p>{$t('fees.tiers.2.example')}</p>
					</div>
				</div>
			</div>

			<!-- Tier 3 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body text-center">
					<div class="badge badge-primary mb-2">{$t('fees.tiers.3.badge')}</div>
					<h3 class="card-title mx-auto text-center">
						{@html $t('fees.tiers.3.title')}
					</h3>
					<div class="mb-4 flex justify-center">
						<img
							src="/images/badges/BitTasker-Hash-Master-256x256.webp"
							alt="Hash Master Badge"
							class="h-48 w-48 object-contain"
						/>
					</div>
					<p class="text-sm">{$t('fees.tiers.3.criteria')}</p>

					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('fees.tiers.3.bitcoin.label')}</div>
								<div class="stat-value text-primary">{$t('fees.tiers.3.bitcoin.rate')}</div>
							</div>
						</div>
					</div>

					<div class="text-base-content/80 text-sm">
						<p>{$t('fees.tiers.3.example')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Taskee Benefits Section -->
		<div class="mt-12">
			<h2>{$t('fees.benefits.title')}</h2>
			<p class="mb-6">{$t('fees.benefits.description')}</p>
			<ul class="text-base-content/80 mt-4 list-inside list-disc">
				<li>{@html $t('fees.benefits.item_1')}</li>
				<li>{@html $t('fees.benefits.item_2')}</li>
				<li>{@html $t('fees.benefits.item_3')}</li>
				<li>{@html $t('fees.benefits.item_4')}</li>
			</ul>
		</div>

		<!-- Tier Maintenance Section -->
		<div class="mt-12">
			<h2>{$t('fees.maintenance.title')}</h2>
			<p class="text-base-content/80 mb-6 text-lg">{$t('fees.maintenance.description')}</p>
		</div>

		<!-- Bitcoin Payments Section -->
		<div class="mt-12">
			<h2>{$t('fees.bitcoin.title')}</h2>
			<p class="mb-6">
				{@html $t('fees.bitcoin.description')}
			</p>
		</div>

		<!-- Bitcoin Fee Table -->
		<div class="mt-8 overflow-x-auto">
			<table class="table-zebra table w-full">
				<thead>
					<tr>
						<th>{$t('fees.bitcoin.table.header.tier')}</th>
						<th>{$t('fees.bitcoin.table.header.rate')}</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>{$t('fees.bitcoin.table.row.1.tier')}</td>
						<td>{$t('fees.bitcoin.table.row.1.rate')}</td>
					</tr>
					<tr>
						<td>{$t('fees.bitcoin.table.row.2.tier')}</td>
						<td>{$t('fees.bitcoin.table.row.2.rate')}</td>
					</tr>
					<tr>
						<td>{$t('fees.bitcoin.table.row.3.tier')}</td>
						<td>{$t('fees.bitcoin.table.row.3.rate')}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Bitcoin Example Alert -->
		<div class="alert alert-info alert-outline">
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
				></path>
			</svg>
			<span>{@html $t('fees.bitcoin.example')}</span>
		</div>

		<!-- Repeat Work Bonus Section -->
		<div class="mt-12">
			<h2>{$t('fees.repeat.title')}</h2>
			<p class="mb-6">{$t('fees.repeat.description')}</p>
		</div>

		<!-- Repeat Bonus Card -->
		<div class="card bg-base-100 border-success mt-8 border shadow-lg">
			<div class="card-body">
				<h3 class="card-title mt-4 mb-4">{$t('fees.repeat_bonus.title')}</h3>
				<p>{$t('fees.repeat_bonus.description')}</p>
				<ul>
					<li>{@html $t('fees.repeat_bonus.item_2')}</li>
				</ul>
				<p class="text-base-content/80 mt-3 text-sm">{$t('fees.repeat_bonus.note_1')}</p>
				<p class="text-base-content/80 mt-3 text-sm italic">{$t('fees.repeat_bonus.note_2')}</p>
			</div>
		</div>

		<!-- Call to Action Section -->
		<div class="mt-12 flex flex-col items-center text-center">
			<h2>{$t('fees.cta.title')}</h2>
			<a href="/auth/signup" class="btn btn-primary mt-4">{$t('fees.cta.button')}</a>
		</div>
	</div>
</div>
