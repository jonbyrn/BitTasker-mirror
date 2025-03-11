<script lang="ts">
	import { onMount } from 'svelte';
</script>

<div class="bg-base-100 min-h-screen px-4 py-12">
	<!-- Header -->
	<div class="mb-12 text-center">
		<h1 class="mb-4 text-4xl font-bold">How Bittasker Works</h1>
		<p class="mx-auto max-w-2xl text-lg">
			Your guide to using the world's first crypto-powered freelance marketplace
		</p>
	</div>

	<!-- Steps -->
	<div class="mx-auto max-w-4xl">
		<ul class="steps steps-vertical lg:steps-horizontal mb-12 w-full">
			<li class="step step-primary">Sign Up</li>
			<li class="step step-primary">Create Profile</li>
			<li class="step step-primary">Post or Find Tasks</li>
			<li class="step step-primary">Complete Work</li>
			<li class="step step-primary">Get Paid</li>
		</ul>

		<!-- Detailed Steps -->
		<div class="space-y-12">
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">1. Sign Up</h3>
					<p>
						Create your account using your email or connect your crypto wallet directly. We support
						multiple wallet providers for your convenience.
					</p>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">2. Create Your Profile</h3>
					<p>
						Build your professional profile by adding your skills, experience, and portfolio.
						Clients can view your profile to make informed hiring decisions.
					</p>
					<div class="mt-4">
						<h4 class="mb-2 font-semibold">Key Profile Elements:</h4>
						<ul class="list-inside list-disc space-y-2">
							<li>Professional skills and expertise</li>
							<li>Work experience and education</li>
							<li>Portfolio samples</li>
							<li>Preferred cryptocurrency payment methods</li>
						</ul>
					</div>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">3. Post or Find Tasks</h3>
					<div class="divider">FOR CLIENTS</div>
					<div class="space-y-4">
						<p>
							Post your project with clear requirements, budget, and timeline. Our smart matching
							system will help connect you with the right freelancers.
						</p>
						<div class="alert alert-info">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								class="h-6 w-6 shrink-0 stroke-current"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								></path></svg
							>
							<span>Set your budget in your preferred cryptocurrency</span>
						</div>
					</div>
					<div class="divider">FOR FREELANCERS</div>
					<div class="space-y-4">
						<p>
							Browse available projects and submit proposals to ones that match your skills. Use
							filters to find the perfect opportunities.
						</p>
					</div>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">4. Complete Work</h3>
					<p>
						Once hired, communicate with your client/freelancer through our platform. Use our
						built-in tools for:
					</p>
					<ul class="mt-4 list-inside list-disc space-y-2">
						<li>Real-time messaging</li>
						<li>File sharing</li>
						<li>Milestone tracking</li>
						<li>Progress updates</li>
					</ul>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">5. Get Paid</h3>
					<p>Our secure smart contract escrow system ensures safe payments for both parties:</p>
					<div class="mt-4 space-y-4">
						<div class="alert alert-success">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							<span>Funds are held securely in escrow</span>
						</div>
						<div class="alert alert-success">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							<span>Released automatically upon milestone completion</span>
						</div>
						<div class="alert alert-success">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							<span>Instant crypto payments to your wallet</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA -->
	<div class="mt-12 text-center">
		<h3 class="mb-4 text-2xl font-bold">Ready to Start?</h3>
		<div class="flex justify-center gap-4">
			<a href="/signup" class="btn btn-primary">Create Account</a>
			<a href="/browse-tasks" class="btn btn-ghost">Browse Tasks</a>
		</div>
	</div>
</div>
