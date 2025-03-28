<script lang="ts">
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';

	function selectAccountType(type: 'freelancer' | 'client') {
		onboardingStore.updateField('accountType', type);
		navigateWithTransition('/onboarding/account-create');
	}
</script>

<svelte:head>
	<title>Select Account Type | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="What brings you here?"
	subtitle="Select the type of account you want to create."
	step={2}
	totalSteps={5}
>
	<div class="grid gap-6 md:grid-cols-2">
		<button
			class="card bg-base-100 hover:bg-primary/5 active:bg-primary/5 border-base-300 hover:border-primary active:border-primary cursor-pointer border-2 transition-colors"
			onclick={() => selectAccountType('freelancer')}
			data-view-transition="freelancer-card"
		>
			<div class="card-body">
				<div class="flex flex-col items-center text-center">
					<div class="bg-primary/10 mb-4 rounded-full p-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
							/>
						</svg>
					</div>
					<h3 class="card-title">I'm a Freelancer</h3>
					<p class="text-base-content/70">
						I want to offer my services and find work opportunities.
					</p>
				</div>
			</div>
		</button>

		<button
			class="card bg-base-100 hover:bg-primary/5 active:bg-primary/5 border-base-300 hover:border-primary active:border-primary cursor-pointer border-2 transition-colors"
			onclick={() => selectAccountType('client')}
			data-view-transition="client-card"
		>
			<div class="card-body">
				<div class="flex flex-col items-center text-center">
					<div class="bg-primary/10 mb-4 rounded-full p-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
							/>
						</svg>
					</div>
					<h3 class="card-title">I'm a Client</h3>
					<p class="text-base-content/70">I want to hire talented freelancers for my projects.</p>
				</div>
			</div>
		</button>
	</div>

	<div class="mt-6 flex justify-between">
		<button class="btn btn-outline" onclick={() => navigateWithTransition('/onboarding')}>
			Back
		</button>
	</div>
</OnboardingLayout>
