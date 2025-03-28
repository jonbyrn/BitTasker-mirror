<script lang="ts">
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';

	function handleImageError(event: Event) {
		const target = event.target as HTMLImageElement;
		target.src = 'https://placehold.co/300x300?text=Tutorial';
	}
</script>

<svelte:head>
	<title>Client Tutorial | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Getting Started as a Client"
	subtitle="Here's how to post projects and hire talented freelancers."
	step={5}
	totalSteps={5}
>
	<div class="space-y-8">
		<div class="mb-6 flex flex-col items-center">
			<div class="mb-4">
				<img
					src="/images/client-tutorial.svg"
					alt="Client Tutorial"
					class="h-64 w-64"
					onerror={handleImageError}
				/>
			</div>

			<h2 class="text-center text-xl font-bold">Welcome to the BitTasker!</h2>
			<p class="text-base-content/70 mt-2 text-center">
				Your profile has been created. Let's get you started on hiring talented freelancers.
			</p>
		</div>

		<div class="card bg-base-100 shadow-sm">
			<div class="card-body">
				<h3 class="card-title">
					<span class="badge badge-primary mr-2">1</span>
					Create a Project
				</h3>
				<p>
					Post your project with a detailed description, budget, and timeline to attract the right
					freelancers.
				</p>
			</div>
		</div>

		<div class="card bg-base-100 shadow-sm">
			<div class="card-body">
				<h3 class="card-title">
					<span class="badge badge-primary mr-2">2</span>
					Review Proposals
				</h3>
				<p>
					Evaluate bids from freelancers based on their skills, experience, reviews, and proposed
					approach.
				</p>
			</div>
		</div>

		<div class="card bg-base-100 shadow-sm">
			<div class="card-body">
				<h3 class="card-title">
					<span class="badge badge-primary mr-2">3</span>
					Hire and Collaborate
				</h3>
				<p>
					Select the best freelancer for your project and use our platform tools to communicate
					effectively.
				</p>
			</div>
		</div>

		<div class="card bg-base-100 shadow-sm">
			<div class="card-body">
				<h3 class="card-title">
					<span class="badge badge-primary mr-2">4</span>
					Track Progress
				</h3>
				<p>
					Monitor project milestones and receive regular updates to ensure work is progressing as
					planned.
				</p>
			</div>
		</div>

		<div class="card bg-base-100 shadow-sm">
			<div class="card-body">
				<h3 class="card-title">
					<span class="badge badge-primary mr-2">5</span>
					Pay Securely
				</h3>
				<p>
					Release payment only when you're satisfied with the completed work, with the option for
					milestone payments.
				</p>
			</div>
		</div>

		<div class="mt-8 flex justify-center">
			<button class="btn btn-primary btn-lg" onclick={() => navigateWithTransition('/dashboard')}>
				Go to Dashboard
			</button>
		</div>
	</div>
</OnboardingLayout>
