<script lang="ts">
	import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import { onMount, onDestroy } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { t } from 'svelte-i18n';
	import IconCheck from '~icons/mdi/check-circle-outline';
	import {
		publishProfileMetadata,
		publishMultipleImages,
		subscribeToProfileUpdates,
		publishSkillsUpdate
	} from '$lib/nostr/profile';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import KINDS from '$lib/utils/constants/kinds';

	let { nextStep, prevStep, currentStep, totalSteps } = $props<{
		nextStep: () => void;
		prevStep: () => void;
		currentStep: number;
		totalSteps: number;
	}>();

	// User data
	let displayName = $state('');
	let professionalTitle = $state('');
	let profileDescription = $state('');
	let skillsInput = $state('');
	let skills = $state<Skill[]>([]);
	let selectedSkills = $state<string[]>([]);

	// Status indicators
	let isLoading = $state(false);
	let error = $state('');
	let nameError = $state('');
	let descriptionError = $state('');
	let picture = $state<NostrProfileImage | null>(null);
	let uploadResults = $state<UploadResult[]>([]);
	let isInitialLoading = $state(false);

	// Event IDs for updates
	let imageEventId = $state<string | null>(null);
	let saveForLater = $state(false);
	let showPrevBtn = $state(false);
	let cleanup: (() => void) | null = null;

	let showInfoDropdown = $state(false);

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
					// Handle profile metadata update (NIP-01 + NIP-24)
					if (event.kind === 0) {
						const metadata = JSON.parse(event.content);

						// Basic NIP-01 fields
						displayName =
							metadata.display_name || metadata.displayName || metadata.name || displayName;
						professionalTitle = metadata.professionalTitle || professionalTitle;
						profileDescription = metadata.about || profileDescription;

						// NIP-24 extended metadata fields
						// Handle profile picture - priority: picture > banner (if no picture exists)
						if (metadata.picture) {
							picture = {
								url: metadata.picture,
								type: 'image/png', // Default type, might be overridden later
								alt: 'Profile picture',
								key: metadata.picture // Use URL as key for external images
							};
						} else if (metadata.banner && !picture) {
							// Use banner as profile picture if no picture is set
							picture = {
								url: metadata.banner,
								type: 'image/png',
								alt: 'Profile banner used as picture',
								key: metadata.banner
							};
						}
					}
					// Handle image metadata update
					else if (event.kind === KINDS.PROFILE_IMAGES) {
						imageEventId = event.id;
						const images = JSON.parse(event.content);
						if (images.length > 0) {
							// Only update picture if we don't have one from metadata
							if (!picture) {
								picture = {
									url: images[0].url,
									type: images[0].type,
									alt: images[0].alt,
									key: images[0].key
								};
							}
						}
					}
					// Handle skills update
				else if (
					event.kind === KINDS.PROFILE_SKILLS &&
					event.tags.find((t) => t[0] === 'd' && t[1] === 'skills')
				) {
					const skillsData = JSON.parse(event.content);
					if (Array.isArray(skillsData)) {
						skills = skillsData.map((skill) => ({
							...skill,
							id: skill.id
						}));
						// Mirror arriving skills into selectedSkills once to initialize the UI
						selectedSkills = skillsData.map((s) => s.name);
					}
				}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = $t('onboarding_auth.form.failed_process_profile_update');
				} finally {
					isInitialLoading = false;
				}
			},
			{
				0: null, // Subscribe to all kind 0 (metadata) events for NIP-24 support
				30063: { d: 'profile-images' },
				30000: { d: 'skills' }
			}
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});

	// Publish uploaded images to Nostr (MediaUploader handles upload on select)
	async function publishProfileImages() {
		if (uploadResults.length === 0) return;
		try {
			const images = uploadResults.map((r) => ({
				url: r.url,
				type: r.type,
				alt: 'Profile picture',
				key: r.key
			}));
			await publishMultipleImages(images, imageEventId, 'profile-images');
		} catch (publishErr) {
			console.error('Publish images failed:', publishErr);
			error = $t('onboarding_auth.form.file_upload_failed');
			throw publishErr;
		}
	}

	// Keep skills in sync with selectedSkills
	function syncSkillsFromSelectedSkills() {
		const currentNames = new Set(skills.map((s) => s.name));
		const selectedNames = new Set(selectedSkills);
		if (currentNames.size === selectedNames.size && [...currentNames].every((n) => selectedNames.has(n))) {
			return;
		}
		skills = selectedSkills.map((skillName) => {
			const existingSkill = skills.find((skill) => skill.name === skillName);
			if (existingSkill) return existingSkill;
			return {
				name: skillName,
				level: 1,
				verificationStatus: 'unverified' as const,
				endorsements: 0,
				certifications: [],
				id: crypto.randomUUID()
			};
		});
	}

	// Add skill tag (legacy function for compatibility)
	function addSkill() {
		if (
			skillsInput &&
			skillsInput.trim() &&
			skillsInput.trim().length > 2 &&
			!selectedSkills.includes(skillsInput.trim()) &&
			selectedSkills.length < 20
		) {
			selectedSkills = [...selectedSkills, skillsInput.trim()];
			syncSkillsFromSelectedSkills();
			skillsInput = '';
		} else {
			error = $t('onboarding_auth.form.skill_already_exists_or_too_short');
		}
	}

	// Remove skill tag (legacy function for compatibility)
	function removeSkill(index: number) {
		selectedSkills = selectedSkills.filter((_, i) => i !== index);
		syncSkillsFromSelectedSkills();
	}

	// Handle key press for skill tags (legacy function for compatibility)
	function handleSkillKeypress(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addSkill();
		}
	}

	function toggleInfoDropdown() {
		showInfoDropdown = !showInfoDropdown;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		
		try {
			isLoading = true;
			error = '';
			nameError = '';
			descriptionError = '';

			// Validate display name
			if (!displayName) {
				nameError = $t('onboarding_auth.form.display_name_required');
				isLoading = false;
				return;
			}


			// Validate profile description only when not saving for later
			if (!saveForLater) {
				if (!profileDescription) {
					descriptionError = $t('onboarding_auth.form.profile_description_required');
					isLoading = false;
					return;
				}

				// Enforce minimum description length of 100 characters
				if (profileDescription.trim().length < 100) {
					descriptionError = `${profileDescription.trim().length}/100 ${$t('onboarding_auth.form.min_characters')}`;
					isLoading = false;
					return;
				}
			}

			// Publish profile picture to Nostr (MediaUploader already uploaded on select)
			await publishProfileImages();

			// Generate translations for profile content (professionalTitle and about)
			const { generateProfileTranslations } = await import('$lib/nostr/profile');
			const profileTranslations = await generateProfileTranslations({
				professionalTitle,
				about: profileDescription
			});

			// Publish profile metadata
			const profileData: NostrProfile = {
				name: displayName, // Use 'name' as primary field per NIP-24
				display_name: displayName,
				professionalTitle,
				about: profileDescription,
				...(profileTranslations && { translations: profileTranslations })
			};

			// Include picture URL if available (NIP-24) - prefer newly uploaded over existing
			const pictureUrl = uploadResults[0]?.url ?? picture?.url;
			if (pictureUrl) {
				profileData.picture = pictureUrl;
			}

			await publishProfileMetadata(profileData);

			// Publish skills if not saving for later
			if (!saveForLater && skills.length > 0) {
				await publishSkillsUpdate(skills);
			}

			// Go to the next step
			nextStep();
		} catch (err: unknown) {
			console.error('Profile setup failed:', err);
			error = err instanceof Error ? err.message : $t('onboarding_auth.form.profile_setup.errors.profile_setup_failed');
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
	<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-profile">
		<div class="card-body">
			<!-- Step indicator + Muestra tu experiencia (same row, aligned) -->
			<div class="relative mb-4 grid w-full grid-cols-[1fr_auto] items-center gap-3 overflow-visible">
				<button
					type="button"
					class="btn btn-ghost btn-sm justify-start gap-2 font-medium text-primary"
					onclick={toggleInfoDropdown}
					aria-expanded={showInfoDropdown}
					aria-haspopup="true"
				>
					<span>{$t('onboarding_auth.form.profile_setup.subtitle')}</span>
					<svg
						class="h-4 w-4 shrink-0 transition-transform"
						class:rotate-180={showInfoDropdown}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				<span class="step-indicator shrink-0 text-right text-sm font-medium text-primary">
					{$t('onboarding_auth.form.profile_setup.step')} {currentStep + 1} {$t('onboarding_auth.form.profile_setup.of')} {totalSteps}
				</span>
				{#if showInfoDropdown}
					<div
						class="fixed inset-0 z-40"
						aria-hidden="true"
						onclick={() => (showInfoDropdown = false)}
					></div>
					<div
						class="bg-base-200 border-base-300 absolute left-0 top-full z-50 mt-2 w-full min-w-64 rounded-lg border p-4 text-left shadow"
						role="region"
						aria-label={$t('onboarding_auth.form.profile_setup.subtitle')}
					>
						<p class="text-base-content mb-4 text-sm">
							{$t('onboarding_auth.form.profile_setup.description')}
						</p>
						<div class="features-list mb-4 space-y-2 text-sm">
							<div class="feature-item flex items-center justify-start gap-2">
								<IconCheck class="text-primary min-w-[1.25em] shrink-0" />
								<span>{@html $t('onboarding_auth.form.profile_setup.features.visible')}</span>
							</div>
							<div class="feature-item flex items-center justify-start gap-2">
								<IconCheck class="text-primary min-w-[1.25em] shrink-0" />
								<span>{@html $t('onboarding_auth.form.profile_setup.features.trustworthy')}</span>
							</div>
							<div class="feature-item flex items-center justify-start gap-2">
								<IconCheck class="text-primary min-w-[1.25em] shrink-0" />
								<span>{@html $t('onboarding_auth.form.profile_setup.features.discoverable')}</span>
							</div>
							<div class="feature-item flex items-center justify-start gap-2">
								<IconCheck class="text-primary min-w-[1.25em] shrink-0" />
								<span>{@html $t('onboarding_auth.form.profile_setup.features.professional')}</span>
							</div>
						</div>
						<p class="text-primary text-sm font-medium">
							{$t('onboarding_auth.form.profile_setup.stand_out')}
						</p>
					</div>
				{/if}
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Profile Picture: small menu = Select from gallery | Camera -->
				<div class="form-control mx-auto w-full">
					<MediaUploader
						id="profilePicture"
						label={$t('onboarding_auth.form.profile_setup.profile_picture')}
						maxFiles={1}
						enablePhotoMenu={true}
						uploadFolder="profile"
						className="h-32 w-full max-w-32 mx-auto"
						files={uploadResults.length > 0 ? uploadResults.map((r) => r.url) : picture ? [picture.url] : []}
						onChange={(results) => {
							uploadResults = results;
						}}
						onRemove={(index) => {
							uploadResults = uploadResults.filter((_, i) => i !== index);
						}}
					/>
				</div>

				<!-- Display Name Field -->
				<div class="form-control mx-auto max-w-xl">
					<label class="label" for="displayName">
						<span class="label-text">{$t('onboarding_auth.form.display_name')}</span>
					</label>
					<input
						type="text"
						id="displayName"
						data-testid="onboarding-display-name"
						bind:value={displayName}
						class="input input-bordered w-full {nameError ? 'input-error' : ''}"
						placeholder={$t('onboarding_auth.form.your_full_name')}
						required
					/>
					{#if nameError}
						<label class="label" for="displayName">
							<span class="label-text-alt text-error">{nameError}</span>
						</label>
					{/if}
				</div>

				<!-- Professional Title Field -->
				<div class="form-control mx-auto max-w-xl">
					<label class="label" for="professionalTitle">
						<span class="label-text">{$t('onboarding_auth.form.professional_title')}</span>
					</label>
					<input
						type="text"
						id="professionalTitle"
						data-testid="onboarding-professional-title"
						bind:value={professionalTitle}
						class="input input-bordered w-full"
						placeholder={$t('onboarding_auth.form.professional_title_placeholder')}
					/>
				</div>

				<!-- Profile Description Field -->
				<div class="form-control mx-auto max-w-xl">
                    <label class="label" for="profileDescription">
                        <span class="label-text">{$t('onboarding_auth.form.profile_description')}</span>
                        <span class="label-text-alt">{profileDescription.length}/100 {$t('onboarding_auth.form.min_characters')}</span>
                    </label>
					<textarea
						id="profileDescription"
						data-testid="onboarding-profile-description"
						bind:value={profileDescription}
                        minlength={saveForLater ? undefined : 100}
						class="textarea textarea-bordered h-24 w-full rounded-2xl {descriptionError
							? 'textarea-error'
							: ''}"
                        placeholder={$t('onboarding_auth.form.profile_description_placeholder')}
						disabled={saveForLater}
					></textarea>
					{#if descriptionError}
						<label class="label whitespace-normal" for="profileDescription">
							<span class="label-text-alt text-error">{descriptionError}</span>
						</label>
					{/if}
				</div>

				<!-- Skills Tags -->
				<div class="form-control mx-auto max-w-xl" data-testid="onboarding-skills">
					<label class="label" for="skills">
						<span class="label-text">{$t('onboarding_auth.form.skills')}</span>
						<span class="label-text-alt">{selectedSkills.length}/20</span>
					</label>
					<SkillsMultiselect
						bind:selectedSkills={selectedSkills}
						maxSelections={20}
						placeholder={$t('onboarding_auth.form.add_skills')}
						className="w-full"
						onChange={syncSkillsFromSelectedSkills}
					/>
				</div>

				<!-- Save for Later Option -->
				<div class="form-control space-y-2 mx-auto max-w-xl">
					<label class="label flex cursor-pointer items-center justify-start gap-2">
						<input type="checkbox" bind:checked={saveForLater} class="checkbox checkbox-sm" />
						<span class="label-text">{$t('onboarding_auth.form.save_for_later')}</span>
					</label>
					<span class="text-base-content/70 block text-xs">
						{$t('onboarding_auth.form.you_can_complete_your_profile_later')}
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
						<button type="button" class="btn btn-outline" onclick={prevStep}>
							{$t('onboarding_auth.form.back')}	
						</button>
					{:else}
						<div></div>
					{/if}
					<button type="submit" class="btn btn-primary" data-testid="onboarding-profile-next" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{/if}
						{$t('onboarding_auth.form.next')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

