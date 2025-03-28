<script lang="ts">
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';

	function handleImageError(event: Event) {
		const target = event.target as HTMLImageElement;
		target.src = 'https://placehold.co/300x300?text=Welcome';
	}
</script>

<svelte:head>
	<title>Welcome | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Welcome to our BitTasker!"
	subtitle="Connect with talented freelancers or find great clients for your skills."
	step={1}
	totalSteps={5}
>
	<div class="flex flex-col items-center">
		<div class="mb-8">
			<img
				src="/images/onboarding-welcome.svg"
				alt="Welcome to BitTasker"
				class="h-64 w-64"
				onerror={handleImageError}
			/>
		</div>

		<div class="mb-8 text-center">
			<h3 class="mb-2 text-lg font-semibold">Join our growing community</h3>
			<p class="text-base-content/70">
				Whether you're looking to hire top talent or showcase your skills to potential clients,
				we're here to help you succeed.
			</p>
		</div>

		<button
			class="btn btn-primary btn-lg w-full max-w-xs"
			onclick={() => navigateWithTransition('/onboarding/account-type')}
		>
			Get Started
		</button>
	</div>
</OnboardingLayout>
