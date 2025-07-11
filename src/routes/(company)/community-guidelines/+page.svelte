<script lang="ts">
	let activeTab = $state<'posters' | 'taskers'>('posters');
</script>

<div class="container mx-auto p-4 py-8 md:p-12">
	<h1 class="mb-4 text-center text-4xl font-bold">Community Guidelines</h1>
	<p class="mb-8 text-center text-lg text-base-content/80">
		Welcome to BitTasker!
	</p>
	<p class="mb-8 text-center text-lg text-base-content/80">
		Our guidelines are designed to ensure a safe, respectful, and reliable
		experience for everyone.
		<br />
		By using our platform, you agree to uphold these standards.
	</p>

	<div role="tablist" class="tabs-lifted tabs tabs-lg">
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'posters'}
			onclick={() => (activeTab = 'posters')}
		>
			For Task Posters
		</button>
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'taskers'}
			onclick={() => (activeTab = 'taskers')}
		>
			For Taskers
		</button>
	</div>

	<div class="rounded-b-box rounded-t-none bg-base-100 p-6 pt-8">
		{#if activeTab === 'posters'}
			<!-- Content for Task Posters -->
			<div class="space-y-4">
				<div class="collapse collapse-plus bg-base-200">
					<input type="checkbox" />
					<div class="collapse-title text-xl font-medium">1. Posting a Task</div>
					<div class="collapse-content">
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
				<div class="collapse collapse-plus bg-base-200">
					<input type="checkbox" />
					<div class="collapse-title text-xl font-medium">2. Payments and Fees</div>
					<div class="collapse-content">
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
				<div class="collapse collapse-plus bg-base-200">
					<input type="checkbox" />
					<div class="collapse-title text-xl font-medium">3. Conduct and Communication</div>
					<div class="collapse-content">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Respectful Interaction:</strong> Treat all Taskers with respect and
									professionalism. Harassment, discrimination, or abusive language will not be
									tolerated.
							</li>
							<li>
								<strong>Protect Private Information:</strong> Do not share personal contact details
									(phone numbers, emails, social media) in public comments. Use the private
									chat after an offer is accepted.
							</li>
						</ul>
					</div>
				</div>
			</div>
		{:else}
			<!-- Content for Taskers -->
			<div class="space-y-4">
				<div class="collapse collapse-plus bg-base-200">
					<input type="checkbox" />
					<div class="collapse-title text-xl font-medium">1. Your Profile and Offers</div>
					<div class="collapse-content">
						<ul class="list-inside list-disc space-y-2">
							<li>
								<strong>Honest Representation:</strong> Your profile is your professional resume.
									Use a clear photo of yourself and provide accurate information about your
									skills and experience.
							</li>
							<li>
								<strong>All-Inclusive Offers:</strong> Your offer must cover the entire cost of the
									task, including any materials or expenses. Do not ask for more money after
									your offer is accepted, except in the event that the scope of work was not clearly
									outlined in the task description.
							</li>
							<li>
								<strong>Only Offer on Tasks You Can Do:</strong> Only make offers on tasks you are
									qualified and available to complete to a high standard.
							</li>
						</ul>
					</div>
				</div>
				<div class="collapse collapse-plus bg-base-200">
					<input type="checkbox" />
					<div class="collapse-title text-xl font-medium">2. Completing a Task</div>
					<div class="collapse-content">
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
				<div class="collapse collapse-plus bg-base-200">
					<input type="checkbox" />
					<div class="collapse-title text-xl font-medium">3. Payments and Conduct</div>
					<div class="collapse-content">
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
		{/if}
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
