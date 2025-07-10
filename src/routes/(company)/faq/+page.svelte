<script lang="ts">
	let openAccordion = $state({
		general: -1,
		client: -1,
		tasker: -1,
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

<div class="container mx-auto p-4 py-8 md:p-12">
	<div class="text-center">
		<h1 class="text-4xl font-bold">Frequently Asked Questions</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			Have a question? We've got answers. Find help with posting tasks, getting paid in Bitcoin, our
			secure escrow system, and more.
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
								<strong>Review Offers:</strong> Receive offers from skilled Taskers. Compare their
								profiles, ratings, and reviews.
							</li>
							<li>
								<strong>Hire & Fund:</strong> Choose the best Tasker and fund the task with Bitcoin.
								The payment is held securely in our escrow until the task is done.
							</li>
							<li>
								<strong>Task Complete:</strong> Once you're satisfied, release the payment to the
								Tasker. Leave a review to help the community!
							</li>
						</ol>
					</div>
				</div>
			</div>
		</div>

		<!-- For Clients -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Clients</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.client === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('client', 0)}>
						How do I post a task?
					</button>
					<div class="collapse-content prose">
						<p>
							Click the 'Post a Task' button, fill in the details: what you need done, where, and
							your budget. The more detail you provide, the better the offers you'll receive.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.client === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('client', 1)}>
						How do I choose the right Tasker?
					</button>
					<div class="collapse-content prose">
						<p>
							Review each Tasker's profile, completion rate, and reviews from other clients. You
							can also ask them questions in the comment section to ensure they're the right fit
							before accepting an offer.
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- For Taskers -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Taskers</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.tasker === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('tasker', 0)}>
						How do I start earning money?
					</button>
					<div class="collapse-content prose">
						<p>
							Complete your profile, browse tasks in your area, and start making offers on jobs
							that match your skills. A great offer explains why you're the best person for the
							job.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.tasker === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('tasker', 1)}>
						When do I get paid?
					</button>
					<div class="collapse-content prose">
						<p>
							Once you complete the task and request payment, the client will review your work and
							release the Bitcoin from escrow directly to your wallet. Our automated system also
							ensures you get paid if the client is unresponsive after 7 days.
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
							Bitcoin enables faster, cheaper, and more secure global payments without relying on
							traditional banks. We use the Liquid Network for confidential, near-instant
							transactions.
						</p>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.payment === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('payment', 1)}>
						What are the fees?
					</button>
					<div class="collapse-content prose">
						<p>
							BitTasker charges a service fee to the Tasker upon successful completion of a task.
							This fee helps us operate the platform, provide support, and build new features.
							The fee is a percentage of the task price and is shown to you when you make an
							offer.
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
							Absolutely. When you fund a task, your Bitcoin is held in a secure 2-of-2
							multisignature escrow wallet. This means neither you nor the Tasker can move the
							funds alone. Payment is only released when the task is marked as complete and
							approved.
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
