<script lang="ts">
	import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import { onMount, onDestroy } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { t } from 'svelte-i18n';
	import {
		publishProfileMetadata,
		publishMultipleImages,
		subscribeToProfileUpdates,
		publishSkillsUpdate,
		generateProfileTranslations
	} from '$lib/nostr/profile';
	import Uploader from '$lib/components/Uploader.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import uploadService from '$lib/api/services/upload.service';
	import KINDS from '$lib/utils/constants/kinds';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import { prepareSigner, signerReady } from '$lib/utils/nostrKeys';

	let {
		displayName = $bindable(''),
		nextStep,
		prevStep
	}: {
		displayName: string;
		nextStep: () => void;
		prevStep: () => void;
	} = $props();

	// User data
	let professionalTitle = $state('');
	let profileDescription = $state('');
	let skills = $state<Skill[]>([]);
	let selectedSkills = $state<string[]>([]);

	// Status indicators
	let isLoading = $state(false);
	let error = $state('');
	let descriptionError = $state('');
	let picture = $state<NostrProfileImage | null>(null);
	let selectedFile = $state<File | null>(null);
	let pictureLoading = $state(false);
	let isInitialLoading = $state(false);

	// Event IDs for updates
	let imageEventId = $state<string | null>(null);
	let showPrevBtn = $state(false);
	let cleanup: (() => void) | null = null;

	onMount(async () => {
		// A refresh drops the in-memory signer. Warm a challenge before Next so
		// credentials.get still runs inside that click.
		prefetchPasskeyChallenge();
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

	// Handle image selection (store locally, don't upload yet)
	async function handleImageUpload() {
		if (selectedFile) {
			try {
				pictureLoading = true;
				const uploadedFile = await uploadService.uploadSingleFile(selectedFile, {
					folder: 'profile'
				});
				const uploadedPicture = {
					url: uploadedFile.url,
					type: selectedFile.type,
					alt: selectedFile.name,
					key: uploadedFile.key
				};
				await publishMultipleImages([uploadedPicture], imageEventId, 'profile-images');
			} catch (uploadErr) {
				console.error('File upload failed:', uploadErr);
				error = $t('onboarding_auth.form.file_upload_failed');
				isLoading = false;
				return;
			} finally {
				pictureLoading = false;
			}
		}
	}

	// Remove bidirectional ping-pong: selectedSkills will be initialized from subscription

	// Convert string array back to skills array, guarded to avoid self-triggered loops
	$effect(() => {
		// If both arrays represent the same names (order-insensitive), skip
		const currentNames = new Set(skills.map((s) => s.name));
		const selectedNames = new Set(selectedSkills);
		if (
			currentNames.size === selectedNames.size &&
			[...currentNames].every((n) => selectedNames.has(n))
		) {
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
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			descriptionError = '';

			// Enforce minimum description length of 100 characters
			if (profileDescription && profileDescription.trim().length < 100) {
				descriptionError = `${profileDescription.trim().length}/100 ${$t('onboarding_auth.form.min_characters')}`;
				isLoading = false;
				return;
			}

			// Start WebAuthn before any await. An empty title, description, and
			// skills list are optional; a missing signer still has to approve.
			const unlock = signerReady() ? null : prepareSigner();

			// Upload and publish profile picture if a new file is selected
			await handleImageUpload();
			if (unlock) await unlock;

			// Generate translations for profile content (professionalTitle and about)
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

			// Include picture URL if available (NIP-24)
			if (picture?.url) {
				profileData.picture = picture.url;
			}

			await publishProfileMetadata(profileData);

			// Publish skills
			if (skills.length > 0) {
				await publishSkillsUpdate(skills);
			}

			// Go to the next step
			nextStep();
		} catch (err: unknown) {
			console.error('Profile setup failed:', err);
			error =
				err instanceof Error
					? err.message
					: $t('onboarding_auth.form.profile_setup.errors.profile_setup_failed');
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
			<div class="education-header text-center">
				<h4 class="step-title">{$t('onboarding_auth.form.profile_setup.title')}</h4>

				<p class="text-primary text-base md:text-lg">
					{$t('onboarding_auth.form.profile_setup.stand_out')}
				</p>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Profile Picture Upload -->
				<div class="form-control mx-auto w-full">
					<Uploader
						id="profilePicture"
						label={$t('onboarding_auth.form.profile_setup.profile_picture')}
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
						<span class="label-text-alt"
							>{profileDescription.length}/100 {$t('onboarding_auth.form.min_characters')}</span
						>
					</label>
					<textarea
						id="profileDescription"
						data-testid="onboarding-profile-description"
						bind:value={profileDescription}
						minlength={profileDescription.length === 0 ? undefined : 100}
						class="textarea textarea-bordered h-24 w-full rounded-2xl {descriptionError
							? 'textarea-error'
							: ''}"
						placeholder={$t('onboarding_auth.form.profile_description_placeholder')}
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
						bind:selectedSkills
						maxSelections={20}
						placeholder={$t('onboarding_auth.form.add_skills')}
						className="w-full"
					/>
				</div>

				{#if error}
					<div class="alert alert-error alert-outline mx-auto max-w-xl">
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
					<button
						type="submit"
						class="btn btn-primary"
						data-testid="onboarding-profile-next"
						disabled={isLoading || pictureLoading}
					>
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
