<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { subscribeToProfileUpdates } from '$lib/nostr/profile';

	let {
		restartSetup,
		currentStep: _currentStep,
		totalSteps: _totalSteps
	}: {
		restartSetup: () => void;
		currentStep: number;
		totalSteps: number;
	} = $props();
	void _currentStep;
	void _totalSteps;

	// Completion status
	let isLoading = $state(true);
	let isRedirecting = $state(false);
	let error = $state('');
	let cleanup: (() => void) | null = null;

	// Profile data (metadata only; location is no longer set during onboarding)
	let profile = $state({
		displayName: '',
		professionalTitle: '',
		about: '',
		picture: null
	});

	// Handle restart setup click - destroy component first
	function handleRestartSetup() {
		restartSetup();
	}

	function doneLoading() {
		isLoading = false;
	}

	onMount(async () => {
		// Subscribe to profile metadata (kind 0) to know when onboarding data is ready
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				isLoading = true;
				try {
					if (event.kind === 0) {
						const metadata = JSON.parse(event.content);
						profile.displayName =
							metadata.display_name || metadata.displayName || metadata.name || '';
						profile.professionalTitle = metadata.professionalTitle || '';
						profile.about = metadata.about || '';
						profile.picture = metadata.picture || '';
						doneLoading();
					}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = $t('onboarding_auth.form.failed_process_profile_update');
				} finally {
					isLoading = false;
				}
			},
			{ 0: null }
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-complete">
	<div class="card-body space-y-2">
		{#if isLoading}
			<div class="flex min-h-96 flex-col items-center justify-center space-y-2 text-center">
				<div>
					<span class="loading loading-spinner loading-lg"></span>
					<p class="text-base-content/70">
						{$t('onboarding_auth.form.checking_your_onboarding_status')}
					</p>
				</div>
			</div>
		{:else if error}
			<div class="items-center space-y-2 text-center">
				<div class="text-error">
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
				<button class="btn btn-primary" onclick={handleRestartSetup}
					>{$t('onboarding_auth.form.try_again')}</button
				>
			</div>
		{:else}
			<div class="mx-auto w-full items-center space-y-2 text-center">
				<!-- Educational Header (aligned with other onboarding screens) -->
				<div class="education-header text-center">
					<div class="text-success">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mx-auto h-16 w-16"
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
					<h4 class="step-title">{$t('onboarding_auth.form.complete_setup.welcome')}</h4>

					<p class="text-primary text-base md:text-lg">
						{$t('onboarding_auth.form.complete_setup.jump_in')}
					</p>
				</div>

				<button
					class="btn btn-primary min-w-10"
					onclick={() => {
						isRedirecting = true;
						goto('/dashboard').finally(() => {
							isRedirecting = false;
						});
					}}
				>
					{#if isRedirecting}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('onboarding_auth.form.complete_setup.loading')}
					{:else}
						{$t('onboarding_auth.form.complete_setup.start_tasking')}
					{/if}
				</button>
			</div>
		{/if}
	</div>
</div>
