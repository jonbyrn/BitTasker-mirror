<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { Attachment } from '$lib/types/task';
	import { get } from 'svelte/store';
	import uploadService from '$lib/api/services/upload.service';
	import { compressImage, validateImageFile } from '$lib/utils/imageCompression';
	import { t } from 'svelte-i18n';

	let { errors, direction, attachmentsToRemove = $bindable([]) } = $props();

	// File upload state
	let isUploading = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });
	let error = $state('');
	
	// Store object URLs for immediate preview (will be cleaned up)
	let filePreviewUrls = $state<Map<File, string>>(new Map());

	onMount(() => {
		if (!$store.service.portfolio) {
			store.updateService({
				portfolio: []
			});
		}
	});

	onDestroy(() => {
		filePreviewUrls.forEach((url) => {
			URL.revokeObjectURL(url);
		});
		filePreviewUrls.clear();
	});

	// Validate file (no compression - compression will happen on publish)
	async function validateFile(file: File): Promise<boolean> {
		const isImageFile = file.type.startsWith('image/');
		const isVideoFile = file.type.startsWith('video/');

		if (!isImageFile && !isVideoFile) {
			error = $t('common.components.media_uploader.invalid_file_type_images_videos');
			return false;
		}

		// Validate image files (basic validation only)
		if (isImageFile) {
			const validation = validateImageFile(file);
			if (!validation.isValid) {
				error = validation.error || $t('common.components.media_uploader.invalid_image');
				return false;
			}
		}

		// Validate video files
		if (isVideoFile) {
			const fileSizeMB = file.size / (1024 * 1024);
			const maxSizeMB = 50;
			if (fileSizeMB > maxSizeMB) {
				const template = $t('common.components.media_uploader.video_file_too_large');
				error = template
					.replace(/\{fileName\}/g, file.name)
					.replace(/\{actualSize\}/g, fileSizeMB.toFixed(2))
					.replace(/\{maxSize\}/g, maxSizeMB.toString());
				return false;
			}
		}

		return true;
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		const totalFiles = ($store.service.portfolio?.length || 0) + (get(store).pendingFiles?.length || 0);
		if (totalFiles + selectedFiles.length > 10) {
			error = $t('dashboard.services.create.portfolio.max_files_limit', { values: { maxFiles: 10 } });
			return;
		}

		const selectedFilesArray = Array.from(selectedFiles);
		const validFiles: File[] = [];
		let hasErrors = false;

		// Validate files (no compression)
		for (const file of selectedFilesArray) {
			const isValid = await validateFile(file);
			if (!isValid) {
				hasErrors = true;
				break;
			}
			validFiles.push(file);
			
			// Create object URL for immediate preview
			if (file.type.startsWith('image/')) {
				const objectUrl = URL.createObjectURL(file);
				filePreviewUrls.set(file, objectUrl);
			}
		}

		if (hasErrors) {
			return;
		}

		// Add files to pending (they will be shown immediately with object URLs)
		store.updateStore({ pendingFiles: [...(get(store).pendingFiles || []), ...validFiles] });
		error = '';
		
		// Reset file input
		input.value = '';

		// Upload files immediately
		await uploadPendingFiles();
	}

	function removeFile(index: number) {
		const allFiles = [...($store.service.portfolio || []), ...(get(store).pendingFiles || [])];
		const file = allFiles[index];

		if (file && typeof file === 'object' && 'url' in file) {
			// Remove from portfolio (already uploaded)
			const attachment = $store.service.portfolio?.find((att) => att.url === file.url);
			if (attachment) {
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				const portfolioIndex = $store.service.portfolio?.findIndex((att) => att.url === file.url);
				if (portfolioIndex !== undefined && portfolioIndex >= 0) {
					const newPortfolio = [...($store.service.portfolio || [])];
					newPortfolio.splice(portfolioIndex, 1);
					store.updateService({ portfolio: newPortfolio });
				}
			}
		} else if (file instanceof File) {
			// Remove from pending files and cleanup object URL
			const pendingIndex = index - ($store.service.portfolio?.length || 0);
			if (pendingIndex >= 0 && pendingIndex < (get(store).pendingFiles?.length || 0)) {
				const newPendingFiles = [...(get(store).pendingFiles || [])];
				const removedFile = newPendingFiles[pendingIndex];
				newPendingFiles.splice(pendingIndex, 1);
				store.updateStore({ pendingFiles: newPendingFiles });
				
				// Cleanup object URL
				const objectUrl = filePreviewUrls.get(removedFile);
				if (objectUrl) {
					URL.revokeObjectURL(objectUrl);
					filePreviewUrls.delete(removedFile);
				}
			}
		}
	}

	// Compress and upload pending files (called immediately when files are selected)
	async function uploadPendingFiles(): Promise<Attachment[]> {
		if (!get(store).pendingFiles || get(store).pendingFiles.length === 0) {
			return [];
		}

		isUploading = true;
		uploadProgress = { completed: 0, total: get(store).pendingFiles.length, currentFile: '' };

		try {
			// Compress images before uploading
			const filesToUpload: File[] = [];
			for (let i = 0; i < get(store).pendingFiles.length; i++) {
				const file = get(store).pendingFiles[i];
				uploadProgress = {
					completed: i,
					total: get(store).pendingFiles.length,
					currentFile: file.name
				};

				if (file.type.startsWith('image/')) {
					try {
						const compressionResult = await compressImage(file, {
							maxSizeMB: 200,
							maxWidthOrHeight: 3840,
							quality: 0.8,
							fileType: 'image/webp'
						});
						filesToUpload.push(compressionResult.file);
					} catch (err) {
						console.error('Compression failed for', file.name, err);
						// If compression fails, use original file
						filesToUpload.push(file);
					}
				} else {
					// Videos are uploaded as-is
					filesToUpload.push(file);
				}
			}

			const uploadOptions = {
				folder: 'services/portfolio',
				useCloudflare: true,
				enableCompression: false, // Already compressed
				generateVariants: true,
				metadata: {
					uploadedAt: new Date().toISOString(),
					clientCompressed: true
				}
			};

			const results = await uploadService.uploadMultipleFiles(
				filesToUpload,
				uploadOptions,
				(completed, total, currentFile) => {
					uploadProgress = { completed, total, currentFile };
				}
			);

			const attachments: Attachment[] = results.map((result, index) => {
				const originalFile = get(store).pendingFiles[index];
				const fileName = originalFile?.name || result.url.split('/').pop() || 'file';
				
				return {
					url: result.url,
					key: result.key,
					type: result.type === 'image' ? 'image/*' : result.type === 'video' ? 'video/*' : 'document',
					alt: fileName,
					size: result.size
				};
			});

			// Add to portfolio
			const currentPortfolio = $store.service.portfolio || [];
			store.updateService({
				portfolio: [...currentPortfolio, ...attachments]
			});

			// Cleanup object URLs for uploaded files
			get(store).pendingFiles.forEach((file) => {
				const objectUrl = filePreviewUrls.get(file);
				if (objectUrl) {
					URL.revokeObjectURL(objectUrl);
					filePreviewUrls.delete(file);
				}
			});

			// Clear pending files
			store.updateStore({ pendingFiles: [] });

			return attachments;
		} catch (err) {
			console.error('Upload failed:', err);
			error = $t('common.components.media_uploader.upload_failed');
			return [];
		} finally {
			isUploading = false;
			uploadProgress = { completed: 0, total: 0, currentFile: '' };
		}
	}
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label class="label" for="portfolio-title">
			<span class="label-text-alt">{$t('dashboard.services.create.portfolio.hint')}</span>
		</label>
	</div>

	<!-- File Upload Input -->
	<div class="w-full">
		<label for="portfolio-upload" class="btn btn-outline btn-primary w-full cursor-pointer" id="portfolio-upload-button">
			{$t('dashboard.services.create.portfolio.upload_button')}
			<input
				type="file"
				id="portfolio-upload"
				class="hidden"
				accept="image/*,video/*"
				multiple
				onchange={handleFileChange}
			/>
		</label>
	</div>

	<!-- Upload Progress (only shown when publishing) -->
	{#if isUploading}
		<div class="alert alert-outline alert-info">
			<span class="loading loading-spinner loading-sm"></span>
			<span>
				{$t('dashboard.services.create.portfolio.uploading')} ({uploadProgress.completed}/
				{uploadProgress.total})
				{#if uploadProgress.currentFile}
					- {uploadProgress.currentFile}
				{/if}
			</span>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-outline alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Portfolio Items Grid -->
	{#if ($store.service.portfolio || []).length > 0 || (get(store).pendingFiles || []).length > 0}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
			{#each [...($store.service.portfolio || []), ...(get(store).pendingFiles || [])] as file, index}
				<div class="relative aspect-square overflow-hidden rounded-lg border border-base-300">
					{#if file && typeof file === 'object' && 'url' in file}
						<!-- Already uploaded - show from URL -->
						{@const fileType = file.type || ''}
						{#if fileType === 'image/*' || fileType.startsWith('image/')}
							<img
								src={file.url}
								alt={file.alt || $t('dashboard.services.create.portfolio.item_alt')}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else if fileType === 'video/*' || fileType.startsWith('video/')}
							<div class="flex h-full w-full flex-col items-center justify-center bg-base-200 p-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-12 w-12 text-base-content/50 mb-2"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
								<span class="text-xs text-base-content/70 text-center line-clamp-2">{file.alt || 'Video'}</span>
							</div>
						{:else}
							<div class="flex h-full w-full items-center justify-center bg-base-200">
								<span class="text-xs text-base-content/70">{file.alt || 'File'}</span>
							</div>
						{/if}
					{:else if file instanceof File}
						<!-- Pending file - show preview with object URL -->
						{#if file.type.startsWith('image/')}
							{@const previewUrl = filePreviewUrls.get(file)}
							{#if previewUrl}
								<img
									src={previewUrl}
									alt={file.name}
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center bg-base-200">
									<span class="loading loading-spinner loading-md"></span>
								</div>
							{/if}
						{:else if file.type.startsWith('video/')}
							<div class="flex h-full w-full flex-col items-center justify-center bg-base-200 p-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-12 w-12 text-base-content/50 mb-2"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
								<span class="text-xs text-base-content/70 text-center line-clamp-2">{file.name}</span>
							</div>
						{:else}
							<div class="flex h-full w-full items-center justify-center bg-base-200">
								<span class="text-xs text-base-content/70">{file.name}</span>
							</div>
						{/if}
					{/if}
					<button
						class="btn btn-sm btn-error absolute right-2 top-2"
						onclick={() => removeFile(index)}
						title={$t('dashboard.services.create.portfolio.remove')}
					>
						✕
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="alert alert-outline alert-info" id="portfolio-empty-message">
			<span>{$t('dashboard.services.create.portfolio.empty_message')}</span>
		</div>
	{/if}

	{#if errors.portfolio}
		<span class="label-text-alt text-error block">{errors.portfolio}</span>
	{/if}
</div>

