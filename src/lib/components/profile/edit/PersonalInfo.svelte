<script lang="ts">
	import type { NostrProfile, NostrProfileImage } from '$lib/types/profile.d';
	import { t, locale } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import { publishMultipleImages, subscribeToProfileUpdates } from '$lib/nostr/profile';
	import { publishProfileMetadata } from '$lib/nostr/profile';
	import KINDS from '$lib/utils/constants/kinds';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';

	// Helper function to get translated profile content from metadata
	function getTranslatedContent(
		metadata: NostrProfile,
		field: 'professionalTitle' | 'about'
	): string {
		const currentLang = $locale || 'en';
		const originalText = metadata[field] || '';
		
		// If no translations, return original
		if (!metadata.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if (metadata.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = metadata.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	let { onComplete } = $props<{ 
		onComplete: (completed: boolean, fromSave?: boolean) => void;
	}>();

	// Local state
	let isInitialLoading = $state(false); // Add loading state for initial data fetch
	let displayName = $state('');
	let professionalTitle = $state('');
	let profileDescription = $state('');
	let website = $state('');
	let pictures = $state<NostrProfileImage[]>([]);
	let uploadResults = $state<UploadResult[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let imageEventId = $state<string | null>(null); // Track the current image event ID
	let imagesToDelete = $state<string[]>([]);
	let cleanup: (() => void) | null = null;

	// Store complete existing metadata to preserve fields we don't edit
	let existingMetadata = $state<NostrProfile>({});

	// Combined files for display (URLs for MediaUploader)
	let displayFiles = $derived([...pictures.map((p) => p.url), ...uploadResults.map((r) => r.url)]);

	// Subscribe to profile updates
	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					// Handle profile metadata update
					if (event.kind === KINDS.PROFILE_METADATA) {
						const metadata = JSON.parse(event.content);
						// Update existing metadata store
						existingMetadata = { ...existingMetadata, ...metadata };
						
						// Update form fields with translated content based on current locale
						displayName =
							metadata.display_name || metadata.displayName || metadata.name || displayName;
						professionalTitle = getTranslatedContent(metadata, 'professionalTitle') || professionalTitle;
						profileDescription = getTranslatedContent(metadata, 'about') || profileDescription;
						website = metadata.website || website;
					}
					// Handle image metadata update
					else if (event.kind === KINDS.PROFILE_IMAGES) {
						imageEventId = event.id; // Store the event ID
						const images = JSON.parse(event.content);
						if (images.length > 0) {
							pictures = images.map((img: NostrProfileImage) => ({
								url: img.url,
								type: img.type || 'image/jpeg',
								alt: img.alt || '',
								key: img.key
							}));
						}
					}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = $t('profile_personal.failed_to_connect');
				} finally {
					isInitialLoading = false;
				}
			},
			{ 0: null, 30063: { d: 'profile-images' } } // Kind 0 for metadata, 300063 for media metadata
		);
	});

	// Cleanup subscription on component destroy
	onDestroy(() => {
		if (cleanup) cleanup();
	});

	// Derived state for form completion
	let isComplete = $derived(
		displayName &&
			professionalTitle &&
			profileDescription &&
			website &&
			(pictures.length + uploadResults.length) > 0
	);

	// Track form completion
	$effect(() => {
		onComplete(isComplete);
	});

	// MediaUploader handlers (uploads on select; we just track results)
	function handleFileRemove(index: number) {
		if (index < pictures.length) {
			imagesToDelete = [...imagesToDelete, pictures[index].key];
			pictures = pictures.filter((_, i) => i !== index);
		} else {
			uploadResults = uploadResults.filter((_, i) => i !== index - pictures.length);
		}
	}

	function uploadResultToNostrImage(r: UploadResult): NostrProfileImage {
		return {
			key: r.key,
			url: r.url,
			type: r.type === 'image' ? 'image/*' : 'image/jpeg',
			alt: r.key,
			size: r.size
		};
	}

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// Combine existing pictures with newly uploaded (MediaUploader uploads on select)
			const allImages: NostrProfileImage[] = [
				...pictures,
				...uploadResults.map((r) => uploadResultToNostrImage(r))
			];

			// Publish images event, passing the existing event ID if we have one
			await publishMultipleImages(allImages, imageEventId, 'profile-images');

			// Generate translations for profile content (professionalTitle and about)
			const { generateProfileTranslations } = await import('$lib/nostr/profile');
			const profileTranslations = await generateProfileTranslations({
				professionalTitle,
				about: profileDescription
			});

			// Prepare profile data - only include fields that are being edited
			// The publishProfileMetadata function will merge with existing metadata
			const profileData: NostrProfile = {
				display_name: displayName,
				professionalTitle,
				about: profileDescription,
				website,
				...(profileTranslations && { translations: profileTranslations })
			};

			// Publish profile metadata with retry logic
			// Pass existing metadata to preserve picture, banner, etc.
			await publishProfileMetadata(profileData, existingMetadata);

			// Notify completion change from save (triggers toast in parent)
			onComplete(isComplete, true);

			// if (imagesToDelete.length > 0) {
			// 	await Promise.all(imagesToDelete.map((key) => uploadService.deleteFile(key)));
			// }
		} catch (err) {
			console.error('Failed to update profile:', err);
			error = err instanceof Error ? err.message : $t('profile_personal.failed_to_update');
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isInitialLoading}
	<div class="space-y-6">
		<!-- Profile Pictures Skeleton -->
		<div class="space-y-4">
			<div>
				<div class="bg-base-300 h-6 w-48 animate-pulse rounded"></div>
				<div class="bg-base-300 mt-1 h-4 w-64 animate-pulse rounded"></div>
			</div>
			<div class="border-base-300 bg-base-200 h-32 animate-pulse rounded-lg border"></div>
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

		<!-- Website Skeleton -->
		<div class="space-y-2">
			<div class="bg-base-300 h-4 w-16 animate-pulse rounded"></div>
			<div class="bg-base-300 h-12 w-full animate-pulse rounded"></div>
		</div>

		<!-- Profile Description Skeleton -->
		<div class="space-y-2">
			<div class="bg-base-300 h-4 w-36 animate-pulse rounded"></div>
			<div class="bg-base-300 h-32 w-full animate-pulse rounded"></div>
		</div>

		<!-- Submit Button Skeleton -->
		<div class="flex justify-end">
			<div class="bg-base-300 h-12 w-48 animate-pulse rounded"></div>
		</div>
	</div>
{:else}
	<form onsubmit={handleSubmit} class="space-y-6">
		<!-- Profile Pictures -->
		<div class="space-y-4">
			<div>
				<span class="text-base-content/80 block font-medium"
					>{$t('profile_personal.photosLimit')}</span
				>
				<span class="text-base-content/70 block whitespace-normal">
					{$t('profile_personal.primaryPhotoNote')}
				</span>
			</div>

			<MediaUploader
				id="profile-personal"
				label={$t('profile_personal.add_images')}
				maxFiles={5}
				maxFileSize={2}
				enablePhotoMenu={true}
				uploadFolder="profile"
				className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32"
				files={displayFiles}
				onChange={(results) => {
					uploadResults = results;
				}}
				onRemove={(index) => handleFileRemove(index)}
			/>

			{#if error}
				<div class="text-error text-sm mt-2">{error}</div>
			{/if}
		</div>

		<!-- Display Name -->
		<div class="form-control">
			<label class="label" for="displayName">
				<span class="label-text">{$t('profile_personal.displayName')}</span>
			</label>
			<input
				type="text"
				id="displayName"
				bind:value={displayName}
				class="input input-bordered mt-1 w-full"
				placeholder={$t('profile_personal.displayName')}
			/>
		</div>

		<!-- Professional Title -->
		<div class="form-control">
			<label class="label" for="professionalTitle">
				<span class="label-text">{$t('profile_personal.professionalTitle')}</span>
			</label>
			<input
				type="text"
				id="professionalTitle"
				bind:value={professionalTitle}
				class="input input-bordered mt-1 w-full"
				placeholder={$t('profile_personal.professional_title_placeholder')}
			/>
		</div>

		<!-- Website -->
		<div class="form-control">
			<label class="label" for="website">
				<span class="label-text">{$t('profile_personal.website')}</span>
			</label>
			<input
				type="url"
				id="website"
				bind:value={website}
				class="input input-bordered mt-1 w-full"
				placeholder={$t('profile_personal.website_placeholder')}
			/>
		</div>

		<!-- Profile Description -->
		<div class="form-control">
			<label class="label" for="profileDescription">
				<span class="label-text">{$t('profile_personal.profileDescription')}</span>
			</label>
			<textarea
				id="profileDescription"
				bind:value={profileDescription}
				class="textarea textarea-bordered h-32 w-full rounded-xl"
				placeholder={$t('profile_personal.profileDescriptionPlaceholder')}
				maxlength="2000"
				rows="4"
			></textarea>
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="alert alert-error alert-outline">
				<span>{error}</span>
			</div>
		{/if}

		<!-- Submit Button -->
		<div class="flex justify-end">
			<button type="submit" class="btn btn-primary" disabled={isLoading}>
				{#if isLoading}
					<span class="loading loading-spinner"></span>
				{/if}
				{$t('profile_personal.savePersonalInfo')}
			</button>
		</div>
	</form>
{/if}
