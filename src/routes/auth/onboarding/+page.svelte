<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import UsernameSetup from '$lib/components/onboarding/UsernameSetup.svelte';
	import NostrKeyImport from '$lib/components/onboarding/NostrKeyImport.svelte';
	import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
	import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import LocationSetup from '$lib/components/onboarding/LocationSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';

	let { data } = $props();
	
	let currentStep = $state(data.currentStep ?? 0);
	let direction = $state<'forward' | 'backward'>('forward');
	const totalSteps = 7;

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
		// Only restart from ProfileSetup step (step 4)
		// The previous steps (username, nostr key, passkey) are required and shouldn't be repeated
		currentStep = 4;
		direction = 'backward';
	};

	// Callback functions for each step
	const handleUsernameChange = (username: string, isAvailable: boolean) => {
		onboardingData.username = username;
		onboardingData.usernameAvailable = isAvailable;
	};

	const handleNostrKeyChange = (nsec: string, hasKey: boolean) => {
		onboardingData.nsec = nsec;
		onboardingData.hasNostrKey = hasKey;
	};

	const handleRecoveryChange = (email: string, password: string, enabled: boolean) => {
		onboardingData.recoveryEmail = email;
		onboardingData.recoveryPassword = password;
		onboardingData.hasRecovery = enabled;
	};
</script>

<div class="flex w-full flex-grow flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<Logo class="w-auto" />
			<h1 class="my-4 text-center text-2xl font-bold">{$t('onboarding_auth.title')}</h1>

			<ul class="steps mx-auto w-full">
				<li
					data-content=""
					class="step {currentStep >= 0 ? 'step-primary' : 'step-neutral'} text-xs sm:text-sm"
				>
					{$t('onboarding_auth.steps.account')}
				</li>
				<li
					data-content=""
					class="step {currentStep >= 1 ? 'step-primary' : 'step-neutral'} text-xs sm:text-sm"
				>
					{$t('onboarding_auth.steps.profile')}
				</li>
				<li
					data-content=""
					class="step {currentStep >= 2 ? 'step-primary' : 'step-neutral'} text-xs sm:text-sm"
				>
					{$t('onboarding_auth.steps.location')}
				</li>
				<li
					data-content=""
					class="step {currentStep >= 3 ? 'step-primary' : 'step-neutral'} text-xs sm:text-sm"
				>
					{$t('onboarding_auth.steps.completed')}
				</li>
			</ul>
		</div>

		{#if currentStep === 0}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<UsernameSetup {nextStep} onUsernameChange={handleUsernameChange} />
			</div>
		{:else if currentStep === 1}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<NostrKeyImport {nextStep} {prevStep} onNostrKeyChange={handleNostrKeyChange} />
			</div>
		{:else if currentStep === 2}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<PasskeySetup {nextStep} {prevStep} userData={onboardingData} />
			</div>
		{:else if currentStep === 3}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<RecoverySetup {nextStep} {prevStep} onRecoveryChange={handleRecoveryChange} />
			</div>
		{:else if currentStep === 4}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<ProfileSetup {nextStep} {prevStep} />
			</div>
		{:else if currentStep === 5}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<LocationSetup {nextStep} {prevStep} />
			</div>
		{:else if currentStep === 6}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<CompleteSetup {restartSetup} />
			</div>
		{/if}
	</div>
</div>


