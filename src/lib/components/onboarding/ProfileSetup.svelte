<script lang="ts">
	import { onMount } from 'svelte';
	import { UpdateUserProfileStore } from '$houdini';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	// Create the store for updating user profile
	const profileStore = new UpdateUserProfileStore();

	let { nextStep, prevStep } = $props<{
		nextStep: () => void;
		prevStep: () => void;
	}>();

	// User data
	let displayName = $state('John Doe');
	let professionalTitle = $state('Developer');
	let profileDescription = $state(
		'Lorem ipsum dolor sit, amet consectetur adipisicing elit. Magni pariatur doloribus eveniet odio rem perferendis dolorem numquam, voluptates inventore nemo qui vel dignissimos impedit. Tempore dolores impedit maxime reprehenderit animi!'
	);
	let skillsInput = $state('');
	// let skills = $state<string[]>([]);
	let skills = $state<string[]>([
		'test',
		'test2',
		'test3',
		'test4',
		'test5',
		'test6',
		'test7',
		'test8',
		'test9',
		'test10',
		'test11',
		'test12',
		'test13',
		'test14'
	]);

	// Status indicators
	let isLoading = $state(false);
	let error = $state('');
	let nameError = $state('');
	let descriptionError = $state('');
	let picture = $state({ key: '', url: '' });
	let pictureLoading = $state(false);

	// TODO: Save for later option
	let saveForLater = $state(false);
	let showPrevBtn = $state(false);

	onMount(async () => {
		const { value } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		if (!value) {
			showPrevBtn = true;
		}
	});

	// Handle image upload
	async function handleImageUpload(file: File) {
		if (!file) return;

		try {
			pictureLoading = true;
			const uploadedFile = await uploadService.uploadSingleFile(file, 'profile');
			picture = { key: uploadedFile.key, url: uploadedFile.url };
		} catch (error) {
			// Handle upload failure
			console.error('File upload failed:', error);
			error = 'File upload failed';
		} finally {
			pictureLoading = false;
		}
	}

	// Add skill tag
	function addSkill() {
		if (
			skillsInput &&
			skillsInput.trim() &&
			skillsInput.trim().length > 3 &&
			!skills.includes(skillsInput.trim()) &&
			skills.length < 20
		) {
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
			if (
				!saveForLater &&
				(!profileDescription || profileDescription.length < 200 || profileDescription.length > 2000)
			) {
				descriptionError =
					'Please provide a profile description (minimum 200 characters, max 2000 characters)';
				isLoading = false;
				return;
			}

			// Create profile data
			const profileData = {
				displayName,
				professionalTitle,
				profileDescription,
				skills,
				profilePictureUrl: picture.url,
				profilePictureId: picture.key
			};

			// Update profile using GraphQL
			const result = await profileStore.mutate({
				input: profileData
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

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

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Profile Picture Upload -->
			<div class="form-control mx-auto max-h-32 w-full max-w-32 rounded-full">
				<Uploader
					id="profilePicture"
					label="Profile Picture"
					maxFiles={1}
					customClass="h-32 w-full"
					onChange={(files) => handleImageUpload(files[0])}
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
					class="textarea textarea-bordered h-24 w-full rounded-2xl {descriptionError
						? 'textarea-error'
						: ''}"
					placeholder="Tell others about yourself, your skills, and experience"
					disabled={saveForLater}
				></textarea>
				{#if descriptionError}
					<label class="label whitespace-normal" for="profileDescription">
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
							<span class="mb-1">
								{skill}
							</span>
							<button
								aria-label="Remove skill"
								type="button"
								class="btn btn-ghost btn-xs p-0"
								onclick={() => removeSkill(index)}
								disabled={saveForLater}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3 w-3"
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
					<span class="whitespace-normal">{error}</span>
				</div>
			{/if}

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				{#if showPrevBtn}
					<button type="button" class="btn btn-outline" onclick={prevStep}> Back </button>
				{:else}
					<div></div>
				{/if}
				<button type="submit" class="btn btn-primary" disabled={isLoading || pictureLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{/if}
					Next
				</button>
			</div>
		</form>
	</div>
</div>
