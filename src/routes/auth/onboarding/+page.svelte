<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { autoLoadTranslations } from '$lib/i18n/routeTranslations';
	import UsernameSetup from '$lib/components/onboarding/UsernameSetup.svelte';
	import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
	import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import LocationSetup from '$lib/components/onboarding/LocationSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';

	let { data } = $props();
	
	const totalSteps = 6;

	let currentStep = $state(data.currentStep ?? 0);
	let direction = $state<'forward' | 'backward'>('forward');

	// Onboarding state management
	let onboardingData = $state({
		username: '',
		usernameAvailable: false,
		nsec: '',
		hasNostrKey: false,
		recoveryEmail: '',
		recoveryPassword: '',
		hasRecovery: false
	});

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
		// Only restart from ProfileSetup step (step 3 now, was step 4)
		// The previous steps (username, passkey) are required and shouldn't be repeated
		currentStep = 3;
		direction = 'backward';
	};

	// Callback functions for each step
	const handleUsernameChange = (username: string, isAvailable: boolean) => {
		onboardingData.username = username;
		onboardingData.usernameAvailable = isAvailable;
	};
</script>

<div class="flex w-full flex-grow flex-col items-center px-4 py-8" use:autoLoadTranslations>
	<div class="w-full max-w-4xl">
		<div class="mb-8 flex flex-col items-center">
			<Logo />
			<h3 class="my-2">{$t('onboarding_auth.title')}</h3>

			<!-- Progress indicator -->
			<div class="w-full">
				<div class="flex items-center justify-between mb-2">
					<span class="text-sm font-medium text-primary">{$t('onboarding_auth.form.username_setup.step')} {currentStep + 1} {$t('onboarding_auth.form.username_setup.of')} {totalSteps}</span>
					<span class="text-sm text-base-content/70">{Math.round(((currentStep + 1) / totalSteps) * 100)}%</span>
				</div>
				<div class="w-full bg-base-300 rounded-full h-2">
					<div 
						class="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
						style="width: {((currentStep + 1) / totalSteps) * 100}%"
					></div>
				</div>
			</div>
		</div>

		{#if currentStep === 0}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<UsernameSetup {nextStep} {currentStep} {totalSteps} onUsernameChange={handleUsernameChange} />
			</div>
		{:else if currentStep === 1}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<PasskeySetup {nextStep} {prevStep} {currentStep} {totalSteps} userData={onboardingData} />
			</div>
		{:else if currentStep === 2}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<RecoverySetup {nextStep} {prevStep} {currentStep} {totalSteps} />
			</div>
		{:else if currentStep === 3}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<ProfileSetup {nextStep} {prevStep} {currentStep} {totalSteps} />
			</div>
		{:else if currentStep === 4}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<LocationSetup {nextStep} {prevStep} {currentStep} {totalSteps} />
			</div>
		{:else if currentStep === 5}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<CompleteSetup {restartSetup} {currentStep} {totalSteps} />
			</div>
		{/if}
	</div>
</div>