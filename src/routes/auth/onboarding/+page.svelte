<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { autoLoadTranslations } from '$lib/i18n/routeTranslations';
	import DisplayNameSetup from '$lib/components/onboarding/DisplayNameSetup.svelte';
	import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';

	let { data } = $props();

	const totalSteps = 5;
	// Step order: 0 Display name, 1 Passkey, 2 Profile, 3 Recovery, 4 Complete
	let currentStep = $state(data?.currentStep ?? 0);
	let direction = $state<'forward' | 'backward'>('forward');

	let onboardingData = $state({
		displayName: '',
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

	const prevStep = async () => {
		if (currentStep > 0) {
			currentStep--;
			direction = 'backward';
		} else {
			await goto('/auth/signup');
		}
	};

	const restartSetup = () => {
		// Restart from Profile step (step 2); display name and passkey are already done
		currentStep = 2;
		direction = 'backward';
	};

	const handleDisplayNameChange = (displayName: string) => {
		onboardingData.displayName = displayName;
	};
</script>

<div class="flex w-full grow flex-col items-center px-4 md:py-8" use:autoLoadTranslations>
	<div class="w-full max-w-4xl">
		<div class="mb-4 flex flex-col items-center md:mb-8">
			<Logo
				class="mx-auto mt-4 mb-4 block max-h-[60px] w-full max-w-xs sm:max-h-none sm:max-w-sm md:max-w-md"
			/>
			<p>{$t('onboarding_auth.title')}</p>

			<!-- Progress indicator -->
			<div class="w-full">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-primary text-sm font-medium"
						>{$t('onboarding_auth.form.username_setup.step')}
						{currentStep + 1}
						{$t('onboarding_auth.form.username_setup.of')}
						{totalSteps}</span
					>
					<span class="text-base-content/70 text-sm"
						>{Math.round(((currentStep + 1) / totalSteps) * 100)}%</span
					>
				</div>
				<div class="bg-base-300 h-2 w-full rounded-full">
					<div
						class="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
						style="width: {((currentStep + 1) / totalSteps) * 100}%"
					></div>
				</div>
			</div>
		</div>

		{#if currentStep === 0}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<DisplayNameSetup
					{nextStep}
					{currentStep}
					{totalSteps}
					onDisplayNameChange={handleDisplayNameChange}
				/>
			</div>
		{:else if currentStep === 1}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<PasskeySetup {nextStep} {prevStep} {currentStep} {totalSteps} userData={onboardingData} />
			</div>
		{:else if currentStep === 2}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<ProfileSetup {nextStep} {prevStep} {currentStep} {totalSteps} />
			</div>
		{:else if currentStep === 3}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<RecoverySetup {nextStep} {prevStep} {currentStep} {totalSteps} />
			</div>
		{:else if currentStep === 4}
			<div in:fly={{ duration: 200, x: direction === 'forward' ? 20 : -20, easing: linear }}>
				<CompleteSetup {restartSetup} {currentStep} {totalSteps} />
			</div>
		{/if}
	</div>
</div>
