<script lang="ts">
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

<div class="container mx-auto p-4 py-8 md:p-12">
	<div class="text-center">
		<h1 class="text-4xl font-bold">Community Guidelines</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			Welcome to BitTasker! Our guidelines are designed to ensure a safe, respectful, and reliable experience for everyone.
		</p>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			By using our platform, you agree to uphold these standards.
		</p>
	</div>

	<div class="mx-auto mt-12 max-w-4xl space-y-8">
		<!-- For Task Posters -->
		<div class="bg-base-100 rounded-box p-6">
			<h2 class="mb-4 text-2xl font-bold">For Task Posters</h2>
			<div class="join join-vertical w-full">
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.posters === 0}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('posters', 0)}>
						1. Posting a Task
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Be Clear and Detailed:</strong> Provide a clear title and a thorough
									description of the task. The more information you give, the better the offers
									you'll receive.
							</li>
							<li>
								<strong>Set a Fair Budget:</strong> Your budget should reflect the effort and skill
									required. This ensures you attract skilled Taskers and get quality results.
							</li>
							<li>
								<strong>Prohibited Tasks:</strong> Do not post tasks that are illegal, unethical, or
									dangerous. This includes academic assignments, illicit activities, or anything
									that violates our terms of service.
							</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.posters === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('posters', 1)}>
						2. Payments and Fees
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Secure Escrow:</strong> All payments (Bitcoin or fiat) are held in our
									secure escrow system. Funds are only released to the Tasker once you confirm the
									task is complete.
							</li>
							<li>
								<strong>No Off-Platform Payments:</strong> To protect all parties, you must not
									pay or be asked to pay outside the BitTasker platform. This voids any
									protection we can offer.
							</li>
							<li>
								<strong>All-Inclusive Offers:</strong> The offer you accept is the final price.
									Do not negotiate separate charges. Any additional work should be handled as a
									new task or by adjusting the task price before completion.
							</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.posters === 2}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('posters', 2)}>
						3. Communication and Conduct
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Respectful Communication:</strong> Treat Taskers with respect and
									professionalism. Constructive feedback helps improve the platform for everyone.
							</li>
							<li>
								<strong>Keep It On-Platform:</strong> For security and protection reasons, all
									communication should remain within the BitTasker platform.
							</li>
							<li>
								<strong>Timely Responses:</strong> Be prompt in responding to messages and
									accepting or declining offers. This helps maintain a smooth experience for all
									users.
							</li>
						</ul>
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
						1. Making an Offer
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Skill-Based Offers:</strong> Only offer on tasks you can complete
									competently. Misrepresenting your skills or qualifications is not permitted.
							</li>
							<li>
								<strong>Fair and Realistic Pricing:</strong> Provide offers that reflect the
									effort, skill, and time required. Extreme underbidding or overbidding damages
									the platform's integrity.
							</li>
							<li>
								<strong>No Spam or Bots:</strong> Don't send templated or automated messages.
									Personalized offers that address the specific task are more likely to be
									accepted.
							</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 1}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 1)}>
						2. Completing a Task
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Uphold Quality:</strong> Complete the task to the best of your ability, as
									outlined in the description. Professionalism and high-quality work lead to
									better reviews and more opportunities.
							</li>
							<li>
								<strong>Meet Deadlines:</strong> Punctuality is key. If you are running late or
									need to reschedule, communicate with the Task Poster immediately.
							</li>
							<li>
								<strong>Honour Your Commitment:</strong> Once you accept a task, you are expected
									to complete it. Frequent cancellations will negatively impact your reputation
									and platform standing.
							</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openAccordion.taskers === 2}>
					<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleAccordion('taskers', 2)}>
						3. Payments and Conduct
					</button>
					<div class="collapse-content prose">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Secure Payments Only:</strong> All payments are processed through our
									escrow system. Never solicit or accept payments outside of BitTasker.
							</li>
							<li>
								<strong>Professionalism:</strong> Maintain a high standard of professionalism,
									respect, and integrity. You are the face of BitTasker.
							</li>
							<li>
								<strong>Protect Private Information:</strong> Keep all communication and personal
									details within the private chat. Do not share contact information publicly.
							</li>
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