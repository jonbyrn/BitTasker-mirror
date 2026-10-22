<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { autoLoadTranslations } from '$lib/i18n/routeTranslations';
	import { generateSecretKey, getPublicKey } from 'nostr-tools';
	import { bytesToHex } from '$lib/utils/helpers/encoding.js';
	import { browser } from '$app/environment';
	import { resolveHandle } from '$lib/utils/helpers/usernameGenerator.js';
	import {
		clearOnboardingDraft,
		readOnboardingDraft,
		saveOnboardingDraft
	} from '$lib/utils/helpers/onboarding-draft';
	import DisplayNameSetup from '$lib/components/onboarding/DisplayNameSetup.svelte';
	import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
	import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';

	let { data } = $props();

	// Step order: 0 Display name, 1 Passkey, 2 Profile, 3 Recovery, 4 Complete
	const totalSteps = 5;

	const saved = browser ? readOnboardingDraft() : null;
	// A stored access token resumes at the profile step (staging). A refresh
	// before the account exists restores the draft from this tab.
	// svelte-ignore state_referenced_locally
	let currentStep = $state(
		typeof data.currentStep === 'number' ? data.currentStep : (saved?.step ?? 0)
	);
	let direction = $state<'forward' | 'backward'>('forward');
	const formData = $state({
		displayName: saved?.displayName ?? '',
		username: saved?.username ?? '',
		nsec: saved?.nsec ?? '',
		npub: saved?.npub ?? ''
	});

	$effect(() => {
		if (!browser) return;
		if (currentStep >= totalSteps - 1) {
			clearOnboardingDraft();
			return;
		}
		saveOnboardingDraft({
			step: currentStep,
			displayName: formData.displayName,
			username: formData.username,
			nsec: formData.nsec,
			npub: formData.npub
		});
	});

	const nextStep = async () => {
		if (currentStep === 0) {
			// Generate key pair
			const sk = generateSecretKey();
			formData.nsec = bytesToHex(sk);
			formData.npub = getPublicKey(sk);

			// generate username from display name
			formData.username = await resolveHandle(formData.displayName, formData.npub);
		}

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
			<div
				in:fly={{
					duration: 200,
					x: direction === 'forward' ? 20 : -20,
					easing: linear,
					delay: 100
				}}
			>
				<DisplayNameSetup bind:displayName={formData.displayName} {nextStep} />
			</div>
		{:else if currentStep === 1}
			<div
				in:fly={{
					duration: 200,
					x: direction === 'forward' ? 20 : -20,
					easing: linear,
					delay: 100
				}}
			>
				<PasskeySetup
					{nextStep}
					{prevStep}
					username={formData.username}
					npub={formData.npub}
					nsec={formData.nsec}
				/>
			</div>
		{:else if currentStep === 2}
			<div
				in:fly={{
					duration: 200,
					x: direction === 'forward' ? 20 : -20,
					easing: linear,
					delay: 100
				}}
			>
				<ProfileSetup {nextStep} {prevStep} displayName={formData.displayName} />
			</div>
		{:else if currentStep === 3}
			<div
				in:fly={{
					duration: 200,
					x: direction === 'forward' ? 20 : -20,
					easing: linear,
					delay: 100
				}}
			>
				<RecoverySetup {nextStep} {prevStep} />
			</div>
		{:else if currentStep === 4}
			<div
				in:fly={{
					duration: 200,
					x: direction === 'forward' ? 20 : -20,
					easing: linear,
					delay: 100
				}}
			>
				<CompleteSetup />
			</div>
		{/if}
	</div>
</div>
