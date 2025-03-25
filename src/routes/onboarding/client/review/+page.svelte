<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { taskCategories } from '$lib/data/onboardingData';

	let userData = $state({
		accountType: '',
		email: '',
		firstName: '',
		lastName: '',
		location: '',
		about: '',
		taskCategories: []
	});

	let isSubmitting = $state(false);
	let submitSuccess = $state(false);
	let submitError = $state(false);
	// Get selected category names
	let selectedTaskCategories = $derived(
		userData.taskCategories
			.map((categoryId) => taskCategories.find((cat) => cat.id === categoryId))
			.filter((category): category is NonNullable<typeof category> => category !== undefined)
	);

	onMount(() => {
		// Get data from store
		const unsubscribe = onboardingStore.subscribe((data) => {
			userData = {
				accountType: data.accountType || '',
				email: data.email || '',
				firstName: data.firstName || '',
				lastName: data.lastName || '',
				location: data.location || '',
				about: data.about || '',
				taskCategories: data.taskCategories || []
			};
		});

		return unsubscribe;
	});

	async function handleSubmit() {
		isSubmitting = true;
		submitError = false;

		try {
			// Simulate API call with a delay
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Log the data to console (for demonstration)
			console.log('Submitting client profile:', userData);

			// Clear the onboarding data
			onboardingStore.clearData();

			submitSuccess = true;

			// Navigate to tutorial page
			setTimeout(() => {
				navigateWithTransition('/onboarding/client/tutorial');
			}, 500);
		} catch (error) {
			console.error('Error submitting profile:', error);
			submitError = true;
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Review Profile | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Review your profile"
	subtitle="Make sure everything is correct before we create your profile."
	step={5}
	totalSteps={5}
>
	<div class="space-y-8">
		<div class="space-y-4">
			<h3 class="flex justify-between text-lg font-semibold">
				<span>Personal Information</span>
				<button
					class="btn btn-sm btn-ghost text-primary"
					onclick={() => navigateWithTransition('/onboarding/client/name-location')}
				>
					Edit
				</button>
			</h3>

			<div class="grid gap-4 md:grid-cols-2">
				<div>
					<div class="text-base-content/70 text-sm">Name</div>
					<div>{userData.firstName} {userData.lastName}</div>
				</div>

				<div>
					<div class="text-base-content/70 text-sm">Location</div>
					<div>{userData.location}</div>
				</div>

				<div class="md:col-span-2">
					<div class="text-base-content/70 text-sm">Email</div>
					<div>{userData.email}</div>
				</div>
			</div>
		</div>

		<div class="divider"></div>

		<div class="space-y-4">
			<h3 class="flex justify-between text-lg font-semibold">
				<span>About Your Projects</span>
				<button
					class="btn btn-sm btn-ghost text-primary"
					onclick={() => navigateWithTransition('/onboarding/client/about')}
				>
					Edit
				</button>
			</h3>

			<textarea
				id="about"
				value={userData.about}
				class="textarea w-full h-40"
				disabled
			></textarea>
		</div>

		<div class="divider"></div>

		<div class="space-y-4">
			<h3 class="flex justify-between text-lg font-semibold">
				<span>Task Categories</span>
				<button
					class="btn btn-sm btn-ghost text-primary"
					onclick={() => navigateWithTransition('/onboarding/client/categories')}
				>
					Edit
				</button>
			</h3>

			<div class="space-y-3">
				{#each selectedTaskCategories as category}
					<div class="flex items-center gap-2">
						<span class="badge badge-primary">{category.name}</span>
						<span class="text-base-content/70 text-sm">{category.description}</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/client/categories')}
				disabled={isSubmitting}
			>
				Back
			</button>

			<button
				type="button"
				class="btn btn-primary"
				onclick={handleSubmit}
				disabled={isSubmitting || submitSuccess}
			>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-sm"></span>
					Submitting...
				{:else if submitSuccess}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
					Submitted
				{:else}
					Create Profile
				{/if}
			</button>
		</div>

		{#if submitError}
			<div class="alert alert-error mt-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>An error occurred while creating your profile. Please try again.</span>
			</div>
		{/if}
	</div>
</OnboardingLayout>
