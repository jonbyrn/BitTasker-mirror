<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { taskCategories } from '$lib/data/onboardingData';
	import { taskCategoriesSchema } from '$lib/validation/onboardingSchemas';
	import { ZodError } from 'zod';

	let selectedCategories: string[] = $state([]);
	let errors: Record<string, string> = $state({});

	onMount(() => {
		// Get data from store
		const unsubscribe = onboardingStore.subscribe((data) => {
			selectedCategories = data.taskCategories || [];
		});

		return unsubscribe;
	});

	function handleCategoryChange(categoryId: string, checked: boolean) {
		if (checked) {
			selectedCategories = [...selectedCategories, categoryId];
		} else {
			selectedCategories = selectedCategories.filter((id) => id !== categoryId);
		}
	}

	function validateForm() {
		errors = {};

		try {
			taskCategoriesSchema.parse({ taskCategories: selectedCategories });
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
			onboardingStore.updateField('taskCategories', selectedCategories);
			navigateWithTransition('/onboarding/client/review');
		}
	}
</script>

<svelte:head>
	<title>Select Task Categories | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Select task categories"
	subtitle="Choose the types of tasks you typically need help with."
	step={5}
	totalSteps={5}
>
	<form onsubmit={handleSubmit} class="space-y-6">
		<div class="form-control">
			<div class="space-y-3">
				{#each taskCategories as category}
					<div class="card bg-base-100 hover:bg-base-200 transition-colors">
						<div class="card-body p-4">
							<label class="flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									class="checkbox checkbox-primary mt-1"
									checked={selectedCategories.includes(category.id)}
									onchange={(e) => handleCategoryChange(category.id, e.currentTarget.checked)}
								/>
								<div>
									<h3 class="font-medium">{category.name}</h3>
									<p class="text-base-content/70 text-sm">{category.description}</p>
								</div>
							</label>
						</div>
					</div>
				{/each}
			</div>

			{#if errors.taskCategories}
				<label class="label">
					<span class="label-text-alt text-error">{errors.taskCategories}</span>
				</label>
			{/if}
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/client/about')}
			>
				Back
			</button>

			<button type="submit" class="btn btn-primary"> Continue </button>
		</div>
	</form>
</OnboardingLayout>
