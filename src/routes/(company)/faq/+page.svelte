<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';

	let { data } = $props();
	const seo = data.seo;

	let openAccordion = $state({
		general: -1,
		taskers: -1,
		taskees: -1,
		payment: -1,
		safety: -1
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

	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="BitTasker FAQ - Your Questions Answered" />
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
		<h1 class="text-4xl font-bold">Frequently Asked Questions</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			Common questions about how BitTasker works for both taskers and taskees.
		</p>
	</div>

	<div class="mx-auto mt-12 max-w-4xl space-y-8">
		<!-- General Questions -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">General</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.general === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('general', 0)}>
						What is BitTasker?
					</button>
					<div class="collapse-content prose">
						<p>
							BitTasker is a trusted community platform that connects people who need to outsource
							tasks and find local services with people who are looking to earn money and ready to
							work. From simple to complicated tasks, BitTasker can help you complete your home
							cleaning, handyman jobs, admin work, photography, graphic design or even build a
							website.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.general === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('general', 1)}>
						How does BitTasker work?
					</button>
					<div class="collapse-content prose">
						<ol>
							<li>
								<strong>Post Your Task:</strong> Describe what you need done and set a fair budget.
								Posting is free!
							</li>
							<li>
								<strong>Review Offers:</strong> Receive offers from skilled Taskees. Compare their
								profiles, ratings, and reviews.
							</li>
							<li>
								<strong>Hire & Fund:</strong> Choose the best Taskee and fund the task with Bitcoin or fiat.
								The payment is held securely in our escrow until the task is done.
							</li>
							<li>
								<strong>Task Complete:</strong> Once you're satisfied, release the payment to the
								Taskee. Leave a review to help the community!
							</li>
						</ol>
					</div>
				</div>
			</div>
		</div>

		<!-- For Taskers -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Taskers</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 0)}>
						How do I post a task?
					</button>
					<div class="collapse-content prose">
						<p>
							Simply create an account, click "Post a Task," and fill in the details. Provide a clear description, set a fair budget, and specify your timeline. The more details you provide, the better offers you'll receive from taskees.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 1)}>
						How does payment work?
					</button>
					<div class="collapse-content prose">
						<p>
							When you accept a bid, your payment is immediately secured in our Bitcoin escrow system. Once the taskee completes the work to your satisfaction, you release the payment. If you don't take action within 7 days, the payment is automatically released to the taskee.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 2}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 2)}>
						What if I'm not satisfied with the work?
					</button>
					<div class="collapse-content prose">
						<p>
							If you're not satisfied with the work, you can initiate a dispute. The payment stays locked while both parties work toward a fair solution. Our dispute resolution process is designed to be fair and transparent.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 3}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 3)}>
						Can I cancel a task?
					</button>
					<div class="collapse-content prose">
						<p>
							Yes, you can cancel a task at any time. If you cancel before work begins, you'll receive a full refund. If work has already started, you may need to pay a partial amount depending on the progress made.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 4}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 4)}>
						What are the fees for taskers?
					</button>
					<div class="collapse-content prose">
						<p>
							BitTasker uses a dynamic tier system that rewards active taskees with lower fees. The more tasks you complete, the less you pay. Check out our <a href="/taskee-fees" class="text-primary hover:underline">Taskee Fees</a> page for full details.
						</p>
					</div>
				</div>
			</div>
		</div>

		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Taskees</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskees === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskees', 0)}>
						How do I find tasks?
					</button>
					<div class="collapse-content prose">
						<p>
							Browse available tasks in your area and skill set. You can filter by category, location, budget, and deadline. When you find a task that matches your skills, submit a competitive bid with your proposed approach and timeline.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskees === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskees', 1)}>
						How do I get paid?
					</button>
					<div class="collapse-content prose">
						<p>
							When a tasker accepts your bid, the payment is immediately secured in escrow. Once you complete the work and the tasker approves it, the payment is released to your Bitcoin wallet. If the tasker doesn't respond within 7 days, you're automatically paid.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskees === 2}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskees', 2)}>
						What if the tasker doesn't approve my work?
					</button>
					<div class="collapse-content prose">
						<p>
							If a tasker disputes your work, you can discuss the issue and work toward a solution. Our dispute resolution process is fair and transparent. If no agreement is reached, the system follows a clear process to ensure fair outcomes.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskees === 3}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskees', 3)}>
						What are the fees for taskees?
					</button>
					<div class="collapse-content prose">
						<p>
							BitTasker uses a dynamic tier system that rewards active taskees with lower fees. The more tasks you complete, the less you pay. Check out our <a href="/taskee-fees" class="text-primary hover:underline">Taskee Fees</a> page for full details.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskees === 4}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskees', 4)}>
						Do I need to own Bitcoin?
					</button>
					<div class="collapse-content prose">
						<p>
							No, you don't need to own Bitcoin to use BitTasker, you can also use fiat currency. You can receive payments in Bitcoin or USDT and convert them to your local currency if desired.
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Payments & Bitcoin -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">Payments & Bitcoin</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.payment === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('payment', 0)}>
						Why use Bitcoin?
					</button>
					<div class="collapse-content prose">
						<p>
							Bitcoin is liberation; an unstoppable cross-border currency that can enable you to make payments to anyone, anywhere, at any time.
							We use the Liquid Network for low cost, near-instant transactions.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.payment === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('payment', 1)}>
						What are the fees?
					</button>
					<div class="collapse-content prose">
						<p>
							BitTasker charges a service fee upon successful completion of a task.
							This fee helps us operate the platform, provide support, and build new features.
							The fee is a percentage of the task price and is shown to you when you make an
							offer.
						</p>
						<p>
							In addition, there are network transaction fees when sending Bitcoin or USDT. These fees are
							charged by the blockchain network (Liquid, Bitcoin, or Lightning, depending on how you're sending the payment)
							and are not under our control, nor do we receive them. For the Liquid and Lightning networks,
							these fees are typically very small, typically $0.01 or less.
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Trust & Safety -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">Trust & Safety</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.safety === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('safety', 0)}>
						Is my payment secure?
					</button>
					<div class="collapse-content prose">
						<p>
							Yes. When a Tasker funds a task, the funds are held in a secure 2-of-2
							multisignature escrow wallet. This means neither the Tasker nor the Taskeee can move the
							funds alone. Payment is only released when the task is marked as complete and
							approved, or when the Tasker and Taskee agree on a different outcome.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.safety === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('safety', 1)}>
						What happens if something goes wrong?
					</button>
					<div class="collapse-content prose">
						<p>
							Our automated escrow system has built-in rules for cancellations, changes, and
							disputes to ensure a fair outcome. If you can't resolve an issue directly with the
							other party, the escrow system ensures the fairest outcome.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
