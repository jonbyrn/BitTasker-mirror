<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore } from '$lib/stores/service.store';
	import { browser } from '$app/environment';
	import { compressImage, validateImageFile } from '$lib/utils/imageCompression';
	import uploadService from '$lib/api/services/upload.service';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import VideoUploader from '$lib/components/VideoUploader.svelte';

	let { errors, direction, attachmentsToRemove = $bindable([]) } = $props();

	// File upload state
	let isUploading = $state(false);
	let fileUploadProgress = new SvelteMap<File, { status: string; progress: number }>();
	let error = $state('');

	// Store object URLs for immediate preview (will be cleaned up)
	let filePreviewUrls = new SvelteMap<File, string>();

	// Video files pending per-file VideoUploader processing
	let pendingVideoUploads = $state<File[]>([]);

	// Unified grid items in insertion order (preserves the order items were added)
	let allGridItems = $state<(Attachment | File)[]>([]);

	// Inline video playback state
	let playingVideoKey = $state<string | null>(null);

	// Custom thumbnail upload state
	let customThumbnails = $state<Record<string, string>>({}); // uid -> thumbnailUrl
	let thumbnailTargetUid = $state<string | null>(null);
	let isUploadingThumbnail = $state(false);

	const customerCode = browser ? import.meta.env.VITE_STREAM_CUSTOMER_CODE : '';

	onMount(() => {
		if (!$serviceStore.service.portfolio) {
			serviceStore.updateService({
				portfolio: []
			});
		}
		allGridItems = [...($serviceStore.service.portfolio || [])];
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

	// Thumbnail upload for video portfolio items
	async function handleThumbnailUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		const uid = thumbnailTargetUid;
		if (!file || !uid) return;

		isUploadingThumbnail = true;
		try {
			const compressed = await compressImage(file, {
				maxSizeMB: 2,
				maxWidthOrHeight: 3840,
				quality: 0.8,
				fileType: 'image/webp'
			});
			const result = await uploadService.uploadSingleFile(compressed.file, {
				folder: 'thumbnails',
				useCloudflare: true,
				enableCompression: false,
				generateVariants: true,
				metadata: {
					uploadedAt: new Date().toISOString(),
					sourceVideoUid: uid
				}
			});
			customThumbnails[uid] = result.url;
			error = '';
		} catch (err) {
			console.error('Thumbnail upload failed:', err);
			error = 'Failed to upload thumbnail';
		} finally {
			isUploadingThumbnail = false;
			thumbnailTargetUid = null;
			input.value = '';
		}
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		const totalFiles =
			($serviceStore.service.portfolio?.length || 0) +
			($serviceStore.pendingFiles?.length || 0) +
			pendingVideoUploads.length;
		if (totalFiles + selectedFiles.length > 10) {
			error = $t('dashboard.services.create.portfolio.max_files_limit', {
				values: { maxFiles: 10 }
			});
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

		const imageFiles = validFiles.filter((f) => f.type.startsWith('image/'));
		const videoFiles = validFiles.filter((f) => f.type.startsWith('video/'));

		// Append all files to the grid in picker order (not split by type)
		allGridItems = [...allGridItems, ...validFiles];

		// Route each type to its upload path
		if (imageFiles.length > 0) {
			serviceStore.updateStore({
				pendingFiles: [...($serviceStore.pendingFiles || []), ...imageFiles]
			});
		}

		// Route video files to per-file VideoUploader
		if (videoFiles.length > 0) {
			pendingVideoUploads = [...pendingVideoUploads, ...videoFiles];
		}
		error = '';

		// Reset file input
		input.value = '';

		// Upload files immediately
		await uploadPendingFiles();
	}

	function removeFile(index: number) {
		const file = allGridItems[index];
		if (!file) return;

		if (typeof file === 'object' && 'url' in file) {
			// Remove from portfolio (already uploaded)
			const attachment = file as Attachment;
			attachmentsToRemove = [...attachmentsToRemove, attachment];
			const portfolioIndex = $serviceStore.service.portfolio?.findIndex(
				(att) => att.url === attachment.url
			);
			if (portfolioIndex !== undefined && portfolioIndex >= 0) {
				const newPortfolio = [...($serviceStore.service.portfolio || [])];
				newPortfolio.splice(portfolioIndex, 1);
				serviceStore.updateService({ portfolio: newPortfolio });
			}
		} else if (file instanceof File) {
			// Check if it's a pending image
			const pendingFiles = $serviceStore.pendingFiles || [];
			const pendingIndex = pendingFiles.findIndex((f) => f === file);
			if (pendingIndex >= 0) {
				// Remove from pending files and cleanup object URL
				const newPendingFiles = [...pendingFiles];
				newPendingFiles.splice(pendingIndex, 1);
				serviceStore.updateStore({ pendingFiles: newPendingFiles });

				// Cleanup object URL
				const objectUrl = filePreviewUrls.get(file);
				if (objectUrl) {
					URL.revokeObjectURL(objectUrl);
					filePreviewUrls.delete(file);
				}
			} else {
				// Remove from pending video uploads
				pendingVideoUploads = pendingVideoUploads.filter((f) => f !== file);
			}
		}

		// Remove from grid
		allGridItems = allGridItems.filter((_, i) => i !== index);
	}

	// Video upload handler — called when VideoUploader encoding completes.
	// Returns the attachment only; the caller is responsible for updating
	// both allGridItems and service.portfolio in the correct order.
	function handleVideoReady(result: {
		uid: string;
		thumbnailUrl: string;
		hlsUrl: string;
		duration: number;
		size: number;
		filename: string;
	}): Attachment | undefined {
		if (($serviceStore.service.portfolio?.length || 0) >= 10) return;

		return {
			url: result.hlsUrl,
			key: result.uid,
			type: 'video/*',
			alt: result.filename,
			size: result.size,
			cloudflareId: result.uid
		};
	}

	// Stable key for grid items to preserve identity across re-renders
	function getFileKey(file: Attachment | File): string {
		if ('url' in file) {
			return (file as Attachment).key || (file as Attachment).url;
		}
		return `${file.name}-${file.size}-${file.lastModified}`;
	}

	// Compress and upload pending files (called immediately when files are selected)
	async function uploadPendingFiles(): Promise<Attachment[]> {
		const pendingFiles = $serviceStore.pendingFiles;
		if (!pendingFiles || pendingFiles.length === 0) {
			return [];
		}

		isUploading = true;

		// Initialize per-file upload progress map
		const progressMap = new SvelteMap<File, { status: 'uploading' | 'done'; progress: number }>();
		for (const file of pendingFiles) {
			if (file instanceof File) {
				progressMap.set(file, { status: 'uploading', progress: 0 });
			}
		}
		fileUploadProgress.clear();
		for (const [k, v] of progressMap) fileUploadProgress.set(k, v);

		try {
			// Compress images before uploading
			const filesToUpload: File[] = [];
			for (let i = 0; i < pendingFiles.length; i++) {
				const file = pendingFiles[i];
				if (!(file instanceof File)) {
					filesToUpload.push(file);
					continue;
				}

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
				(completed, _total, _currentFile) => {
					// Mark completed files as done
					for (let i = 0; i < completed && i < pendingFiles.length; i++) {
						const f = pendingFiles[i];
						if (f instanceof File) {
							progressMap.set(f, { status: 'done', progress: 100 });
						}
					}
					fileUploadProgress.clear();
					for (const [k, v] of progressMap) fileUploadProgress.set(k, v);
				}
			);

			const attachments: Attachment[] = results.map((result, index) => {
				const originalFile = pendingFiles[index];
				const fileName = originalFile?.name || result.url.split('/').pop() || 'file';

				const attachment: Attachment = {
					url: result.url,
					key: result.key,
					type:
						result.type === 'image' ? 'image/*' : result.type === 'video' ? 'video/*' : 'document',
					alt: fileName,
					size: result.size
				};

				if (result.cloudflareId) {
					attachment.cloudflareId = result.cloudflareId;
				}

				return attachment;
			});

			// Replace pending files in allGridItems with their uploaded attachments,
			// preserving picker order via in-place index replacement
			let updatedGridItems = allGridItems;
			for (let i = 0; i < pendingFiles.length; i++) {
				const file = pendingFiles[i];
				const attachment = attachments[i];
				if (file && attachment) {
					const idx = updatedGridItems.indexOf(file);
					if (idx >= 0) {
						updatedGridItems = updatedGridItems.with(idx, attachment);
					}
				}
			}
			allGridItems = updatedGridItems;

			// Rebuild portfolio from allGridItems order (preserves picker order)
			serviceStore.updateService({
				portfolio: updatedGridItems.filter(
					(item): item is Attachment => typeof item === 'object' && 'url' in item
				)
			});

			// Cleanup object URLs for uploaded files
			pendingFiles.forEach((file) => {
				const objectUrl = filePreviewUrls.get(file);
				if (objectUrl) {
					URL.revokeObjectURL(objectUrl);
					filePreviewUrls.delete(file);
				}
			});

			// Clear pending files
			serviceStore.updateStore({ pendingFiles: [] });

			return attachments;
		} catch (err) {
			console.error('Upload failed:', err);
			error = $t('common.components.media_uploader.upload_failed');
			return [];
		} finally {
			isUploading = false;
			fileUploadProgress.clear();
		}
	}
</script>

<div
	class="min-w-0 space-y-6"
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
		<label for="portfolio-upload" class="label-text-alt text-base-content/70 block">
			{$t('dashboard.services.create.portfolio.description_media')}
		</label>
	</div>

	<div class="space-y-4">
		<div class="grid grid-cols-2 justify-start gap-6 sm:grid-cols-3 md:grid-cols-4">
			{#each allGridItems as file, index (getFileKey(file))}
				<div
					class="relative aspect-square h-24 w-full sm:h-28 md:h-32"
					transition:fly={{ y: 10, duration: 150 }}
				>
					<div class="border-base-300 h-full w-full overflow-hidden rounded-lg border">
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
								{#if playingVideoKey === file.key}
									<!-- Inline video playback -->
									<StreamPlayer
										videoUid={file.cloudflareId || file.key}
										poster={customThumbnails[file.key] ||
											(customerCode && file.key
												? `https://customer-${customerCode}.cloudflarestream.com/${file.key}/thumbnails/thumbnail.jpg`
												: null)}
										controls={true}
										autoplay={true}
										aspectRatio="video"
										className="h-full w-full"
									/>
								{:else}
									<button
										type="button"
										class="relative h-full w-full cursor-pointer overflow-hidden"
										onclick={() => {
											playingVideoKey = file.key;
										}}
									>
										{#if customerCode && file.key}
											<img
												src={`https://customer-${customerCode}.cloudflarestream.com/${file.key}/thumbnails/thumbnail.jpg`}
												alt={file.alt || $t('dashboard.services.create.portfolio.video_label')}
												class="h-full w-full object-cover"
												loading="lazy"
											/>
										{:else}
											<div
												class="bg-base-200 flex h-full w-full flex-col items-center justify-center p-2"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="text-base-content/50 mb-2 h-12 w-12"
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
												<span class="text-base-content/70 line-clamp-2 text-center text-xs"
													>{file.alt || $t('dashboard.services.create.portfolio.video_label')}</span
												>
											</div>
										{/if}
										<div class="absolute inset-0 flex items-center justify-center bg-black/30">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-10 w-10 text-white"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path d="M8 5v14l11-7z" />
											</svg>
										</div>
										{#if file.key}
											<!-- Thumbnail upload button -->
											<div
												role="button"
												tabindex="0"
												class="bg-base-100/80 hover:bg-base-100 absolute right-1 bottom-1 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full p-1 shadow-md"
												onclick={(e) => {
													e.stopPropagation();
													thumbnailTargetUid = file.key;
													const input = document.getElementById(
														'thumbnail-upload-input'
													) as HTMLInputElement;
													input?.click();
												}}
												onkeydown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.stopPropagation();
														thumbnailTargetUid = file.key;
														const input = document.getElementById(
															'thumbnail-upload-input'
														) as HTMLInputElement;
														input?.click();
													}
												}}
												title="Upload custom thumbnail"
												aria-label="Upload custom thumbnail"
											>
												{#if isUploadingThumbnail && thumbnailTargetUid === file.key}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-3.5 w-3.5"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
													>
														<path
															d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
														/>
														<circle cx="12" cy="13" r="4" />
													</svg>
												{/if}
											</div>
										{/if}
									</button>
								{/if}
							{:else}
								<div class="bg-base-200 flex h-full w-full items-center justify-center">
									<span class="text-base-content/70 text-xs"
										>{file.alt || $t('dashboard.services.create.portfolio.file_label')}</span
									>
								</div>
							{/if}
						{:else if file instanceof File && file.type.startsWith('video/')}
							<div class="relative h-full w-full">
								<VideoUploader
									variant="compact"
									initialFile={file}
									maxDuration={120}
									maxFileSize={500 * 1024 * 1024}
									onReady={(result) => {
										const attachment = handleVideoReady(result);
										if (attachment) {
											const idx = allGridItems.indexOf(file);
											if (idx >= 0) {
												const updated = allGridItems.with(idx, attachment);
												allGridItems = updated;
												// Rebuild portfolio from allGridItems to preserve picker order
												serviceStore.updateService({
													portfolio: updated.filter(
														(item): item is Attachment => typeof item === 'object' && 'url' in item
													)
												});
											}
										} else {
											allGridItems = allGridItems.filter((f) => f !== file);
										}
										pendingVideoUploads = pendingVideoUploads.filter((f) => f !== file);
									}}
									onError={(msg) => {
										error = msg;
										pendingVideoUploads = pendingVideoUploads.filter((f) => f !== file);
										allGridItems = allGridItems.filter((f) => f !== file);
									}}
								/>
							</div>
						{:else if file instanceof File}
							<!-- Pending file - show preview with object URL -->
							{#if file.type.startsWith('image/')}
								{@const previewUrl = filePreviewUrls.get(file)}
								<div class="relative h-full w-full">
									{#if previewUrl}
										<img
											src={previewUrl}
											alt={file.name}
											class="h-full w-full object-cover"
											loading="lazy"
										/>
									{:else}
										<div class="bg-base-200 flex h-full w-full items-center justify-center">
											<span class="loading loading-spinner loading-md"></span>
										</div>
									{/if}
									{#if fileUploadProgress.get(file)?.status === 'uploading'}
										<div
											class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60"
										>
											<span class="loading loading-spinner loading-sm text-primary"></span>
										</div>
									{/if}
								</div>
							{:else}
								<div class="bg-base-200 flex h-full w-full items-center justify-center">
									<span class="text-base-content/70 text-xs">{file.name}</span>
								</div>
							{/if}
						{/if}
					</div>
					<button
						type="button"
						class="bg-error text-error-content absolute -top-2 -right-2 h-6 w-6 rounded-full p-1 shadow-md hover:opacity-90"
						onclick={() => removeFile(index)}
						title={$t('dashboard.services.create.portfolio.remove')}
						aria-label={$t('dashboard.services.create.portfolio.remove')}
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

			{#if ($serviceStore.service.portfolio || []).length + ($serviceStore.pendingFiles || []).length + (pendingVideoUploads || []).length < 10 && !isUploading}
				<div class="relative aspect-square h-24 w-full sm:h-28 md:h-32">
					<label
						for="portfolio-upload"
						class="border-base-300 bg-base-200 hover:bg-base-300 flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border p-2 text-center transition"
					>
						<svg
							class="text-base-content/70 mb-1 h-6 w-6 sm:mb-2 sm:h-8 sm:w-8"
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
							{$t('dashboard.services.create.portfolio.upload_label')}
						</p>
						<p class="text-base-content/70 text-[8px] sm:text-xs">
							{$t('dashboard.services.create.portfolio.file_types')}
							{$t('dashboard.services.create.portfolio.max_duration')}
						</p>
						<p
							class="text-base-content/70 text-center text-[8px] whitespace-normal sm:px-1 sm:text-xs"
						>
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

		<!-- Hidden file input for custom thumbnail upload -->
		<input
			id="thumbnail-upload-input"
			type="file"
			accept="image/*"
			class="hidden"
			onchange={handleThumbnailUpload}
		/>

		{#if error}
			<div class="text-error text-sm">{error}</div>
		{/if}
	</div>

	{#if errors.portfolio}
		<span class="label-text-alt text-error block">{errors.portfolio}</span>
	{/if}
</div>
