<script lang="ts">
	import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { t } from 'svelte-i18n';
	import {
		publishProfileMetadata,
		publishMultipleImages,
		publishSkillsUpdate,
		generateProfileTranslations,
		fetchKind0Profile,
		loadAuthProfileSnapshot,
		resolveDisplayNameFromProfileMetadataContent,
		type ProfileSetupMode
	} from '$lib/nostr/profile';
	import { applyNdkSignerFromNsec, syncNdkSignerFromAppStore } from '$lib/nostr/ndkSigner';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { hexToBytes } from '$lib/utils/helpers/encoding';
	import Uploader from '$lib/components/Uploader.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let {
		mode,
		displayName,
		nextStep,
		prevStep,
		npub = '',
		nsec = ''
	}: {
		mode: ProfileSetupMode;
		displayName: string;
		nextStep: () => void;
		prevStep: () => void;
		npub?: string;
		nsec?: string;
	} = $props();

	const isNsecFirstPublish = $derived(mode === 'nsec_first_publish');

	let professionalTitle = $state('');
	let profileDescription = $state('');
	let selectedSkills = $state<string[]>([]);

	let isLoading = $state(false);
	let isInitialLoading = $state(false);
	let error = $state('');
	let descriptionError = $state('');
	let displayNameInput = $state('');
	let displayNameError = $state('');
	let picture = $state<NostrProfileImage | null>(null);
	let selectedFile = $state<File | null>(null);
	let pictureLoading = $state(false);
	let imageEventId = $state<string | null>(null);
	let showPrevBtn = $state(false);
	let existingMetadata = $state<NostrProfile>({});
	let authorHex = $state('');
	/** True when relays already have a display name (hide nsec-only name field). */
	let relayHasDisplayName = $state(false);

	async function ensureNdkSigner(): Promise<void> {
		if (nsec) {
			await applyNdkSignerFromNsec(hexToBytes(nsec));
			return;
		}
		await syncNdkSignerFromAppStore();
	}

	async function resolveAuthorHex(): Promise<string> {
		if (npub.trim()) {
			return npub.trim();
		}
		try {
			return await getNpub();
		} catch {
			return '';
		}
	}

	function applySnapshotToForm(metadata: NostrProfile | null, skills: Skill[]) {
		if (metadata) {
			const relayLabel = resolveDisplayNameFromProfileMetadataContent(
				metadata as Record<string, unknown>
			);
			if (relayLabel) {
				relayHasDisplayName = true;
				// Resume / nsec-login: prefill from relay; signup keeps step-0 name when already set
				if (isNsecFirstPublish || !displayName.trim()) {
					displayNameInput = relayLabel;
				}
			}
			if (metadata.professionalTitle) {
				professionalTitle = metadata.professionalTitle;
			}
			if (metadata.about) {
				profileDescription = metadata.about;
			}
			existingMetadata = metadata;
		}
		if (skills.length > 0) {
			selectedSkills = skills.map((s) => s.name);
		}
	}

	onMount(async () => {
		const { value } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
		showPrevBtn = !value;

		if (!isNsecFirstPublish && displayName.trim()) {
			displayNameInput = displayName.trim();
		}

		authorHex = await resolveAuthorHex();
		if (!authorHex) {
			return;
		}

		try {
			isInitialLoading = true;
			await ensureNdkSigner();
			const snapshot = await loadAuthProfileSnapshot(authorHex);
			if (snapshot.picture) {
				picture = snapshot.picture;
			}
			imageEventId = snapshot.imageEventId;
			applySnapshotToForm(snapshot.metadata, snapshot.skills);
		} catch (err) {
			console.error('Failed to load profile snapshot:', err);
			error = $t('onboarding_auth.form.failed_process_profile_update');
		} finally {
			isInitialLoading = false;
		}
	});

	function profilePublishErrorMessage(err: unknown): string {
		if (err instanceof Error) {
			if (err.message === 'PROFILE_METADATA_VERIFY_TIMEOUT') {
				return $t('onboarding_auth.form.profile_publish.verify_timeout');
			}
			if (err.message === 'PROFILE_METADATA_PUBLISH_REJECTED') {
				return $t('onboarding_auth.form.profile_publish.relay_rejected');
			}
			if (err.message === 'PROFILE_METADATA_MISSING') {
				return $t('onboarding_auth.form.profile_publish.failed');
			}
			return err.message;
		}
		return $t('onboarding_auth.form.profile_setup.errors.profile_setup_failed');
	}

	async function handleImageUpload(): Promise<boolean> {
		if (!selectedFile) {
			return true;
		}
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
			picture = uploadedPicture;
			await publishMultipleImages([uploadedPicture], imageEventId, 'profile-images');
			return true;
		} catch (uploadErr) {
			console.error('File upload failed:', uploadErr);
			error = $t('onboarding_auth.form.file_upload_failed');
			return false;
		} finally {
			pictureLoading = false;
		}
	}

	function buildSkillsFromSelection(): Skill[] {
		return selectedSkills.map((skillName) => ({
			name: skillName,
			level: 1,
			verificationStatus: 'unverified' as const,
			endorsements: 0,
			certifications: [],
			id: crypto.randomUUID()
		}));
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			descriptionError = '';
			displayNameError = '';

			const trimmedName = isNsecFirstPublish
				? displayNameInput.trim()
				: displayName.trim() || displayNameInput.trim();

			if (!trimmedName) {
				displayNameError = $t('onboarding_auth.form.display_name_required');
				return;
			}
			if (trimmedName.length < 3 || trimmedName.length > 50) {
				displayNameError = $t('onboarding_auth.form.display_name_setup.invalid');
				return;
			}

			if (profileDescription && profileDescription.trim().length < 100) {
				descriptionError = `${profileDescription.trim().length}/100 ${$t('onboarding_auth.form.min_characters')}`;
				return;
			}

			const hex = authorHex || (await resolveAuthorHex());
			if (!hex) {
				throw new Error('PROFILE_METADATA_MISSING');
			}

			await ensureNdkSigner();

			if (!(await handleImageUpload())) {
				return;
			}

			const profileTranslations = await generateProfileTranslations({
				professionalTitle,
				about: profileDescription
			});

			const enrichment: NostrProfile = {
				professionalTitle,
				about: profileDescription,
				...(profileTranslations && { translations: profileTranslations })
			};

			if (picture?.url) {
				enrichment.picture = picture.url;
			}

			let existing = existingMetadata;
			const relayProfile = await fetchKind0Profile(hex);
			if (relayProfile) {
				existing = relayProfile;
			}

			const relayLabel = resolveDisplayNameFromProfileMetadataContent(
				existing as Record<string, unknown>
			);
			const effectiveDisplayName = displayName.trim() || relayLabel || trimmedName;

			const needsFirstPublish = isNsecFirstPublish && !relayLabel && !relayHasDisplayName;

			if (needsFirstPublish) {
				await publishProfileMetadata({ display_name: trimmedName, ...enrichment }, {}, undefined, {
					requiredDisplayName: trimmedName
				});
			} else {
				if (!effectiveDisplayName) {
					throw new Error('PROFILE_METADATA_MISSING');
				}

				await publishProfileMetadata(
					{ display_name: effectiveDisplayName, ...enrichment },
					existing,
					undefined,
					{ requiredDisplayName: effectiveDisplayName }
				);
			}

			const skills = buildSkillsFromSelection();
			if (skills.length > 0) {
				await publishSkillsUpdate(skills);
			}

			nextStep();
		} catch (err: unknown) {
			console.error('Profile setup failed:', err);
			error = profilePublishErrorMessage(err);
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

				{#if isNsecFirstPublish && !relayHasDisplayName}
					<div class="form-control mx-auto max-w-xl">
						<label class="label" for="displayName">
							<span class="label-text">{$t('onboarding_auth.form.display_name')}</span>
						</label>
						<input
							type="text"
							id="displayName"
							data-testid="onboarding-display-name"
							bind:value={displayNameInput}
							class="input input-bordered w-full {displayNameError ? 'input-error' : ''}"
							placeholder={$t('onboarding_auth.form.display_name_setup.placeholder')}
							minlength="3"
							maxlength="50"
						/>
						{#if displayNameError}
							<label class="label whitespace-normal" for="displayName">
								<span class="label-text-alt text-error">{displayNameError}</span>
							</label>
						{/if}
					</div>
				{/if}

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
