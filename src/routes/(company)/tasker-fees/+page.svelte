<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { darkMode } from '$lib/stores/theme.store';
	import { t } from '$lib/stores/i18n.store';

	let { data } = $props();
	const seo = data.seo;

	// Current date for the "last updated" timestamp
	const currentDate = new Date().toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
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
	<meta property="og:image:alt" content="Tasker Fees & Pricing - BitTasker" />
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
				<h1 class="text-5xl font-bold">{$t('tasker.fees.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('tasker.fees.subtitle')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto max-w-4xl px-8 pb-12">
		<div class="mb-12">
			<h2 class="text-2xl font-bold">{$t('tasker.fees.structure.title')}</h2>
			<p class="text-base-content/80 mt-4 text-lg">
				{$t('tasker.fees.structure.description')}
			</p>
			<span><strong>Save money as you use BitTasker!</strong> Our unique tier system rewards active taskers with progressively lower fees.</span>
		</div>

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

		<div class="my-8 grid grid-cols-1 gap-6 md:grid-cols-3">
			<!-- Tier 1 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">{$t('fees.tiers.1.badge')}</div>
					<h3 class="card-title">Nakamoto Newbie</h3>
					<div class="mb-4 flex justify-center">
						<img
							src="/images/BitTasker-Nakamoto-Newbie-512x512.webp"
							alt="Nakamoto Newbie Badge"
							class="h-48 w-48 object-contain"
						/>
					</div>
					<p class="text-sm">{$t('tasker.fees.tier1.description')}</p>
					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('tasker.fees.label')}</div>
								<div class="stat-value text-primary">12.5%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>{$t('tasker.fees.tier1.example')}</p>
					</div>
				</div>
			</div>

			<!-- Tier 2 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">{$t('fees.tiers.2.badge')}</div>
					<h3 class="card-title">Satoshi Stacker</h3>
					<div class="mb-4 flex justify-center">
						<img
							src="/images/BitTasker-Satoshi-Stacker-512x512.webp"
							alt="Satoshi Stacker Badge"
							class="h-48 w-48 object-contain"
						/>
					</div>
					<p class="text-sm">{$t('tasker.fees.tier2.description')}</p>
					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('tasker.fees.label')}</div>
								<div class="stat-value text-primary">10%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>{$t('tasker.fees.tier2.example')}</p>
					</div>
				</div>
			</div>

			<!-- Tier 3 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">{$t('fees.tiers.3.badge')}</div>
					<h3 class="card-title">Hash Master</h3>
					<div class="mb-4 flex justify-center">
						<img
							src="/images/BitTasker-Hash-Master-512x512.webp"
							alt="Hash Master Badge"
							class="h-48 w-48 object-contain"
						/>
					</div>
					<p class="text-sm">{$t('tasker.fees.tier3.description')}</p>
					<div class="my-4 flex justify-center">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">{$t('tasker.fees.label')}</div>
								<div class="stat-value text-primary">7.5%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>{$t('tasker.fees.tier3.example')}</p>
					</div>
				</div>
			</div>
		</div>

		<h2>{$t('tasker.fees.btc.title')}</h2>
		<p>{$t('tasker.fees.btc.description')}</p>

		<div class="my-6 overflow-x-auto">
			<table class="table-zebra table">
				<thead>
					<tr>
						<th>{$t('tasker.fees.btc.table.header_1')}</th>
						<th>{$t('tasker.fees.btc.table.header_2')}</th>
						<th>{$t('tasker.fees.btc.table.header_3')}</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Nakamoto Newbie</td>
						<td>2.5%</td>
						<td>{$t('tasker.fees.btc.table.tier_1_savings')}</td>
					</tr>
					<tr>
						<td>Satoshi Stacker</td>
						<td>2%</td>
						<td>{$t('tasker.fees.btc.table.tier_2_savings')}</td>
					</tr>
					<tr>
						<td>Hash Master</td>
						<td>1.5%</td>
						<td>{$t('tasker.fees.btc.table.tier_3_savings')}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div class="alert alert-info alert-outline my-8">
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
			<span>{@html $t('tasker.fees.rebooking.btc_example')}</span>
		</div>

		<h2>{$t('tasker.fees.rebooking.title')}</h2>
		<p>{$t('tasker.fees.rebooking.description')}</p>

		<div class="card bg-base-100 border-success my-6 border shadow-lg">
			<div class="card-body">
				<h3 class="card-title">{$t('tasker.fees.rebooking.card_title')}</h3>
				<p>{$t('tasker.fees.rebooking.card_intro')}</p>
				<ul>
					<li>{@html $t('tasker.fees.rebooking.standard_fee')}</li>
					<li>{@html $t('tasker.fees.rebooking.btc_fee')}</li>
				</ul>
				<p class="mt-3 text-sm opacity-80">{$t('tasker.fees.rebooking.example')}</p>
				<p class="mt-3 text-sm opacity-80">{$t('tasker.fees.rebooking.counts_toward_tier')}</p>
			</div>
		</div>

		<h2>{$t('tasker.fees.benefits.title')}</h2>
		<p>{$t('tasker.fees.benefits.description')}</p>
		<ul>
			<li>{@html $t('tasker.fees.benefits.badge')}</li>
			<li>{@html $t('tasker.fees.benefits.priority')}</li>
			<li>{@html $t('tasker.fees.benefits.profile')}</li>
		</ul>

		<div class="divider my-8"></div>

		<div class="my-6 flex flex-col items-center">
			<h3>{$t('tasker.fees.cta.title')}</h3>
			<a href="/post-task" class="btn btn-primary mt-4">{$t('tasker.fees.cta.button')}</a>
		</div>
	</div>
</div>
