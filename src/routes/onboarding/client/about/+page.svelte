<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { clientAboutSchema } from '$lib/validation/onboardingSchemas';
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
			clientAboutSchema.parse({ about });
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
			navigateWithTransition('/onboarding/client/categories');
		}
	}
</script>

<svelte:head>
	<title>About Your Project | Freelance Marketplace</title>
</svelte:head>

<OnboardingLayout
	title="Tell us about your project needs"
	subtitle="Help freelancers understand what kind of projects you typically need help with."
	step={4}
	totalSteps={5}
>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="form-control flex flex-col gap-2">
			<label for="about" class="label">
				<span class="label-text">About Your Projects</span>
			</label>
			<textarea
				id="about"
				bind:value={about}
				oninput={updateCharCount}
				class="textarea textarea-bordered w-full h-40 {errors.about ? 'textarea-error' : ''}"
				placeholder="Describe the types of projects you need help with, your typical requirements, and what you value most in freelancers..."
				required
			></textarea>

			<div class="mt-2 flex justify-between">
				{#if errors.about}
					<span class="label-text-alt text-error label">{errors.about}</span>
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
				onclick={() => navigateWithTransition('/onboarding/client/name-location')}
			>
				Back
			</button>

			<button type="submit" class="btn btn-primary"> Continue </button>
		</div>
	</form>
</OnboardingLayout>
