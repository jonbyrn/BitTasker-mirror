<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, untrack } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { autoLoadTranslations } from '$lib/i18n/routeTranslations';
	import { generateSecretKey, getPublicKey } from 'nostr-tools';
	import { nip19 } from 'nostr-tools';
	import { bytesToHex, hexToBytes } from '$lib/utils/helpers/encoding.js';
	import {
		clearOnboardingDraft,
		initialOnboardingState,
		readOnboardingDraft,
		writeOnboardingDraft
	} from '$lib/stores/onboarding-draft';
	import { resolveHandle } from '$lib/utils/helpers/usernameGenerator.js';
	import { applyNdkSignerFromNsec } from '$lib/nostr/ndk';
	import { deriveWalletFromNostr } from '$lib/utils/helpers/crypto';
	import { publishProfileMetadata } from '$lib/nostr/profile/metadata-publish';
	import { appStore } from '$lib/stores/app.store';
	import DisplayNameSetup from '$lib/components/onboarding/DisplayNameSetup.svelte';
	import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
	import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';
	import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
	import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';

	let { data } = $props();

	// Step order: 0 Display name, 1 Passkey, 2 Profile, 3 Recovery, 4 Complete
	const totalSteps = 5;

	// svelte-ignore state_referenced_locally
	const initial = initialOnboardingState(data?.currentStep, readOnboardingDraft());
	let currentStep = $state(initial.step);
	let direction = $state<'forward' | 'backward'>('forward');
	let isPublishing = $state(false);
	let publishError = $state('');
	let keepDraft = $state(true);

	const formData = $state({
		displayName: initial.displayName,
		username: initial.username,
		nsec: initial.nsec,
		npub: initial.npub
	});

	function rememberDraft() {
		if (!keepDraft) return;
		writeOnboardingDraft({
			step: currentStep,
			displayName: formData.displayName,
			username: formData.username,
			nsec: formData.nsec,
			npub: formData.npub
		});
	}

	function setDisplayName(value: string) {
		formData.displayName = value;
		rememberDraft();
	}

	$effect(() => {
		if (!keepDraft) return;
		const displayName = untrack(() => formData.displayName);
		writeOnboardingDraft({
			step: currentStep,
			displayName,
			username: formData.username,
			nsec: formData.nsec,
			npub: formData.npub
		});
	});

	onMount(() => {
		prefetchPasskeyChallenge();
		const nsec = formData.nsec;
		const npub = formData.npub;
		if (!nsec) return;
		void (async () => {
			try {
				const sk = hexToBytes(nsec);
				await applyNdkSignerFromNsec(sk);
				appStore.update((s) => ({
					...s,
					nostrKeys: { ...s.nostrKeys, nsec: sk, npub }
				}));
			} catch {
				// A bad draft must not throw while onboarding resumes.
			}
		})();
	});

	function finishOnboarding() {
		keepDraft = false;
		clearOnboardingDraft();
	}

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

					if (typeof window !== 'undefined' && '__PLAYWRIGHT_TEST__' in window) {
						const appNsec = nip19.nsecEncode(sk);
						const appMnemonic = await deriveWalletFromNostr(appNsec);
						window.localStorage.setItem('__E2E_NSEC__', appNsec);
						window.localStorage.setItem('__E2E_NPUB__', nip19.npubEncode(formData.npub));
						window.localStorage.setItem('__E2E_MNEMONIC__', appMnemonic);
					}

					// generate username from display name and npub
					formData.username = await resolveHandle(formData.displayName, formData.npub);
					rememberDraft();
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
			await goto(resolve('/auth/signup'));
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
			<section
				class="mb-6 w-full"
				data-testid="first-run-guide"
				aria-labelledby="first-run-guide-title"
			>
				<h2 id="first-run-guide-title" class="mb-3 text-center text-lg">
					{$t('onboarding_auth.guide.title')}
				</h2>
				<ol class="bt-guide">
					<li class="bt-guide-item" class:bt-guide-current={currentStep <= 1}>
						<span class="bt-guide-index">1</span>
						<div>
							<p class="font-semibold">{$t('onboarding_auth.guide.passkey_title')}</p>
							<p class="text-base-content/80 text-sm">{$t('onboarding_auth.guide.passkey_body')}</p>
						</div>
					</li>
					<li class="bt-guide-item" class:bt-guide-current={currentStep === 2 || currentStep === 3}>
						<span class="bt-guide-index">2</span>
						<div>
							<p class="font-semibold">{$t('onboarding_auth.guide.wallet_title')}</p>
							<p class="text-base-content/80 text-sm">{$t('onboarding_auth.guide.wallet_body')}</p>
						</div>
					</li>
					<li class="bt-guide-item" class:bt-guide-current={currentStep === 4}>
						<span class="bt-guide-index">3</span>
						<div>
							<p class="font-semibold">{$t('onboarding_auth.guide.task_title')}</p>
							<p class="text-base-content/80 text-sm">{$t('onboarding_auth.guide.task_body')}</p>
						</div>
					</li>
				</ol>
			</section>

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
					displayName={formData.displayName}
					onDisplayName={setDisplayName}
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
				<CompleteSetup onFinish={finishOnboarding} />
			</div>
		{/if}
	</div>
</div>
