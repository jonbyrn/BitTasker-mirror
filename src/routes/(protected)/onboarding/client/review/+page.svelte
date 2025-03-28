<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { taskCategories } from '$lib/data/onboardingData';
	import { goto } from '$app/navigation';
	import { authService, ApiError } from '$lib/api';
	import type { OnboardingRequest, UserLocation } from '$lib/api';

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
	let errorMessage = $state('');

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

	/**
	 * Parse location string into structured location object
	 */
	function parseLocation(locationString: string): UserLocation {
		// Parse the location - it's in the format "City, State, Country"
		const parts = locationString.split(',').map((part) => part.trim());

		return {
			addressLine1: '', // Required fields
			city: parts[0] || '',
			state: parts[1] || '',
			country: parts[2] || 'United States', // Default to US
			postalCode: '',
			latitude: 0,
			longitude: 0
		};
	}

	async function handleSubmit() {
		isSubmitting = true;
		submitError = false;
		errorMessage = '';

		try {
			// Format data for API according to documentation
			const onboardingData: OnboardingRequest = {
				userType: userData.accountType.toUpperCase() as any, // Convert to uppercase to match API expectations
				userInfo: {
					name: `${userData.firstName} ${userData.lastName}`.trim(),
					email: userData.email
				},
				location: parseLocation(userData.location),
				profile: {
					about: userData.about,
					categories: userData.taskCategories
				}
			};

			// Make the API call using our auth service
			const response = await authService.completeOnboarding(onboardingData);

			console.log('User profile created:', response);

			// Clear onboarding data
			onboardingStore.clearData();

			// Remove nostrKeys from localStorage is handled by the service on logout

			submitSuccess = true;

			// Navigate to dashboard instead of tutorial
			setTimeout(() => {
				goto('/dashboard'); // Using goto instead of navigateWithTransition for a full page refresh
			}, 1000);
		} catch (error) {
			console.error('Error submitting profile:', error);
			submitError = true;

			// Extract error message
			if (error instanceof ApiError) {
				errorMessage = error.message;
			} else if (error instanceof Error) {
				errorMessage = error.message;
			} else {
				errorMessage = 'An unknown error occurred';
			}
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

			<textarea id="about" value={userData.about} class="textarea h-40 w-full" disabled></textarea>
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
					Success! Redirecting...
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
				<span>
					{errorMessage || 'An error occurred while creating your profile. Please try again.'}
				</span>
			</div>
		{/if}
	</div>
</OnboardingLayout>
