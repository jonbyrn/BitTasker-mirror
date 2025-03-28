<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { skillCategories } from '$lib/data/onboardingData';

	let userData = $state({
		accountType: '',
		email: '',
		firstName: '',
		lastName: '',
		location: '',
		about: '',
		skillCategories: [],
		skills: [],
		customSkills: ''
	});

	let isSubmitting = $state(false);
	let submitSuccess = $state(false);
	let submitError = $state(false);
	// Get selected skill category names
	let categoryNames = $derived(userData.skillCategories
		.map((categoryId) => {
			const category = skillCategories.find((cat) => cat.id === categoryId);
			return category ? category.name : '';
		})
		.filter(Boolean));
	// Get all skills names including custom skills
	let allSkills = $derived([
		...userData.skills,
		...(userData.customSkills ? userData.customSkills.split(',').map((s) => s.trim()) : [])
	].filter(Boolean));

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
				skillCategories: data.skillCategories || [],
				skills: data.skills || [],
				customSkills: data.customSkills || ''
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
			console.log('Submitting freelancer profile:', userData);

			// Clear the onboarding data
			onboardingStore.clearData();

			submitSuccess = true;

			// Navigate to tutorial page
			setTimeout(() => {
				navigateWithTransition('/onboarding/freelancer/tutorial');
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
					onclick={() => navigateWithTransition('/onboarding/freelancer/name-location')}
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
				<span>About You</span>
				<button
					class="btn btn-sm btn-ghost text-primary"
					onclick={() => navigateWithTransition('/onboarding/freelancer/about')}
				>
					Edit
				</button>
			</h3>

			<p class="whitespace-pre-line">{userData.about}</p>
		</div>

		<div class="divider"></div>

		<div class="space-y-4">
			<h3 class="flex justify-between text-lg font-semibold">
				<span>Skills</span>
				<button
					class="btn btn-sm btn-ghost text-primary"
					onclick={() => navigateWithTransition('/onboarding/freelancer/skills')}
				>
					Edit
				</button>
			</h3>

			<div>
				<div class="text-base-content/70 mb-2 text-sm">Skill Categories</div>
				<div class="flex flex-wrap gap-2">
					{#each categoryNames as category}
						<span class="badge badge-outline">{category}</span>
					{/each}
				</div>
			</div>

			<div>
				<div class="text-base-content/70 mb-2 text-sm">Skills</div>
				<div class="flex flex-wrap gap-2">
					{#each allSkills as skill}
						<span class="badge badge-primary badge-outline">{skill}</span>
					{/each}
				</div>
			</div>
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/freelancer/skills')}
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
