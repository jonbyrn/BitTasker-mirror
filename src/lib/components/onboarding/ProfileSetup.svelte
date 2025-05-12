<script lang="ts">
	// TODO: Integrate this step with API
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import Uploader from '$lib/components/Uploader.svelte';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';

	let { nextStep, prevStep } = $props<{
		nextStep: () => void;
		prevStep: () => void;
	}>();

	// User data
	let displayName = $state('');
	let profilePicture = $state<File | null>(null);
	let professionalTitle = $state('');
	let profileDescription = $state('');
	let skillsInput = $state('');
	let skills = $state<string[]>([]);

	// Status indicators
	let isLoading = $state(false);
	let error = $state('');
	let nameError = $state('');
	let descriptionError = $state('');
	let picturePreview = $state('');

	// Save for later option
	let saveForLater = $state(false);

	// Handle image upload
	function handleImageUpload(file: File) {
		if (file.type.match('image.*')) {
				profilePicture = file;
				const reader = new FileReader();
				reader.onload = (e) => {
					picturePreview = e.target?.result as string;
				};
			reader.readAsDataURL(file);
		}
	}

	// Add skill tag
	function addSkill() {
		if (skillsInput && !skills.includes(skillsInput) && skills.length < 20) {
			skills = [...skills, skillsInput.trim()];
			skillsInput = '';
		}
	}

	// Remove skill tag
	function removeSkill(index: number) {
		skills = skills.filter((_, i) => i !== index);
	}

	// Handle key press for skill tags
	function handleSkillKeypress(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addSkill();
		}
	}

	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';
			nameError = '';
			descriptionError = '';

			// Validate display name
			if (!displayName) {
				nameError = 'Display name is required';
				isLoading = false;
				return;
			}

			// Validate profile description
			if (!saveForLater && (!profileDescription || profileDescription.length < 200)) {
				descriptionError = 'Please provide a profile description (minimum 200 characters)';
				isLoading = false;
				return;
			}

			// Update the onboarding data with profile information
			const updatedData = {
				displayName,
				professionalTitle,
				profileDescription,
				skills,
				// TODO: profilePicture: {key, url} Upload image to server and get key and url
			};

			// Go to the next step
			nextStep();
		} catch (err: unknown) {
			console.error('Profile setup failed:', err);
			error = err instanceof Error ? err.message : 'Profile setup failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl" in:fly={{ duration: 100, x: 20, easing: linear }}>
	<div class="card-body">
		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Profile Picture Upload -->
			<div class="form-control mx-auto max-h-32 w-full max-w-32 rounded-full">
				<Uploader
					id="profilePicture"
					label="Profile Picture"
					maxFiles={1}
					customClass="h-32 w-full"
					onChange={(files) => {
						console.log(files);
					}}
				/>
			</div>

			<!-- Display Name Field -->
			<div class="form-control">
				<label class="label" for="displayName">
					<span class="label-text">Display Name</span>
				</label>
				<input
					type="text"
					id="displayName"
					bind:value={displayName}
					class="input input-bordered w-full {nameError ? 'input-error' : ''}"
					placeholder="Your full name"
					required
				/>
				{#if nameError}
					<label class="label" for="displayName">
						<span class="label-text-alt text-error">{nameError}</span>
					</label>
				{/if}
			</div>

			<!-- Professional Title Field -->
			<div class="form-control">
				<label class="label" for="professionalTitle">
					<span class="label-text">Professional Title</span>
				</label>
				<input
					type="text"
					id="professionalTitle"
					bind:value={professionalTitle}
					class="input input-bordered w-full"
					placeholder="e.g. Plumber, Handyman, Developer"
				/>
			</div>

			<!-- Profile Description Field -->
			<div class="form-control">
				<label class="label" for="profileDescription">
					<span class="label-text">Profile Description</span>
					<span class="label-text-alt">{profileDescription.length}/200 min</span>
				</label>
				<textarea
					id="profileDescription"
					bind:value={profileDescription}
					class="textarea textarea-bordered rounded-2xl h-24 {descriptionError ? 'textarea-error' : ''}"
					placeholder="Tell others about yourself, your skills, and experience"
					disabled={saveForLater}
				></textarea>
				{#if descriptionError}
					<label class="label" for="profileDescription">
						<span class="label-text-alt text-error">{descriptionError}</span>
					</label>
				{/if}
			</div>

			<!-- Skills Tags -->
			<div class="form-control">
				<label class="label" for="skills">
					<span class="label-text">Skills</span>
					<span class="label-text-alt">{skills.length}/20</span>
				</label>
				<div class="join w-full">
					<input
						type="text"
						id="skills"
						bind:value={skillsInput}
						class="input input-bordered join-item flex-1"
						placeholder="Add skills (e.g. Carpentry, Coding)"
						onkeydown={handleSkillKeypress}
						disabled={saveForLater || skills.length >= 20}
					/>
					<button
						type="button"
						class="btn btn-neutral join-item"
						onclick={addSkill}
						disabled={saveForLater || !skillsInput || skills.length >= 20}
					>
						Add
					</button>
				</div>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each skills as skill, index}
						<div class="badge badge-lg gap-1">
							{skill}
							<button
								aria-label="Remove skill"
								type="button"
								class="btn btn-ghost btn-xs p-0"
								onclick={() => removeSkill(index)}
								disabled={saveForLater}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
			</div>

			<!-- Save for Later Option -->
			<div class="form-control space-y-2">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={saveForLater} class="checkbox checkbox-sm" />
					<span class="label-text">Save for later</span>
				</label>
				<span class="text-base-content/70 block text-xs">
					You can complete your profile later, but some features may be limited until you do.
				</span>
			</div>

			{#if error}
				<div class="alert alert-error">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				<button type="button" class="btn btn-outline" onclick={prevStep}> Back </button>
				<button type="submit" class="btn btn-primary" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{/if}
					Next
				</button>
			</div>
		</form>
	</div>
</div>
