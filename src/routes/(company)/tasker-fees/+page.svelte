<script lang="ts">
	/* eslint-disable svelte/no-at-html-tags */
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';

	let { data: seo } = $props();
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
	<meta property="og:image:alt" content="Fees when I need help - BitTasker" />
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
				<h1 class="text-5xl">{$t('tasker.fees.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('tasker.fees.subtitle')}
				</p>
			</div>
		</div>
	</section>

	<!-- Main Content Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<!-- Fee Structure Introduction -->
		<div class="mb-12">
			<h3>{$t('tasker.fees.structure.title')}</h3>
			<p class="text-base-content/80 mb-6 text-lg">
				{$t('tasker.fees.structure.description')}
			</p>
		</div>

		<!-- Savings Alert -->
		<div class="alert alert-success alert-outline mb-8">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>
				<strong>{@html $t('tasker.fees.savingsTitle')}</strong>
				{@html $t('tasker.fees.savingsDescription')}
			</span>
		</div>

		<!-- Tier Cards Grid -->
		<div class="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
			<!-- Tier 1 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
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
					<p class="text-sm">{$t('tasker.fees.tier1.description')}</p>

					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('tasker.fees.tier1.bitcoin.label')}</div>
								<div class="stat-value text-primary">{$t('tasker.fees.tier1.bitcoin.rate')}</div>
							</div>
						</div>
					</div>

					<div class="text-base-content/80 text-sm">
						<p>{$t('tasker.fees.tier1.example')}</p>
					</div>
				</div>
			</div>

			<!-- Tier 2 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
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
					<p class="text-sm">{$t('tasker.fees.tier2.description')}</p>

					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('tasker.fees.tier2.bitcoin.label')}</div>
								<div class="stat-value text-primary">{$t('tasker.fees.tier2.bitcoin.rate')}</div>
							</div>
						</div>
					</div>

					<div class="text-base-content/80 text-sm">
						<p>{$t('tasker.fees.tier2.example')}</p>
					</div>
				</div>
			</div>

			<!-- Tier 3 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
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
					<p class="text-sm">{$t('tasker.fees.tier3.description')}</p>

					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('tasker.fees.tier3.bitcoin.label')}</div>
								<div class="stat-value text-primary">{$t('tasker.fees.tier3.bitcoin.rate')}</div>
							</div>
						</div>
					</div>

					<div class="text-base-content/80 text-sm">
						<p>{$t('tasker.fees.tier3.example')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Tasker Benefits & Visibility Section -->
		<div class="mt-12">
			<h3>{$t('tasker.fees.benefits.title')}</h3>
			<p class="mb-6">{$t('tasker.fees.benefits.description')}</p>
			<ul class="mt-4">
				<li>{@html $t('tasker.fees.benefits.badge')}</li>
				<li>{@html $t('tasker.fees.benefits.priority')}</li>
				<li>{@html $t('tasker.fees.benefits.profile')}</li>
			</ul>
		</div>

		<!-- Tier Maintenance Section -->
		<div class="mt-12">
			<h3>{$t('fees.maintenance.title')}</h3>
			<p class="text-base-content/80 mb-6 text-lg">{$t('fees.maintenance.description')}</p>
		</div>

		<!-- Bitcoin Payments Section -->
		<div class="mt-12">
			<h3>{$t('tasker.fees.btc.title')}</h3>
			<p class="mb-6">{$t('tasker.fees.btc.description')}</p>
		</div>

		<div class="mt-8 overflow-x-auto">
			<table class="table-zebra table">
				<thead>
					<tr>
						<th>{@html $t('tasker.fees.btc.table.header_1')}</th>
						<th>{@html $t('tasker.fees.btc.table.header_2')}</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>{@html $t('fees.tiers.1.title')}</td>
						<td>2.5%</td>
					</tr>
					<tr>
						<td>{@html $t('fees.tiers.2.title')}</td>
						<td>2%</td>
					</tr>
					<tr>
						<td>{@html $t('fees.tiers.3.title')}</td>
						<td>1.5%</td>
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
			<span>{@html $t('tasker.fees.btc.rebooking.btc_example')}</span>
		</div>

		<!-- Rebooking Discount Section -->
		<div class="mt-12">
			<h3>{$t('tasker.fees.rebooking.title')}</h3>
			<p class="mb-6">{$t('tasker.fees.rebooking.description')}</p>
		</div>

		<!-- Rebooking Discount Card -->
		<div class="card bg-base-100 border-success mt-8 border shadow-lg">
			<div class="card-body">
				<h3 class="card-title mt-4 mb-4">{$t('tasker.fees.rebooking.card_title')}</h3>
				<p>{$t('tasker.fees.rebooking.card_intro')}</p>
				<ul>
					<li>{@html $t('tasker.fees.rebooking.btc_fee')}</li>
				</ul>
				<p class="text-base-content/80 mt-3 text-sm">{$t('tasker.fees.rebooking.example')}</p>
				<p class="text-base-content/80 mt-3 text-sm italic">
					{$t('tasker.fees.rebooking.counts_toward_tier')}
				</p>
			</div>
		</div>

		<!-- Call to Action Section -->
		<div class="mt-12 flex flex-col items-center">
			<h4>{$t('tasker.fees.cta.title')}</h4>
			<a href="/create-task" class="btn btn-primary mt-4">{$t('tasker.fees.cta.button')}</a>
		</div>
	</div>
</div>
