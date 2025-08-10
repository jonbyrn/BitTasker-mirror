<script lang="ts">
	import type { LocationInput } from '$houdini';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { subscribeToProfileUpdates } from '$lib/nostr/profile';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { bytesToHex } from '@noble/hashes/utils';
	import nip44 from '$lib/nostr/nip44';
	import { t } from 'svelte-i18n';

	let { restartSetup }: { restartSetup: () => void } = $props();

	// Completion status
	let isLoading = $state(true);
	let isRedirecting = $state(false);
	let isContinueLoading = $state(false);
	let isComplete = $state(false);
	let missingFields = $state<string[]>([]);
	let error = $state('');
	let cleanup: (() => void) | null = null;

	// Profile data
	let profile = $state({
		displayName: '',
		professionalTitle: '',
		about: '',
		picture: null,
		location: null as LocationInput | null
	});

	// Handle restart setup click - destroy component first
	function handleRestartSetup() {
		restartSetup();
	}

	function checkCompletionStatus() {
		const missing: string[] = [];

		if (!profile.displayName) missing.push($t('onboarding_auth.form.display_name_field'));
		if (!profile.professionalTitle) missing.push($t('onboarding_auth.form.professional_title_field'));
		if (!profile.about) missing.push($t('onboarding_auth.form.about_field'));
		if (!profile.picture) missing.push($t('onboarding_auth.form.profile_picture_field'));
		if (!profile.location || !profile.location?.locationLoaded) missing.push($t('onboarding_auth.form.location_field'));

		missingFields = missing;
		isComplete = missing.length === 0;
		isLoading = false;
	}

	onMount(async () => {
		// Subscribe to profile metadata and location updates
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				isLoading = true;
				try {
					if (event.kind === 0) {
						// Handle profile metadata
						const metadata = JSON.parse(event.content);
						profile.displayName =
							metadata.display_name || metadata.displayName || metadata.name || '';
						profile.professionalTitle = metadata.professionalTitle || '';
						profile.about = metadata.about || '';
						profile.picture = metadata.picture || '';
						checkCompletionStatus();
					} else if (
						event.kind === 30005 &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'location')
					) {
						// Handle location data
						try {
							const keyPair = await getNostrKeyPair();
							const nsec = bytesToHex(keyPair.nsec);
							const conversationKey = await nip44.getConversationKey(nsec, keyPair.npub);
							const decryptedContent = await nip44.decrypt(event.content, conversationKey);

							const locationData = JSON.parse(decryptedContent);
							profile.location = locationData;
							checkCompletionStatus();
						} catch (err) {
							console.error('Failed to parse location data:', err);
						}
					}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = $t('onboarding_auth.form.failed_process_profile_update');
				} finally {
					isLoading = false;
				}
			},
			{
				0: null, // Kind 0 for profile metadata
				30005: { d: 'location' } // Kind 30005 for location data
			}
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		{#if isLoading}
			<div class="flex min-h-96 flex-col items-center justify-center space-y-4 text-center">
				<div>
					<span class="loading loading-spinner loading-lg"></span>
					<p class="text-base-content/70">{$t('onboarding_auth.form.checking_your_onboarding_status')}</p>
				</div>
			</div>
		{:else if error}
			<div class="flex flex-col items-center space-y-4 text-center">
				<div class="text-error mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-bold">{$t('onboarding_auth.form.something_went_wrong')}</h2>
				<p class="text-base-content/70">{error}</p>
				<button class="btn btn-primary mt-4" onclick={handleRestartSetup}>{$t('onboarding_auth.form.try_again')}</button>
			</div>
		{:else if !isComplete}
			<div class="flex flex-col items-center space-y-4 text-center">
				<div class="text-error mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-bold">{$t('onboarding_auth.form.oops_your_profile_is_not_complete')}</h2>

				{#if missingFields.length > 0}
					<div class="mt-2 w-full space-y-2 text-start">
						<p class="font-medium">{$t('onboarding_auth.form.missing_information')}:</p>
						<ul class="text-base-content/70 list-inside list-disc text-start text-sm">
							{#each missingFields as field}
								<li>{field}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<p class="text-base-content/70">
					{$t('onboarding_auth.form.dont_worry_you_can_continue_using_bittasker_and_complete_your_onboarding_process_later')}
					<br /> <br />
					{$t('onboarding_auth.form.or_you_can_restart_the_onboarding_process')}
				</p>
				<div class="mt-4 flex max-w-md flex-col items-center space-y-4">
					<button class="btn btn-primary w-full" onclick={handleRestartSetup}>
						{$t('onboarding_auth.form.restart_setup')}
					</button>
					<button 
						class="btn btn-secondary w-full" 
						onclick={() => {
							isContinueLoading = true;
							goto('/dashboard/find-tasks').finally(() => {
								isContinueLoading = false;
							});
						}}
						disabled={isContinueLoading}
					>
						{#if isContinueLoading}
							<span class="loading loading-spinner loading-sm"></span>
							Loading...
						{:else}
							Continue without completing
						{/if}
					<button class="btn btn-secondary w-full" onclick={() => goto('/dashboard/find-tasks')}>
						{$t('onboarding_auth.form.continue_without_completing')}
					</button>
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center space-y-4 text-center">
				<!-- Educational Header -->
				<div class="education-header mb-6 text-center">
					<div class="step-indicator text-sm font-medium text-primary mb-2">Step 7 of 7</div>
					<h2 class="step-title text-2xl font-bold mb-3">
						<span class="mr-2">🎉</span>
						Welcome to BitTasker!
					</h2>
					<p class="step-description text-base-content/70 mb-6">
						Your account is ready! You're now part of the Bitcoin-native task marketplace.
					</p>

					<!-- Features List -->
					<div class="features-list space-y-2 mb-6">
						<div class="feature-item flex items-center justify-start gap-2 text-sm">
							<span>✅</span>
							<span><strong>Decentralized</strong> — your data, your control</span>
						</div>
						<div class="feature-item flex items-center justify-start gap-2 text-sm">
							<span>✅</span>
							<span><strong>Bitcoin-native</strong> — earn and pay in Bitcoin</span>
						</div>
						<div class="feature-item flex items-center justify-start gap-2 text-sm">
							<span>✅</span>
							<span><strong>Secure</strong> — Nostr protocol protection</span>
						</div>
						<div class="feature-item flex items-center justify-start gap-2 text-sm">
							<span>✅</span>
							<span><strong>Global</strong> — connect with users worldwide</span>
						</div>
					</div>
				</div>

				<div class="text-success mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				
				<div class="mt-4 space-y-2">
					<p class="font-medium">What's next?</p>
					<ul class="text-base-content/70 list-inside list-disc text-start text-sm space-y-1">
						<li>Browse available tasks or create your own</li>
						<li>Complete your profile to attract more clients</li>
						<li>Set up your payment preferences</li>
						<li>Explore the platform features</li>
					</ul>
				</div>
				<button
					class="btn btn-primary mt-6 min-w-10"
					onclick={() => {
						isRedirecting = true;
						goto('/dashboard/find-tasks').finally(() => {
							isRedirecting = false;
						});
					}}
				>
					{#if isRedirecting}
						<span class="loading loading-spinner loading-sm"></span>
						Loading...
					{:else}
						🚀 Start Exploring
					{/if}
				</button>
			</div>
		{/if}
	</div>
</div>
