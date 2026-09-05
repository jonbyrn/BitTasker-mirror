<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { autoLoadTranslations } from '$lib/i18n/routeTranslations';
	import { generateSecretKey, getPublicKey } from 'nostr-tools';
	import { bytesToHex } from '$lib/utils/helpers/encoding.js';
	import { resolveHandle } from '$lib/utils/helpers/usernameGenerator.js';
	import { applyNdkSignerFromNsec } from '$lib/nostr/ndk';
	import { publishProfileMetadata } from '$lib/nostr/profile/metadata-publish';
	import { appStore } from '$lib/stores/app.store';
	import DisplayNameSetup from '$lib/components/onboarding/DisplayNameSetup.svelte';
	import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
	import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';

	let { data } = $props();

	// Step order: 0 Display name, 1 Passkey, 2 Profile, 3 Recovery, 4 Complete
	const totalSteps = 5;

	// svelte-ignore state_referenced_locally
	let currentStep = $state(data.currentStep ?? 0);
	let direction = $state<'forward' | 'backward'>('forward');
	let isPublishing = $state(false);
	let publishError = $state('');

	const formData = $state({
		displayName: '',
		username: '',
		nsec: '',
		npub: ''
	});

	function profilePublishErrorMessage(err: unknown): string {
		if (err instanceof Error) {
			if (err.message === 'PROFILE_METADATA_VERIFY_TIMEOUT') {
				return $t('onboarding_auth.form.profile_publish.verify_timeout');
			}
			if (err.message === 'PROFILE_METADATA_PUBLISH_REJECTED') {
				return $t('onboarding_auth.form.profile_publish.relay_rejected');
			}
			return err.message;
		}
		return $t('onboarding_auth.form.profile_publish.failed');
	}

	const nextStep = async () => {
		if (currentStep === 0) {
			isPublishing = true;
			publishError = '';
			try {
				if (!formData.nsec) {
					const sk = generateSecretKey();
					formData.nsec = bytesToHex(sk);
					formData.npub = getPublicKey(sk);

					// generate username from display name and npub
					formData.username = await resolveHandle(formData.displayName, formData.npub);
					await applyNdkSignerFromNsec(sk);
					// Ensures ProfileSetup can recover the signer via syncNdkSignerFromAppStore if reached without the nsec prop
					appStore.update((s) => ({
						...s,
						nostrKeys: { ...s.nostrKeys, nsec: sk, npub: formData.npub }
					}));
				}

				const displayName = formData.displayName.trim();
				await publishProfileMetadata({ display_name: displayName }, {}, undefined, {
					requiredDisplayName: displayName
				});

				currentStep++;
				direction = 'forward';
			} catch (err) {
				publishError = profilePublishErrorMessage(err);
			} finally {
				isPublishing = false;
			}
			return;
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
				<DisplayNameSetup
					bind:displayName={formData.displayName}
					{nextStep}
					{isPublishing}
					{publishError}
				/>
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
				<ProfileSetup
					{nextStep}
					{prevStep}
					mode={formData.displayName.trim() ? 'signup_enrichment' : 'nsec_first_publish'}
					displayName={formData.displayName}
					npub={formData.npub}
					nsec={formData.nsec}
				/>
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
