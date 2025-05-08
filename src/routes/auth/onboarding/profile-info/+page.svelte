<script lang="ts">
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';

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
	function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			const file = input.files[0];
			if (file.type.match('image.*')) {
				profilePicture = file;
				const reader = new FileReader();
				reader.onload = (e) => {
					picturePreview = e.target?.result as string;
				};
				reader.readAsDataURL(file);
			}
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

			// Get the existing onboarding data
			const onboardingDataResult = await Preferences.get({ key: 'bittasker_onboarding_data' });
			if (!onboardingDataResult.value) {
				error = 'Missing account setup data. Please go back to the first step.';
				isLoading = false;
				return;
			}

			const onboardingData = JSON.parse(onboardingDataResult.value);

			// Update the onboarding data with profile information
			const updatedData = {
				...onboardingData,
				displayName,
				professionalTitle,
				profileDescription,
				skills,
				profilePicture: picturePreview, // In a real implementation, you'd upload this to a server
				saveForLater
			};

			// Store updated onboarding data
			await Preferences.set({
				key: 'bittasker_onboarding_data',
				value: JSON.stringify(updatedData)
			});

			// Go to the next step or save for later
			if (saveForLater) {
				// Save progress and redirect to browse tasks
				goto('/dashboard');
			} else {
				// Continue to location setup
				goto('/auth/onboarding/location');
			}
		} catch (err: unknown) {
			console.error('Profile setup failed:', err);
			error = err instanceof Error ? err.message : 'Profile setup failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex min-h-[85vh] w-full flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-16 w-auto" />
			<h1 class="mt-4 text-center text-2xl font-bold">Profile Information</h1>
			<div class="mt-2 flex w-full justify-between">
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 1</div>
					<span class="mt-1 text-xs">Account</span>
				</div>
				<div class="flex flex-col items-center">
					<div class="badge badge-primary">Step 2</div>
					<span class="mt-1 text-xs">Profile</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 3</div>
					<span class="mt-1 text-xs">Location</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 4</div>
					<span class="mt-1 text-xs">Complete</span>
				</div>
			</div>
		</div>

		<div class="card bg-base-100 w-full shadow-xl">
			<div class="card-body">
				<form onsubmit={handleSubmit} class="space-y-4">
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
							<label class="label">
								<span class="label-text-alt text-error">{nameError}</span>
							</label>
						{/if}
					</div>

					<!-- Profile Picture Upload -->
					<div class="form-control">
						<label class="label" for="profilePicture">
							<span class="label-text">Profile Picture</span>
						</label>
						<div class="flex flex-col items-center gap-4">
							{#if picturePreview}
								<div class="avatar">
									<div class="h-24 w-24 rounded-full">
										<img src={picturePreview} alt="Profile preview" />
									</div>
								</div>
							{:else}
								<div class="avatar placeholder">
									<div class="bg-neutral-focus text-neutral-content h-24 w-24 rounded-full">
										<span class="text-2xl">
											{displayName ? displayName.charAt(0).toUpperCase() : '?'}
										</span>
									</div>
								</div>
							{/if}
							<input
								type="file"
								id="profilePicture"
								class="file-input file-input-bordered w-full max-w-xs"
								accept="image/*"
								onchange={handleImageUpload}
							/>
						</div>
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
							class="textarea textarea-bordered h-24 {descriptionError ? 'textarea-error' : ''}"
							placeholder="Tell others about yourself, your skills, and experience"
							disabled={saveForLater}
						></textarea>
						{#if descriptionError}
							<label class="label">
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
										type="button"
										class="btn btn-ghost btn-xs p-0"
										onclick={() => removeSkill(index)}
										disabled={saveForLater}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
										</svg>
									</button>
								</div>
							{/each}
						</div>
					</div>

					<!-- Save for Later Option -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-2">
							<input type="checkbox" bind:checked={saveForLater} class="checkbox checkbox-sm" />
							<span class="label-text">Save for later</span>
						</label>
						<span class="text-xs text-base-content/70">
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
						<button type="button" class="btn btn-outline" onclick={() => goto('/auth/onboarding/account-setup')}>
							Back
						</button>
						<button type="submit" class="btn btn-primary" disabled={isLoading}>
							{#if isLoading}
								<span class="loading loading-spinner"></span>
							{/if}
							{saveForLater ? 'Save for Later' : 'Next'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div> 