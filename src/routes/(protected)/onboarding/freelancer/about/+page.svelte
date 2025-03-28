<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { freelancerAboutSchema } from '$lib/validation/onboardingSchemas';
	import { ZodError } from 'zod';

	let about = $state('');
	let errors: Record<string, string> = $state({});
	let charCount = $state(0);

	onMount(() => {
		// Get data from store
		const unsubscribe = onboardingStore.subscribe((data) => {
			about = data.about || '';
			charCount = about.length;
		});

		return unsubscribe;
	});

	function updateCharCount() {
		charCount = about.length;
	}

	function validateForm() {
		errors = {};

		try {
			freelancerAboutSchema.parse({ about });
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
			onboardingStore.updateField('about', about);
			navigateWithTransition('/onboarding/freelancer/skills');
		}
	}
</script>

<svelte:head>
	<title>About You | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Tell us about your skills and experience"
	subtitle="Help potential clients understand what makes you stand out."
	step={4}
	totalSteps={5}
>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="form-control">
			<label for="about" class="label">
				<span class="label-text">About You</span>
			</label>
			<textarea
				id="about"
				bind:value={about}
				oninput={updateCharCount}
				class="textarea textarea-bordered h-40 {errors.about ? 'textarea-error' : ''}"
				placeholder="Describe your skills, experience, and what makes you great to work with..."
				required
			></textarea>

			<div class="mt-2 flex justify-between">
				{#if errors.about}
					<label class="label">
						<span class="label-text-alt text-error">{errors.about}</span>
					</label>
				{:else}
					<span></span>
				{/if}
				<span class="text-sm {charCount < 50 ? 'text-error' : 'text-base-content/70'}">
					{charCount}/50 characters minimum
				</span>
			</div>
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/freelancer/name-location')}
			>
				Back
			</button>

			<button type="submit" class="btn btn-primary"> Continue </button>
		</div>
	</form>
</OnboardingLayout>
