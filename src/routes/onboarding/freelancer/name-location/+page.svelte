<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { nameLocationSchema } from '$lib/validation/onboardingSchemas';
	import { ZodError } from 'zod';

	let firstName = $state('');
	let lastName = $state('');
	let location = $state('');
	let errors: Record<string, string> = $state({});

	onMount(() => {
		// Get data from store
		const unsubscribe = onboardingStore.subscribe((data) => {
			firstName = data.firstName || '';
			lastName = data.lastName || '';
			location = data.location || '';
		});

		return unsubscribe;
	});

	function validateForm() {
		errors = {};

		try {
			nameLocationSchema.parse({ firstName, lastName, location });
			return true;
		} catch (error) {
			if (error instanceof ZodError) {
				error.errors.forEach((err) => {
					errors[err.path[0]] = err.message;
				});
			}
			return false;
		}
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (validateForm()) {
			onboardingStore.updateFields({ firstName, lastName, location });
			navigateWithTransition('/onboarding/freelancer/about');
		}
	}
</script>

<svelte:head>
	<title>Your Information | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Tell us about yourself"
	subtitle="Let's personalize your profile with some basic information."
	step={4}
	totalSteps={5}
>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="grid gap-4 md:grid-cols-2">
			<div class="form-control">
				<label for="firstName" class="label">
					<span class="label-text">First Name</span>
				</label>
				<input
					type="text"
					id="firstName"
					bind:value={firstName}
					class="input input-bordered w-full {errors.firstName ? 'input-error' : ''}"
					placeholder="John"
					required
				/>
				{#if errors.firstName}
					<label class="label">
						<span class="label-text-alt text-error">{errors.firstName}</span>
					</label>
				{/if}
			</div>

			<div class="form-control">
				<label for="lastName" class="label">
					<span class="label-text">Last Name</span>
				</label>
				<input
					type="text"
					id="lastName"
					bind:value={lastName}
					class="input input-bordered w-full {errors.lastName ? 'input-error' : ''}"
					placeholder="Doe"
					required
				/>
				{#if errors.lastName}
					<label class="label">
						<span class="label-text-alt text-error">{errors.lastName}</span>
					</label>
				{/if}
			</div>
		</div>

		<div class="form-control">
			<label for="location" class="label">
				<span class="label-text">Location</span>
			</label>
			<input
				type="text"
				id="location"
				bind:value={location}
				class="input input-bordered w-full {errors.location ? 'input-error' : ''}"
				placeholder="New York, USA"
				required
			/>
			{#if errors.location}
				<label class="label">
					<span class="label-text-alt text-error">{errors.location}</span>
				</label>
			{/if}
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/account-create')}
			>
				Back
			</button>

			<button type="submit" class="btn btn-primary"> Continue </button>
		</div>
	</form>
</OnboardingLayout>
