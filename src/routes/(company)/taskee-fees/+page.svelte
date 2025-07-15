<script lang="ts">
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
	<meta property="og:image" content={seo.image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Taskee Fees & Earnings - BitTasker" />
	<meta property="og:site_name" content="BitTasker" />
	
	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:image" content={seo.image} />
	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />
	
	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="container mx-auto p-4 py-8 md:p-12">
	<img
	src={$darkMode
		? '/images/Bittasker-logo-tagline-dark.svg'
		: '/images/Bittasker-logo-tagline-light.svg'}
	alt="BitTasker Logo"
	class="mx-auto mb-4 block md:min-w-[500px]"
	/>
	<div class="text-center">
		<h1 class="text-4xl font-bold">Taskee Fees & Pricing</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			Simple, transparent pricing designed to reward loyal taskees
		</p>
	</div>

	<div class="prose mx-auto mt-8 max-w-4xl">
		<h2>Taskee Fee Structure</h2>
		<p>
			At BitTasker, we believe in rewarding loyalty. The more tasks you complete, the less you pay in fees. Our dynamic tier system ensures that our most active taskees enjoy the best rates.
		</p>

		<div class="alert alert-success alert-outline mb-8">
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span><strong>Save money as you use BitTasker!</strong> Our unique tier system rewards active taskees with progressively lower fees.</span>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
			<!-- Tier 1 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">Tier 1</div>
					<h3 class="card-title">Nakamoto Newbie</h3>
					<p class="text-sm">For taskees who complete 0-3 tasks in the last 30 days</p>
					<div class="flex justify-center my-4">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">Fee Rate</div>
								<div class="stat-value text-primary">12.5%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>Example: For a $100 task, you'll receive $87.50.</p>
					</div>
				</div>
			</div>
			
			<!-- Tier 2 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">Tier 2</div>
					<h3 class="card-title">Satoshi Stacker</h3>
					<p class="text-sm">For taskees who complete 4-10 tasks in the last 30 days</p>
					<div class="flex justify-center my-4">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">Fee Rate</div>
								<div class="stat-value text-primary">10%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>Example: For a $100 task, you'll receive $90.</p>
					</div>
				</div>
			</div>
			
			<!-- Tier 3 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">Tier 3</div>
					<h3 class="card-title">Hash Master</h3>
					<p class="text-sm">For our most active taskees with 11+ tasks in the last 30 days</p>
					<div class="flex justify-center my-4">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">Fee Rate</div>
								<div class="stat-value text-primary">7.5%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>Example: For a $100 task, you'll receive $92.50.</p>
					</div>
				</div>
			</div>
		</div>

		<h2>Bitcoin Payments: Keep More of What You Earn</h2>
		<p>
			Earn even more when taskers pay with Bitcoin! We offer reduced fees for Bitcoin transactions.
		</p>

		<div class="overflow-x-auto my-6">
			<table class="table table-zebra">
				<thead>
					<tr>
						<th>Taskee Tier</th>
						<th>Bitcoin Fee Rate</th>
						<th>Improvement vs. Standard</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Nakamoto Newbie</td>
						<td>2.5%</td>
						<td>Keep 10% more!</td>
					</tr>
					<tr>
						<td>Satoshi Stacker</td>
						<td>2%</td>
						<td>Keep 8% more!</td>
					</tr>
					<tr>
						<td>Hash Master</td>
						<td>1.5%</td>
						<td>Keep 6% more!</td>
					</tr>
				</tbody>
			</table>
		</div>
		
		<div class="alert alert-info alert-outline my-8">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<span><strong>Bitcoin Example:</strong> As a <strong class="text-primary">Hash Master</strong> tier taskee, a $100 task paid with Bitcoin would net you $98.50 instead of $92.50!</span>
		</div>

		<h2>Repeat Taskee Bonus</h2>
		<p>
			Establish strong tasker relationships and enjoy significantly reduced fees on repeat work!
		</p>
		
		<div class="card bg-base-100 shadow-lg my-6 border border-success">
			<div class="card-body">
				<h3 class="card-title">Returning Taskees = Higher Earnings!</h3>
				<p>When a taskee books you for a repeat task:</p>
				<ul>
					<li>Standard payments: Just <strong>3% fee</strong> (down from 7.5-12.5%)</li>
					<li>Bitcoin payments: Just <strong>1% fee</strong> (down from 1.5-2.5%)</li>
				</ul>
				<p class="text-sm mt-3 opacity-80">
					Example: For a $100 repeat task, you'll earn $97 with standard payment or $99 with Bitcoin!
				</p>
				<p class="text-sm mt-3 opacity-80">
					Booking repeat work with a taskee counts towards your 30 day rolling tasks to maintain your tier.
				</p>
			</div>
		</div>

		<h2>Taskee Benefits & Visibility</h2>
		<p>
			Higher tier taskees enjoy additional benefits beyond reduced fees:
		</p>
		<ul>
			<li><strong>Enhanced Visibility:</strong> Higher tier taskees appear at the top of search results</li>
			<li><strong>Badge Recognition:</strong> Earn prestigious tier badges displayed on your profile</li>
			<li><strong>Bid Priority:</strong> Your proposals are highlighted and prioritized in taskees' inboxes</li>
			<li><strong>Competitive Edge:</strong> When comparing similar taskees, taskees can see your tier status, giving you an advantage</li>
		</ul>
		
		<h2>Tier Advancement & Maintenance</h2>
		<p>
			Your tier status is calculated based on your activity over the past 30 days, and is updated daily. The more tasks you complete, the higher your tier and the lower your fees.
		</p>

		<div class="divider my-8"></div>

		<div class="flex flex-col items-center my-6 text-center">
			<h3>Ready to start earning with the most competitive fees in the industry?</h3>
			<a href="/sign-up" class="btn btn-primary mt-4">Join BitTasker Today</a>
		</div>
	</div>
</div>