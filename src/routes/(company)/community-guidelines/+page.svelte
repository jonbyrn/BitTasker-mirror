<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	
	let { data } = $props();
	const seo = data.seo;

	let openAccordion = $state({
		posters: -1,
		taskers: -1
	});

	function toggleAccordion(category: keyof typeof openAccordion, index: number) {
		if (openAccordion[category] === index) {
			openAccordion[category] = -1; // Close if already open
		} else {
			openAccordion[category] = index; // Open the new one
		}
	}
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
	<meta property="og:image:alt" content="Community Guidelines - BitTasker" />
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
	<div class="text-center">
		<img
		src={$darkMode
			? '/images/Bittasker-logo-tagline-dark.svg'
			: '/images/Bittasker-logo-tagline-light.svg'}
		alt="BitTasker Logo"
		class="mx-auto mb-4 block md:min-w-[500px]"
		/>
		<h1 class="text-4xl font-bold">Community Guidelines</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			Welcome to BitTasker! Our guidelines are designed to ensure a safe, respectful, and reliable experience for everyone.
		</p>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			By using our platform, you agree to uphold these standards.
		</p>
	</div>

	<div class="mx-auto mt-12 max-w-4xl space-y-8">
		<!-- For Taskers (was: For Task Posters) -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Taskers</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.posters === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('posters', 0)}>
						1. Posting a Task
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc">
							<li>Be clear and specific about what you need</li>
							<li>Provide accurate location and timing requirements</li>
							<li>Set fair and reasonable budgets</li>
							<li>Include all relevant details upfront</li>
							<li>Respond promptly to questions from taskees</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.posters === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('posters', 1)}>
						2. During Task Completion
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc">
							<li>Communicate clearly and professionally</li>
							<li>Be available for questions and updates</li>
							<li>Provide constructive feedback</li>
							<li>Respect the taskee's time and expertise</li>
							<li>Address concerns promptly and fairly</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.posters === 2}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('posters', 2)}>
						3. Payment and Reviews
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc">
							<li>Release escrow funds promptly when work is completed satisfactorily</li>
							<li>Leave honest, constructive reviews</li>
							<li>Address any issues through our dispute resolution process</li>
							<li>Maintain confidentiality of taskee information</li>
						</ul>
					</div>
				</div>
			</div>
		</div>

		<!-- For Taskees (was: For Taskers) -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Taskees</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 0)}>
						1. Profile and Bidding
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc">
							<li>Complete your profile with accurate information</li>
							<li>Showcase relevant skills and experience</li>
							<li>Submit competitive and realistic bids</li>
							<li>Ask clarifying questions before bidding</li>
							<li>Only bid on tasks you can realistically complete</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 1)}>
						2. Task Execution
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc">
							<li>Deliver work according to agreed specifications</li>
							<li>Communicate progress and any issues promptly</li>
							<li>Meet deadlines or negotiate changes in advance</li>
							<li>Maintain high standards of quality</li>
							<li>Be professional in all interactions</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 2}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 2)}>
						3. Professional Standards
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc">
							<li>Honor your commitments and agreements</li>
							<li>Provide excellent customer service</li>
							<li>Respect tasker property and privacy</li>
							<li>Follow all applicable laws and regulations</li>
							<li>Build long-term relationships based on trust</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="mt-8 rounded-lg bg-base-200 p-6 text-center">
		<h3 class="mb-2 text-2xl font-bold">Our Commitment to Trust and Safety</h3>
		<p class="text-base-content/80">
			We are committed to building a trustworthy community and will take action to protect it.<br />
			Violations of these guidelines may result in warnings, account suspension, or a permanent ban.
		</p>
		<p class="text-base-content/80"><br />
			Our algorithm also ensures that violations of our community guidelines are heavily penalized and impact your reputation and platform standing.<br />
			Thank you for being a part of BitTasker!
		</p>
	</div>
</div>