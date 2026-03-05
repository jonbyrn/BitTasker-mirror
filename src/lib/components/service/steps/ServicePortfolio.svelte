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
	<!-- Same compact layout as create-task (TaskBudget): one grid with thumbnails + one upload cell -->
	<div class="w-full">
		<label for="portfolio-upload" class="label block text-lg font-semibold">
			{$t('dashboard.services.create.portfolio.title_media')}
		</label>
		<label for="portfolio-upload" class="label-text-alt block text-base-content/70">
			{$t('dashboard.services.create.portfolio.description_media')}
		</label>
	</div>

	<div class="space-y-4">
		<div
			class="grid grid-cols-2 justify-start gap-6 sm:grid-cols-4 sm:gap-8 md:grid-cols-6 lg:grid-cols-8"
		>
			{#each [...($store.service.portfolio || []), ...(get(store).pendingFiles || [])] as file, index}
				<div class="relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32">
					<div class="h-full w-full overflow-hidden rounded-lg border border-base-300">
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
					</div>
					<button
						type="button"
						class="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-error p-1 text-error-content shadow-md hover:opacity-90"
						onclick={() => removeFile(index)}
						title={$t('dashboard.services.create.portfolio.remove')}
						aria-label={$t('dashboard.services.create.portfolio.remove')}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				</div>
			{/each}

			{#if (($store.service.portfolio || []).length + (get(store).pendingFiles || []).length) < 10 && !isUploading}
				<div class="relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32">
					<label
						for="portfolio-upload"
						class="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-base-300 bg-base-200 p-2 text-center transition hover:bg-base-300"
					>
						<svg
							class="mb-1 h-6 w-6 sm:mb-2 sm:h-8 sm:w-8 text-base-content/70"
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
						<p class="mb-1 text-xs font-semibold sm:text-sm">{$t('dashboard.services.create.portfolio.upload_label')}</p>
						<p class="text-[8px] sm:text-xs text-base-content/70">
							{$t('dashboard.services.create.portfolio.file_types')} {$t('dashboard.services.create.portfolio.max_duration')}
						</p>
						<p class="text-center text-[8px] whitespace-normal sm:px-1 sm:text-xs text-base-content/70">
							{$t('dashboard.services.create.portfolio.max_size')}
						</p>
						<input
							id="portfolio-upload"
							type="file"
							class="hidden"
							accept="image/*,video/*"
							multiple
							onchange={handleFileChange}
						/>
					</label>
				</div>
			{/if}
		</div>

		{#if isUploading}
			<div class="space-y-2">
				<div class="text-info text-sm">
					{$t('dashboard.services.create.portfolio.uploading')} {uploadProgress.currentFile}
				</div>
				<div class="h-2 w-full rounded-full bg-base-300">
					<div
						class="bg-info h-2 rounded-full transition-all duration-300"
						style="width: {uploadProgress.total > 0 ? (uploadProgress.completed / uploadProgress.total) * 100 : 0}%"
					></div>
				</div>
				<div class="text-xs text-base-content/60">
					{uploadProgress.completed} / {uploadProgress.total}
				</div>
			</div>
		{/if}

		{#if error}
			<div class="text-error text-sm">{error}</div>
		{/if}
	</div>

	{#if errors.portfolio}
		<span class="label-text-alt text-error block">{errors.portfolio}</span>
	{/if}
</div>

