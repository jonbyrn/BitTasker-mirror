<script lang="ts">
	import type { NostrProfile, NostrProfileImage } from '$lib/types/profile.d';
	import { t, locale } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import { publishMultipleImages, subscribeToProfileUpdates } from '$lib/nostr/profile';
	import { publishProfileMetadata } from '$lib/nostr/profile';
	import { compressImage, validateImageFile } from '$lib/utils/imageCompression';
	import uploadService from '$lib/api/services/upload.service';
	import KINDS from '$lib/utils/constants/kinds';
	import { user } from '$lib/stores/user.store';
	import { markPrimaryImage, profilePictureFromImages } from '$lib/utils/profile/profile-picture';

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
	let pictures = $state<(NostrProfileImage | File)[]>([]);
	let pendingFiles = $state<File[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let imageEventId = $state<string | null>(null); // Track the current image event ID
	let imagesToDelete = $state<string[]>([]);
	let cleanup: (() => void) | null = null;

	// Store complete existing metadata to preserve fields we don't edit
	let existingMetadata = $state<NostrProfile>({});

	// File upload state
	let isUploading = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });
	let isCompressing = $state(false);
	let compressionProgress = $state({ processed: 0, total: 0, currentFile: '' });

	// Combined files for display
	let allFiles = $derived([...pictures, ...pendingFiles]);

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
						professionalTitle =
							getTranslatedContent(metadata, 'professionalTitle') || professionalTitle;
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
		displayName && professionalTitle && profileDescription && website && pictures.length > 0
	);

	// Track form completion
	$effect(() => {
		onComplete(isComplete);
	});

	// File handling functions
	async function validateAndProcessFile(file: File): Promise<File | null> {
		try {
			// Validate file
			const validationResult = validateImageFile(file);

			if (!validationResult.isValid) {
				error = validationResult.error || $t('common.components.media_uploader.invalid_file');
				return null;
			}

			// Compress image if it's an image file
			if (file.type.startsWith('image/')) {
				const compressionResult = await compressImage(file, {
					maxSizeMB: 2,
					maxWidthOrHeight: 1920,
					initialQuality: 0.8
				});

				return compressionResult.file;
			}

			return file;
		} catch (err) {
			console.error('File processing error:', err);
			error = $t('common.components.media_uploader.processing_error');
			return null;
		}
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		const totalFiles = allFiles.length;
		if (totalFiles + selectedFiles.length > 5) {
			error = $t('common.components.media_uploader.max_files_limit', { values: { maxFiles: 5 } });
			return;
		}

		const selectedFilesArray = Array.from(selectedFiles);
		const hasImages = selectedFilesArray.some((file) => file.type.startsWith('image/'));

		if (hasImages) {
			isCompressing = true;
			compressionProgress = { processed: 0, total: selectedFilesArray.length, currentFile: '' };
		}

		const processedFiles: File[] = [];
		let hasErrors = false;

		for (let i = 0; i < selectedFilesArray.length; i++) {
			const file = selectedFilesArray[i];

			if (hasImages) {
				compressionProgress = {
					processed: i,
					total: selectedFilesArray.length,
					currentFile: file.name
				};
			}

			const processedFile = await validateAndProcessFile(file);
			if (!processedFile) {
				hasErrors = true;
				break;
			}
			processedFiles.push(processedFile);
		}

		if (hasImages) {
			isCompressing = false;
			compressionProgress = {
				processed: selectedFilesArray.length,
				total: selectedFilesArray.length,
				currentFile: ''
			};
		}

		if (hasErrors) {
			return;
		}

		pendingFiles = [...pendingFiles, ...processedFiles];
		error = '';
	}

	function removeFile(index: number) {
		const fileToRemove = allFiles[index];

		if (fileToRemove instanceof File) {
			// Remove from pending files
			const fileIndex = pendingFiles.indexOf(fileToRemove);
			if (fileIndex !== -1) {
				pendingFiles = pendingFiles.filter((_, i) => i !== fileIndex);
			}
		} else {
			// Remove from existing pictures and mark for deletion
			imagesToDelete.push(fileToRemove.key);
			pictures = pictures.filter((_, i) => i !== index);
		}
	}

	async function uploadPendingFiles(): Promise<NostrProfileImage[]> {
		if (pendingFiles.length === 0) {
			return [];
		}

		isUploading = true;
		uploadProgress = { completed: 0, total: pendingFiles.length, currentFile: '' };

		try {
			const uploadOptions = {
				folder: 'profile',
				useCloudflare: true,
				enableCompression: false,
				generateVariants: true,
				metadata: {
					uploadedAt: new Date().toISOString(),
					clientCompressed: true
				}
			};

			const results = await uploadService.uploadMultipleFiles(
				pendingFiles,
				uploadOptions,
				(completed, total, currentFile) => {
					uploadProgress = { completed, total, currentFile };
				}
			);

			const uploadedImages: NostrProfileImage[] = results.map((result) => ({
				key: result.key,
				url: result.url,
				type: result.type === 'image' ? 'image/*' : 'image/jpeg',
				alt: result.key,
				size: result.size
			}));

			pictures = [...pictures, ...uploadedImages];
			pendingFiles = [];

			return uploadedImages;
		} catch (err) {
			console.error('Upload failed:', err);
			error = $t('common.components.media_uploader.upload_failed', {
				values: { error: (err as Error).message }
			});
			throw err;
		} finally {
			isUploading = false;
			uploadProgress = { completed: 0, total: 0, currentFile: '' };
		}
	}

	function getFilePreview(file: File | NostrProfileImage | Blob): string {
		if (file instanceof File || file instanceof Blob) {
			return URL.createObjectURL(file);
		}
		if (file && typeof file === 'object' && 'url' in file) {
			return file.url;
		}
		return '';
	}

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// Upload any pending files first
			if (pendingFiles.length > 0) {
				await uploadPendingFiles();
			}

			// Get all existing images (no File objects should remain at this point)
			const existingImages = pictures.filter((picture) => {
				return !(picture instanceof File);
			}) as NostrProfileImage[];

			const publishedImages = markPrimaryImage(existingImages);
			const picture = profilePictureFromImages(publishedImages);

			// Publish new images event, passing the existing event ID if we have one
			await publishMultipleImages(publishedImages, imageEventId, 'profile-images');

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
				...(picture ? { picture } : {}),
				...(profileTranslations && { translations: profileTranslations })
			};

			// Publish profile metadata with retry logic
			// Pass existing metadata to preserve picture, banner, etc.
			await publishProfileMetadata(profileData, existingMetadata);
			if (picture) user.updateProfile({ picture });

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

			<!-- File Upload Grid -->
			<div class="space-y-4">
				<div
					class="grid grid-cols-3 justify-start gap-6 sm:grid-cols-4 sm:gap-36 md:grid-cols-6 lg:grid-cols-8"
				>
					{#each allFiles as file, index (`${index}-${file instanceof File ? file.name : (file.url ?? '')}`)}
						<div class="relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32">
							<img
								src={getFilePreview(file)}
								alt={$t('common.components.media_uploader.preview')}
								class="h-full w-full rounded-lg object-cover"
							/>
							<button
								aria-label={$t('common.components.media_uploader.remove_file')}
								type="button"
								class="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white p-1 text-black shadow-md hover:bg-gray-100"
								onclick={() => removeFile(index)}
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

					{#if allFiles.length < 5 && !isUploading}
						<!-- Upload Button -->
						<div class="relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32">
							<label
								for="file-upload-profile-pictures"
								class="bg-base-200 hover:bg-base-300 flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-white/50 p-2 text-center transition"
							>
								<svg
									class="mb-1 h-6 w-6 sm:mb-2 sm:h-8 sm:w-8"
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 20 16"
								>
									<path
										stroke="currentColor"
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
									/>
								</svg>
								<p class="mb-1 text-xs font-semibold sm:text-sm">
									{$t('profile_personal.add_images')}
								</p>
								<p class="text-[8px] sm:text-xs">
									{$t('common.components.media_uploader.images')} (Max. 2MB)
								</p>
								<input
									id="file-upload-profile-pictures"
									type="file"
									class="hidden"
									accept="image/*"
									multiple
									onchange={handleFileChange}
								/>
							</label>
						</div>
					{/if}
				</div>

				<!-- Error -->
				{#if error}
					<div class="text-error text-sm">{error}</div>
				{/if}

				<!-- Compression Progress -->
				{#if isCompressing}
					<div class="text-info text-sm">
						{$t('common.components.media_uploader.compressing')}: {compressionProgress.currentFile}
						({compressionProgress.processed}/{compressionProgress.total})
					</div>
				{/if}

				<!-- Upload Progress -->
				{#if isUploading}
					<div class="text-info text-sm">
						{$t('common.components.media_uploader.uploading')}: {uploadProgress.currentFile}
						({uploadProgress.completed}/{uploadProgress.total})
					</div>
				{/if}
			</div>
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
