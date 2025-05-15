<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { CheckOnboardingStatusStore } from '$houdini';

	let { restartSetup }: { restartSetup: () => void } = $props();

	// Track if component should be mounted
	let shouldMount = $state(true);

	const inOnboardingCompleteStore = new CheckOnboardingStatusStore();

	// Completion status
	let isLoading = $state(true);
	let isComplete = $state(false);
	let missingFields = $state<string[]>([]);
	let error = $state('');

	// Handle restart setup click - destroy component first
	function handleRestartSetup() {
		// Set shouldMount to false to destroy component
		shouldMount = false;
		restartSetup();
	}

	onMount(async () => {
		try {
			const { data, errors } = await inOnboardingCompleteStore.fetch();

			if (errors) {
				error = errors.map((err) => err.message).join(', ');
				return;
			}

			isComplete = data?.IsOnboardingComplete.isComplete ?? false;
			missingFields = data?.IsOnboardingComplete.missingFields ?? [];
		} catch (err: unknown) {
			console.error('Onboarding completion failed:', err);
			error = err instanceof Error ? err.message : 'Onboarding completion failed';
		} finally {
			isLoading = false;
		}
	});
</script>

{#if shouldMount}
	<div class="card bg-base-100 w-full shadow-xl">
		<div class="card-body">
			{#if isLoading}
				<div class="flex flex-col items-center space-y-4 text-center">
					<span class="loading loading-spinner loading-lg"></span>
					<p class="text-base-content/70">Checking your onboarding status...</p>
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
					<h2 class="text-xl font-bold">Something went wrong</h2>
					<p class="text-base-content/70">{error}</p>
					<button class="btn btn-primary mt-4" onclick={handleRestartSetup}>Try Again</button>
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
					<h2 class="text-xl font-bold">Oops! Your profile is not complete</h2>

					{#if missingFields.length > 0}
						<div class="mt-2 w-full space-y-2 text-start">
							<p class="font-medium">Missing information:</p>
							<ul class="text-base-content/70 list-inside list-disc text-start text-sm">
								{#each missingFields as field}
									<li>{field}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<p class="text-base-content/70">
						Don't worry you can continue using BitTasker, and complete your onboarding process
						later.
						<br /> <br />
						Or you can restart the onboarding process.
					</p>
					<div class="mt-4 flex max-w-md flex-col items-center space-y-4">
						<button class="btn btn-primary w-full" onclick={handleRestartSetup}>
							Restart Setup
						</button>
						<button class="btn btn-secondary w-full" onclick={() => goto('/dashboard/find-tasks')}>
							Continue without completing
						</button>
					</div>
				</div>
			{:else}
				<div class="flex flex-col items-center space-y-4 text-center">
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
					<h2 class="text-xl font-bold">Your account is ready!</h2>
					<p class="text-base-content/70">
						You've successfully completed the onboarding process and your BitTasker account is now
						active.
					</p>
					<div class="mt-2 space-y-2">
						<p class="font-medium">What's next?</p>
						<ul class="text-base-content/70 list-inside list-disc text-start text-sm">
							<li>Browse available tasks or create your own</li>
							<li>Complete your profile to attract more clients</li>
							<li>Set up your payment preferences</li>
							<li>Explore the platform features</li>
						</ul>
					</div>
					<button class="btn btn-primary mt-6" onclick={() => goto('/dashboard/find-tasks')}>
						Find Tasks
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
