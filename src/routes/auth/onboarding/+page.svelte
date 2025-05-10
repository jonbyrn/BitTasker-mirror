<script lang="ts">
	import { goto } from '$app/navigation';
	import AccountSetup from '$lib/components/onboarding/AccountSetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import LocationSetup from '$lib/components/onboarding/LocationSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';

	let currentStep = $state(0);
</script>

<div class="flex w-full flex-grow flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-16 w-auto" />
			<h1 class="my-4 text-center text-2xl font-bold">Account Setup</h1>

			<ul class="steps mx-auto w-full">
				<li
					data-content={currentStep > 0 ? '✓' : '●'}
					class="step {currentStep >= 0 ? 'step-primary' : 'step-neutral'}"
				>
					Account
				</li>
				<li
					data-content={currentStep > 1 ? '✓' : '●'}
					class="step {currentStep >= 1 ? 'step-primary' : 'step-neutral'}"
				>
					Profile
				</li>
				<li
					data-content={currentStep > 2 ? '✓' : '●'}
					class="step {currentStep >= 2 ? 'step-primary' : 'step-neutral'}"
				>
					Location
				</li>
				<li
					data-content={currentStep > 3 ? '✓' : '●'}
					class="step {currentStep >= 3 ? 'step-primary' : 'step-neutral'}"
				>
					Completed
				</li>
			</ul>
		</div>

		{#if currentStep === 0}
			<AccountSetup nextStep={() => (currentStep = 1)} prevStep={() => goto('/auth/signup')} />
		{:else if currentStep === 1}
			<ProfileSetup nextStep={() => (currentStep = 2)} prevStep={() => (currentStep = 0)} />
		{:else if currentStep === 2}
			<LocationSetup nextStep={() => (currentStep = 3)} prevStep={() => (currentStep = 1)} />
		{:else if currentStep === 3}
			<CompleteSetup />
		{/if}
	</div>
</div>
