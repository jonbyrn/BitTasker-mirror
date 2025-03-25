<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { skillCategories } from '$lib/data/onboardingData';
	import { skillsSchema } from '$lib/validation/onboardingSchemas';
	import { ZodError } from 'zod';

	let selectedSkillCategories: string[] = $state([]);
	let selectedSkills: string[] = $state([]);
	let customSkills = $state('');
	let errors: Record<string, string> = $state({});
	let availableSkills: string[] = $state([]);

	onMount(() => {
		// Get data from store
		const unsubscribe = onboardingStore.subscribe((data) => {
			selectedSkillCategories = data.skillCategories || [];
			selectedSkills = data.skills || [];
			customSkills = data.customSkills || '';

			// Update available skills based on selected categories
			updateAvailableSkills();
		});

		return unsubscribe;
	});

	function updateAvailableSkills() {
		availableSkills = [];
		if (selectedSkillCategories.length > 0) {
			skillCategories.forEach((category) => {
				if (selectedSkillCategories.includes(category.id)) {
					availableSkills = [...availableSkills, ...category.skills];
				}
			});
		}
	}

	function handleCategoryChange(categoryId: string, checked: boolean) {
		if (checked) {
			selectedSkillCategories = [...selectedSkillCategories, categoryId];
		} else {
			selectedSkillCategories = selectedSkillCategories.filter((id) => id !== categoryId);
			// Remove any selected skills that belong to the unselected category
			const categorySkills = skillCategories.find((cat) => cat.id === categoryId)?.skills || [];
			selectedSkills = selectedSkills.filter((skill) => !categorySkills.includes(skill));
		}

		updateAvailableSkills();
	}

	function handleSkillChange(skill: string, checked: boolean) {
		if (checked) {
			selectedSkills = [...selectedSkills, skill];
		} else {
			selectedSkills = selectedSkills.filter((s) => s !== skill);
		}
	}

	function validateForm() {
		errors = {};

		try {
			skillsSchema.parse({
				skillCategories: selectedSkillCategories,
				skills: selectedSkills,
				customSkills
			});
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
			onboardingStore.updateFields({
				skillCategories: selectedSkillCategories,
				skills: selectedSkills,
				customSkills
			});
			navigateWithTransition('/onboarding/freelancer/review');
		}
	}
</script>

<svelte:head>
	<title>Select Skills | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Select your skills"
	subtitle="Choose the categories and specific skills that best represent your expertise."
	step={5}
	totalSteps={5}
>
	<form onsubmit={handleSubmit} class="space-y-6">
		<div class="form-control">
			<label class="label">
				<span class="label-text text-lg font-medium">Skill Categories</span>
			</label>

			<div class="grid gap-2 md:grid-cols-2">
				{#each skillCategories as category}
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-primary"
								checked={selectedSkillCategories.includes(category.id)}
								onchange={(e) => handleCategoryChange(category.id, e.currentTarget.checked)}
							/>
							<span class="label-text">{category.name}</span>
						</label>
					</div>
				{/each}
			</div>

			{#if errors.skillCategories}
				<label class="label">
					<span class="label-text-alt text-error">{errors.skillCategories}</span>
				</label>
			{/if}
		</div>

		{#if availableSkills.length > 0}
			<div class="form-control">
				<label class="label">
					<span class="label-text text-lg font-medium">Skills</span>
				</label>

				<div class="grid gap-2 md:grid-cols-3">
					{#each availableSkills as skill}
						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-2">
								<input
									type="checkbox"
									class="checkbox checkbox-primary"
									checked={selectedSkills.includes(skill)}
									onchange={(e) => handleSkillChange(skill, e.currentTarget.checked)}
								/>
								<span class="label-text">{skill}</span>
							</label>
						</div>
					{/each}
				</div>

				{#if errors.skills}
					<label class="label">
						<span class="label-text-alt text-error">{errors.skills}</span>
					</label>
				{/if}
			</div>
		{/if}

		<div class="form-control">
			<label for="customSkills" class="label">
				<span class="label-text">Other Skills (Optional)</span>
			</label>
			<textarea
				id="customSkills"
				bind:value={customSkills}
				class="textarea textarea-bordered h-24"
				placeholder="Add any additional skills separated by commas (e.g., React Native, Flutter, Unity)"
			></textarea>
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/freelancer/about')}
			>
				Back
			</button>

			<button type="submit" class="btn btn-primary"> Continue </button>
		</div>
	</form>
</OnboardingLayout>
