<script lang="ts">
	import { goto } from '$app/navigation';
	import AccountSetup from '$lib/components/onboarding/AccountSetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import LocationSetup from '$lib/components/onboarding/LocationSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';
	import { onMount } from 'svelte';
	import authService from '$lib/api/services/auth.service';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { Preferences } from '@capacitor/preferences';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	let currentStep = $state(0);
	let direction = $state<'forward' | 'backward'>('forward');

	const nextStep = () => {
		currentStep++;
		direction = 'forward';
	};

	const prevStep = () => {
		if (currentStep > 0) {
			currentStep--;
			direction = 'backward';
		} else {
			goto('/auth/signup');
		}
	};

	const restartSetup = () => {
		currentStep = 0;
		direction = 'backward';
	};
</script>

<div class="flex w-full flex-grow flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-16 w-auto" />
			<h1 class="my-4 text-center text-2xl font-bold">Account Setup</h1>

			<ul class="steps mx-auto w-full">
				<li data-content="" class="step {currentStep >= 0 ? 'step-primary' : 'step-neutral'}">
					Account
				</li>
				<li data-content="" class="step {currentStep >= 1 ? 'step-primary' : 'step-neutral'}">
					Profile
				</li>
				<li data-content="" class="step {currentStep >= 2 ? 'step-primary' : 'step-neutral'}">
					Location
				</li>
				<li data-content="" class="step {currentStep >= 3 ? 'step-primary' : 'step-neutral'}">
					Completed
				</li>
			</ul>
		</div>

		{#if currentStep === 0}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<AccountSetup {nextStep} {prevStep} />
			</div>
		{:else if currentStep === 1}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<ProfileSetup {nextStep} {prevStep} />
			</div>
		{:else if currentStep === 2}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<LocationSetup {nextStep} {prevStep} />
			</div>
		{:else if currentStep === 3}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<CompleteSetup {restartSetup} />
			</div>
		{/if}
	</div>
</div>

<style>
	.steps .step:before {
		background-color: var(--color-neutral);
		color: var(--color-neutral);
	}

	.steps .step.step-primary:before {
		background-color: var(--color-primary);
		color: var(--color-primary-content);
	}
</style>
