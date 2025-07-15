<script lang="ts">
	import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import { onMount, onDestroy } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import {
		publishProfileMetadata,
		publishMultipleImages,
		subscribeToProfileUpdates,
		publishSkillsUpdate
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let { nextStep, prevStep } = $props<{
		nextStep: () => void;
		prevStep: () => void;
	}>();

	// User data
	let displayName = $state('');
	let professionalTitle = $state('');
	let profileDescription = $state('');
	let skillsInput = $state('');
	let skills = $state<Skill[]>([]);

	// Status indicators
	let isLoading = $state(false);
	let error = $state('');
	let nameError = $state('');
	let descriptionError = $state('');
	let picture = $state<NostrProfileImage | null>(null);
	let selectedFile = $state<File | null>(null);
	let pictureLoading = $state(false);
	let isInitialLoading = $state(false);

	// Event IDs for updates
	let imageEventId = $state<string | null>(null);
	let saveForLater = $state(false);
	let showPrevBtn = $state(false);
	let cleanup: (() => void) | null = null;

	onMount(async () => {
		const { value } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		if (!value) {
			showPrevBtn = true;
		}

		// Subscribe to profile updates
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					// Handle profile metadata update
					if (event.kind === 0) {
						const metadata = JSON.parse(event.content);
						displayName = metadata.displayName || displayName;
						professionalTitle = metadata.professionalTitle || professionalTitle;
						profileDescription = metadata.about || profileDescription;
					}
					// Handle image metadata update
					else if (event.kind === 30063) {
						imageEventId = event.id;
						const images = JSON.parse(event.content);
						if (images.length > 0) {
							picture = {
								url: images[0].url,
								type: images[0].type,
								alt: images[0].alt,
								key: images[0].key
							};
						}
					}
					// Handle skills update
					else if (
						event.kind === 30000 &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'skills')
					) {
						const skillsData = JSON.parse(event.content);
						if (Array.isArray(skillsData)) {
							skills = skillsData.map((skill) => ({
								...skill,
								id: skill.id
							}));
						}
					}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = 'Failed to connect to Nostr relay. Please try again later.';
				} finally {
					isInitialLoading = false;
				}
			},
			{
				0: null,
				30063: { d: 'profile-images' },
				30000: { d: 'skills' }
			}
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});

	// Handle image selection (store locally, don't upload yet)
	async function handleImageUpload() {
		if (selectedFile) {
			try {
				pictureLoading = true;
				const uploadedFile = await uploadService.uploadSingleFile(selectedFile, 'profile');
				const uploadedPicture = {
					url: uploadedFile.url,
					type: selectedFile.type,
					alt: selectedFile.name,
					key: uploadedFile.key
				};
				await publishMultipleImages([uploadedPicture], imageEventId, 'profile-images');
			} catch (uploadErr) {
				console.error('File upload failed:', uploadErr);
				error = 'File upload failed';
				isLoading = false;
				return;
			} finally {
				pictureLoading = false;
			}
		}
	}

	// Add skill tag
	function addSkill() {
		if (
			skillsInput &&
			skillsInput.trim() &&
			skillsInput.trim().length > 2 &&
			!skills.some((skill) => skill.name === skillsInput.trim()) &&
			skills.length < 20
		) {
			skills = [
				...skills,
				{
					name: skillsInput.trim(),
					level: 1,
					verificationStatus: 'unverified',
					endorsements: 0,
					certifications: [],
					id: crypto.randomUUID()
				}
			];
			skillsInput = '';
		} else {
			error = 'Skill already exists or is too short';
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

			// Upload and publish profile picture if a new file is selected
			await handleImageUpload();

			// Publish profile metadata
			const profileData: NostrProfile = {
				displayName,
				professionalTitle,
				about: profileDescription
			};

			await publishProfileMetadata(profileData);

			// Publish skills if not saving for later
			if (!saveForLater && skills.length > 0) {
				await publishSkillsUpdate(skills);
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

{#if isInitialLoading}
	<div class="card bg-base-100 w-full shadow-xl">
		<div class="card-body">
			<div class="space-y-6">
				<!-- Profile Picture Skeleton -->
				<div class="mx-auto max-h-32 w-full max-w-32">
					<div class="bg-base-300 h-32 w-32 animate-pulse rounded-full"></div>
				</div>

				<!-- Display Name Skeleton -->
				<div class="space-y-2">
					<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
					<div class="bg-base-300 h-12 w-full animate-pulse rounded"></div>
				</div>

				<!-- Professional Title Skeleton -->
				<div class="space-y-2">
					<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
					<div class="bg-base-300 h-12 w-full animate-pulse rounded"></div>
				</div>

				<!-- Description Skeleton -->
				<div class="space-y-2">
					<div class="bg-base-300 h-4 w-36 animate-pulse rounded"></div>
					<div class="bg-base-300 h-24 w-full animate-pulse rounded"></div>
				</div>

				<!-- Skills Skeleton -->
				<div class="space-y-2">
					<div class="bg-base-300 h-4 w-16 animate-pulse rounded"></div>
					<div class="bg-base-300 h-12 w-full animate-pulse rounded"></div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="card bg-base-100 w-full shadow-xl">
		<div class="card-body">
			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Profile Picture Upload -->
				<div class="form-control mx-auto w-full">
					<Uploader
						id="profilePicture"
						label="Profile Picture"
						maxFiles={1}
						className="h-32 w-full max-w-32 mx-auto"
						files={selectedFile
							? [URL.createObjectURL(selectedFile)]
							: picture
								? [picture.url]
								: undefined}
						onChange={(files) => {
							if (!files[0]) return;
							selectedFile = files[0];
							// Clear any previous uploaded picture since we have a new file
							if (!picture) {
								picture = null;
							}
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
									{skill.name}
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
					<div class="alert alert-error alert-outline">
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
{/if}
