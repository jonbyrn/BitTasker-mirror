<script lang="ts">
	import type { UploaderProps } from '$lib/types/props';
	import { t } from 'svelte-i18n';
	import {
		compressImage,
		validateImageFile,
		formatFileSize,
		type CompressionResult
	} from '$lib/utils/imageCompression';
	import uploadService, {
		type UploadResult,
		type UploadOptions
	} from '$lib/api/services/upload.service';
	import VideoUploader from '$lib/components/VideoUploader.svelte';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		FILE_INPUT_CLASS,
		fileWithResolvedMime,
		isImageMime,
		isUploadTimeout,
		isVideoMime,
		takeFileSelection
	} from '$lib/utils/media/upload-file';

	interface MediaUploaderProps extends Omit<UploaderProps, 'onChange'> {
		enableImageCompression?: boolean;
		compressionQuality?: number;
		maxImageDimension?: number;
		showCompressionInfo?: boolean;
		useCloudflare?: boolean;
		generateVariants?: boolean;
		uploadFolder?: string;
		/** Bindable: true while any image is uploading or any video is still encoding. */
		hasPendingUploads?: boolean;
		onChange?: (results: UploadResult[]) => void;
		onUploadProgress?: (completed: number, total: number, currentFile: string) => void;
		onCompressionProgress?: (progress: {
			processed: number;
			total: number;
			currentFile: string;
		}) => void;
	}

	let {
		id = 'media-uploader',
		label = '',
		maxFiles = 1,
		maxDuration = 30,
		maxFileSize = 2,
		allowedTypes = ['image/*'],
		files: _files = [],
		error = '',
		width,
		height,
		className = '',
		enableImageCompression = true,
		compressionQuality = 0.8,
		maxImageDimension = 3840,
		showCompressionInfo = false,
		useCloudflare = true,
		generateVariants = true,
		uploadFolder = 'uploads',
		hasPendingUploads = $bindable(false),
		onChange = () => {},
		onRemove = () => {},
		onError = () => {},
		onCompressionProgress = () => {},
		onUploadProgress = () => {}
	}: MediaUploaderProps = $props();

	// ── State ──

	// Single ordered grid: File (pending) and UploadResult (completed) in insertion order.
	// `allGridItemIds` is a parallel array of stable slot IDs — one per entry in `allGridItems`.
	// Keys are assigned when items enter the grid and stay with the slot even after a
	// File→UploadResult replacement, so duplicate server keys / identical files never cause
	// Svelte's each_key_duplicate crash.
	let allGridItems = $state<(File | UploadResult)[]>([]);
	let allGridItemIds = $state<string[]>([]);
	let _idSeq = 0;

	let isUploading = $state(false);
	let compressionInfo = $state<CompressionResult[]>([]);

	// Per-file upload progress. SvelteMap is already reactive, so it is not $state.
	const fileUploadProgress = new SvelteMap<
		File,
		{ status: 'uploading' | 'done'; progress: number }
	>();

	// Video playback overlay
	let playingVideo = $state<UploadResult | null>(null);

	// Object URL map for pending image previews (cleaned up on destroy)
	let filePreviewUrls = new SvelteMap<File, string>();
	let failedUploads = $state<File[]>([]);

	const customerCode = browser ? import.meta.env.VITE_STREAM_CUSTOMER_CODE : '';

	// ── Expose pending state to parent ──

	$effect(() => {
		hasPendingUploads =
			isUploading ||
			allGridItems.some((item) => item instanceof File && !failedUploads.includes(item));
	});

	// ── Derived ──

	let fileTypeText = $derived(
		allowedTypes
			.map((type) => {
				if (type === 'image/*') return $t('common.components.media_uploader.images');
				if (type === 'video/*') return $t('common.components.media_uploader.videos');
				return type.split('/')[1].toUpperCase();
			})
			.join(', ')
	);

	let durationInfo = $derived(
		maxDuration
			? $t('common.components.media_uploader.duration_info', {
					values: { duration: maxDuration / 60 }
				})
			: ''
	);

	/** True while any video File is still being processed/encoded. */
	let hasEncodingVideos = $derived(
		allGridItems.some((item) => item instanceof File && item.type.startsWith('video/'))
	);

	// ── Helpers ──

	function videoResultToUploadResult(result: {
		uid: string;
		hlsUrl: string;
		size: number;
	}): UploadResult {
		return {
			url: result.hlsUrl,
			key: result.uid,
			cloudflareId: result.uid,
			type: 'video',
			size: result.size
		};
	}

	function getCompletedResults(): UploadResult[] {
		return allGridItems.filter((item): item is UploadResult => !(item instanceof File));
	}

	/** Build Cloudflare Stream thumbnail URL for a completed video UploadResult. */
	function getVideoThumbnailUrl(item: UploadResult): string | null {
		if (!customerCode) return null;
		const uid = item.cloudflareId || item.key;
		if (!uid) return null;
		return `https://customer-${customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
	}

	// ── File validation (type check + dimensions/duration, no compression) ──

	async function validateFile(file: File): Promise<boolean> {
		const isImageAllowed = allowedTypes.includes('image/*');
		const isVideoAllowed = allowedTypes.includes('video/*');
		const isImageFile = isImageMime(file.type);
		const isVideoFile = isVideoMime(file.type);

		let isValidType = false;
		if (isImageAllowed && isImageFile) isValidType = true;
		else if (isVideoAllowed && isVideoFile) isValidType = true;

		if (!isValidType) {
			if (isImageAllowed && isVideoAllowed) {
				error = $t('common.components.media_uploader.invalid_file_type_images_videos');
			} else if (isImageAllowed) {
				error = $t('common.components.media_uploader.invalid_type_error');
			} else if (isVideoAllowed) {
				error = $t('common.components.media_uploader.invalid_file_type_videos');
			} else {
				error = $t('common.components.media_uploader.invalid_file_type');
			}
			onError(error);
			return false;
		}

		if (isImageFile) {
			const validation = validateImageFile(file);
			if (!validation.isValid) {
				error = validation.error || $t('common.components.media_uploader.invalid_image');
				onError(error);
				return false;
			}
			// Only enforce size limit when compression is disabled (compression handles size reduction)
			if (!enableImageCompression && file.size > maxFileSize * 1024 * 1024) {
				error = $t('common.components.media_uploader.file_size_limit', {
					values: { maxSize: maxFileSize }
				});
				onError(error);
				return false;
			}
		}

		if (!isImageFile && file.size > maxFileSize * 1024 * 1024) {
			error = $t('common.components.media_uploader.file_size_limit', {
				values: { maxSize: maxFileSize }
			});
			onError(error);
			return false;
		}

		if (isVideoAllowed && maxDuration && isVideoFile) {
			try {
				const video = document.createElement('video');
				video.preload = 'metadata';
				video.src = URL.createObjectURL(file);

				await new Promise((resolve) => {
					video.onloadedmetadata = () => resolve(null);
				});

				if (video.duration > maxDuration) {
					error = $t('common.components.media_uploader.video_duration_limit', {
						values: { maxDuration }
					});
					onError(error);
					URL.revokeObjectURL(video.src);
					return false;
				}

				URL.revokeObjectURL(video.src);
			} catch (err) {
				console.error('Failed to validate video duration:', err);
				error = $t('common.components.media_uploader.failed_validate_video');
				onError(error);
				return false;
			}
		}

		if (isImageAllowed && (width || height) && isImageFile && !enableImageCompression) {
			try {
				const img = new Image();
				img.src = URL.createObjectURL(file);

				await new Promise((resolve) => {
					img.onload = () => resolve(null);
				});

				if ((width && img.width !== width) || (height && img.height !== height)) {
					error = $t('common.components.media_uploader.image_dimensions', {
						values: { width, height }
					});
					onError(error);
					URL.revokeObjectURL(img.src);
					return false;
				}

				URL.revokeObjectURL(img.src);
			} catch (err) {
				console.error('Failed to validate image dimensions:', err);
				error = $t('common.components.media_uploader.failed_load_image');
				onError(error);
				return false;
			}
		}

		return true;
	}

	// ── File selection and upload ──

	function uploadErrorMessage(err: unknown): string {
		if (isUploadTimeout(err)) return $t('common.components.media_uploader.upload_timed_out');
		return $t('common.components.media_uploader.upload_failed', {
			values: { error: err instanceof Error ? err.message : String(err) }
		});
	}

	async function uploadImageFiles(imageFiles: File[]) {
		if (imageFiles.length === 0) return;
		failedUploads = failedUploads.filter((file) => !imageFiles.includes(file));

		fileUploadProgress.clear();
		for (const file of imageFiles) {
			fileUploadProgress.set(file, { status: 'uploading', progress: 0 });
		}
		isUploading = true;

		const uploadOptions: UploadOptions = {
			folder: uploadFolder,
			useCloudflare,
			enableCompression: false,
			generateVariants,
			metadata: {
				uploadedAt: new Date().toISOString(),
				clientCompressed: enableImageCompression
			}
		};

		try {
			const filesToUpload: File[] = [];
			for (let i = 0; i < imageFiles.length; i++) {
				const file = imageFiles[i];
				if (enableImageCompression) {
					try {
						const compressionResult = await compressImage(file, {
							maxSizeMB: maxFileSize,
							maxWidthOrHeight: maxImageDimension,
							quality: compressionQuality,
							fileType: 'image/webp'
						});
						if (showCompressionInfo) {
							compressionInfo = [...compressionInfo, compressionResult];
						}
						filesToUpload.push(compressionResult.file);
					} catch (err) {
						console.error('Compression failed for', file.name, err);
						filesToUpload.push(file);
					}
				} else {
					filesToUpload.push(file);
				}
				onCompressionProgress({
					processed: i + 1,
					total: imageFiles.length,
					currentFile: file.name
				});
			}

			const results = await uploadService.uploadMultipleFiles(
				filesToUpload,
				uploadOptions,
				(completed, total, currentFile) => {
					for (let i = 0; i < completed && i < imageFiles.length; i++) {
						fileUploadProgress.set(imageFiles[i], { status: 'done', progress: 100 });
					}
					onUploadProgress(completed, total, currentFile);
				}
			);

			let updatedGrid = allGridItems;
			for (let i = 0; i < imageFiles.length; i++) {
				const originalFile = imageFiles[i];
				const result = results[i];
				const idx = updatedGrid.indexOf(originalFile);
				if (idx >= 0) {
					updatedGrid = updatedGrid.with(idx, result);
				}
				const url = filePreviewUrls.get(originalFile);
				if (url) {
					URL.revokeObjectURL(url);
					filePreviewUrls.delete(originalFile);
				}
			}
			allGridItems = updatedGrid;
			failedUploads = failedUploads.filter((file) => !imageFiles.includes(file));
			error = '';
			onChange(getCompletedResults());
		} catch (err) {
			console.error('Upload failed:', err);
			failedUploads = [...new Set([...failedUploads, ...imageFiles])];
			error = uploadErrorMessage(err);
			onError(error);
		} finally {
			isUploading = false;
			fileUploadProgress.clear();
		}
	}

	function retryFailedUploads() {
		const files = failedUploads.filter((file) => allGridItems.includes(file));
		if (files.length === 0 || isUploading) return;
		error = '';
		void uploadImageFiles(files);
	}

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const selectedFiles = takeFileSelection(input);
		if (!selectedFiles) return;
		// Clear after reading so the next selection, including the same path, fires again.
		input.value = '';

		if (allGridItems.length + selectedFiles.length > maxFiles) {
			error = $t('common.components.media_uploader.max_files_limit', {
				values: { maxFiles }
			});
			onError?.(error);
			return;
		}

		const selectedFilesArray = selectedFiles.map((file) => fileWithResolvedMime(file));
		const validFiles: File[] = [];
		let hasErrors = false;

		// Validate each file and create image preview URLs immediately.
		for (const file of selectedFilesArray) {
			const isValid = await validateFile(file);
			if (!isValid) {
				hasErrors = true;
				break;
			}
			validFiles.push(file);

			if (isImageMime(file.type)) {
				filePreviewUrls.set(file, URL.createObjectURL(file));
			}
		}

		if (hasErrors) return;

		const newIds = validFiles.map(() => `slot-${_idSeq++}`);
		allGridItems = [...allGridItems, ...validFiles];
		allGridItemIds = [...allGridItemIds, ...newIds];

		const imageFiles = validFiles.filter((file) => isImageMime(file.type));
		if (imageFiles.length > 0) {
			await uploadImageFiles(imageFiles);
		}
	}

	// ── Video callbacks ──

	function handleVideoReady(
		file: File,
		result: { uid: string; hlsUrl: string; size: number; filename: string }
	) {
		const uploadResult = videoResultToUploadResult(result);
		const idx = allGridItems.indexOf(file);
		if (idx >= 0) {
			allGridItems = allGridItems.with(idx, uploadResult);
		}
		error = '';
		onChange(getCompletedResults());
	}

	function handleVideoError(file: File, msg: string) {
		// Filter IDs first (uses current allGridItems for lookup), then filter items
		allGridItemIds = allGridItemIds.filter((_, i) => allGridItems[i] !== file);
		allGridItems = allGridItems.filter((item) => item !== file);
		error = msg;
		onError(msg);
	}

	// ── Remove file ──

	function removeFile(index: number) {
		const item = allGridItems[index];
		if (!item) return;

		if (!(item instanceof File)) {
			// Completed UploadResult — compute index within completed-only list for parent callback
			let completedIndex = 0;
			for (let i = 0; i < index; i++) {
				if (!(allGridItems[i] instanceof File)) {
					completedIndex++;
				}
			}
			uploadService.deleteFile(item).catch(console.error);
			onRemove(completedIndex, item.url);
		} else {
			// Pending File — clean up preview URL
			const url = filePreviewUrls.get(item);
			if (url) {
				URL.revokeObjectURL(url);
				filePreviewUrls.delete(item);
			}
		}

		allGridItems = allGridItems.filter((_, i) => i !== index);
		allGridItemIds = allGridItemIds.filter((_, i) => i !== index);
		onChange(getCompletedResults());
		error = '';
	}

	// ── Cleanup ──

	onDestroy(() => {
		filePreviewUrls.forEach((url) => {
			URL.revokeObjectURL(url);
		});
		filePreviewUrls.clear();
	});
</script>

<div class="space-y-4 {className}">
	<!-- Single ordered grid (like ServicePortfolio's allGridItems) -->
	<div
		class={maxFiles > 1 ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4' : 'h-full w-full'}
	>
		{#each allGridItems as item, i (allGridItemIds[i])}
			<div class="relative aspect-square h-24 w-full sm:h-28 md:h-32">
				<div class="border-base-300 h-full w-full overflow-hidden rounded-lg border">
					{#if item instanceof File}
						<!-- Pending file -->
						{#if isVideoMime(item.type)}
							<!-- Pending video — render VideoUploader in compact mode (auto-uploads) -->
							<div class="relative h-full w-full">
								<VideoUploader
									variant="compact"
									initialFile={item}
									{maxDuration}
									maxFileSize={maxFileSize * 1024 * 1024}
									private={false}
									showRemoveButton={false}
									onReady={(result) => handleVideoReady(item, result)}
									onError={(msg) => handleVideoError(item, msg)}
								/>
							</div>
						{:else}
							<!-- Pending image — show original file preview with per-file upload overlay -->
							{@const previewUrl = filePreviewUrls.get(item)}
							<div class="relative h-full w-full">
								{#if previewUrl}
									<img src={previewUrl} alt="" class="h-full w-full object-cover" />
								{:else}
									<div class="bg-base-200 flex h-full w-full items-center justify-center">
										<span class="loading loading-spinner loading-sm"></span>
									</div>
								{/if}
								{#if fileUploadProgress.get(item)?.status === 'uploading'}
									<div
										class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60"
									>
										<span class="loading loading-spinner loading-sm text-primary"></span>
									</div>
								{/if}
							</div>
						{/if}
					{:else if item.type === 'video'}
						<!-- Completed video — show Cloudflare thumbnail with play overlay -->
						{@const vidThumbnailUrl = getVideoThumbnailUrl(item)}
						<button
							type="button"
							class="relative h-full w-full cursor-pointer overflow-hidden"
							onclick={() => (playingVideo = item)}
						>
							{#if vidThumbnailUrl}
								<img
									src={vidThumbnailUrl}
									alt=""
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{:else}
								<div
									class="bg-base-200 flex h-full w-full flex-col items-center justify-center p-2"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-base-content/50 mb-1 h-8 w-8"
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
								</div>
							{/if}
							<div class="absolute inset-0 flex items-center justify-center bg-black/30">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-8 w-8 text-white"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M8 5v14l11-7z" />
								</svg>
							</div>
						</button>
					{:else}
						<!-- Completed image -->
						<img
							src={uploadService.getImageUrl(item, 'medium')}
							alt=""
							class="h-full w-full object-cover"
							loading="lazy"
						/>
					{/if}
				</div>

				<!-- Remove button -->
				<button
					aria-label={$t('common.components.media_uploader.remove_file')}
					type="button"
					class="bg-error text-error-content absolute -top-2 -right-2 z-10 h-6 w-6 cursor-pointer rounded-full p-1 shadow-md hover:opacity-90"
					onclick={() => removeFile(i)}
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

		<!-- Add-file cell (dashed border) — hidden while images are uploading -->
		{#if allGridItems.length < maxFiles && !isUploading}
			<div class="relative aspect-square h-24 w-full sm:h-28 md:h-32">
				<label
					for="file-upload-{id}"
					class="border-base-300 bg-base-200 hover:bg-base-300 pointer-events-none flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-2 text-center transition-colors"
				>
					<div class="flex flex-col items-center justify-center py-2">
						<svg
							class="label label-text mb-1 h-4 w-4 sm:mb-2 sm:h-8 sm:w-8"
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
						<p class="label label-text mb-1 text-[10px] font-semibold sm:mb-2 sm:text-xs">
							{label}
						</p>
						<p class="label label-text text-center text-[8px] whitespace-normal sm:px-2 sm:text-xs">
							{fileTypeText}
							{$t('common.components.media_uploader.max_info', {
								values: { size: maxFileSize, durationInfo }
							})}
						</p>
					</div>
				</label>
				<input
					id="file-upload-{id}"
					type="file"
					class={FILE_INPUT_CLASS}
					accept={allowedTypes.join(',')}
					onchange={handleFileChange}
					oninput={handleFileChange}
					multiple={allGridItems.length + 1 < maxFiles}
					disabled={isUploading}
				/>
			</div>
		{/if}
	</div>

	<!-- Encoding in progress warning — shown while any video is still being processed -->
	{#if hasEncodingVideos}
		<div class="alert alert-outline alert-warning alert-xs sm:alert-sm py-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span class="text-xs">{$t('common.components.media_uploader.videos_encoding')}</span>
		</div>
	{/if}

	<!-- Compression Info (optional) -->
	{#if showCompressionInfo && compressionInfo.length > 0}
		<div class="alert alert-outline alert-success alert-xs sm:alert-sm py-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div class="text-xs">
				<div class="font-medium">{$t('common.components.media_uploader.compression_success')}</div>
				{#each compressionInfo as info, index (index)}
					<div class="opacity-70">
						{$t('common.components.media_uploader.file_number', {
							values: { index: index + 1 }
						})}: {formatFileSize(info.originalSize)} → {formatFileSize(info.compressedSize)}
						({Math.round((1 - info.compressedSize / info.originalSize) * 100)}% reduction)
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-outline alert-error alert-xs sm:alert-sm flex-wrap py-1">
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
			{#if failedUploads.length > 0}
				<button type="button" class="btn btn-primary btn-xs" onclick={retryFailedUploads}>
					{$t('common.components.media_uploader.retry_upload')}
				</button>
			{/if}
		</div>
	{/if}
</div>

<!-- Fullscreen video playback overlay -->
{#if playingVideo}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={() => (playingVideo = null)}
		onkeydown={(e) => e.key === 'Escape' && (playingVideo = null)}
	>
		<div class="aspect-video w-full max-w-2xl" role="none" onclick={(e) => e.stopPropagation()}>
			<StreamPlayer
				videoUid={playingVideo.cloudflareId || playingVideo.key}
				controls={true}
				autoplay={true}
			/>
		</div>
		<button
			type="button"
			class="absolute top-4 right-4 h-8 w-8 cursor-pointer rounded-full bg-white/20 text-white hover:bg-white/40"
			onclick={() => (playingVideo = null)}
			aria-label={$t('common.components.media_uploader.close_preview')}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-5 w-5"
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
{/if}
