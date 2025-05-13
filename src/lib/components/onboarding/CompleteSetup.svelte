<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { IsOnboardingCompleteStore } from '$houdini';

	let { restartSetup }: { restartSetup: () => void } = $props();

	const inOnboardingCompleteStore = new IsOnboardingCompleteStore();

	// Completion status
	let isLoading = $state(true);
	let isComplete = $state(false);
	let error = $state('');

	onMount(async () => {
		try {
			const { data } = await inOnboardingCompleteStore.fetch();
			isComplete = data?.me.onboardingComplete ?? false;
		} catch (err: unknown) {
			console.error('Onboarding completion failed:', err);
			error = err instanceof Error ? err.message : 'Onboarding completion failed';
		} finally {
			isLoading = false;
		}
	});
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		{#if !isComplete}
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
				<h2 class="text-xl font-bold">Oops! Something went wrong</h2>
				<p class="text-base-content/70">{error}</p>
				<button class="btn btn-primary mt-4" onclick={restartSetup}> Restart Setup </button>
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
					Go to Dashboard
				</button>
			</div>
		{/if}
	</div>
</div>
