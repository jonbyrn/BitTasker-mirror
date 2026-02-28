<script lang="ts">
	import type { UploaderProps } from '$lib/types/props';
	import { t } from 'svelte-i18n';
	import { 
		compressImage, 
		validateImageFile, 
		formatFileSize,
		type CompressionResult 
	} from '$lib/utils/imageCompression';
	import uploadService, { type UploadResult, type UploadOptions } from '$lib/api/services/upload.service';
	import { clickOutside } from '$lib/utils/clickOutside';

	interface MediaUploaderProps extends Omit<UploaderProps, 'onChange'> {
		enableImageCompression?: boolean;
		compressionQuality?: number;
		maxImageDimension?: number;
		showCompressionInfo?: boolean;
		useCloudflare?: boolean;
		generateVariants?: boolean;
		uploadFolder?: string;
		/** When true and images are allowed, shows Take Photo / Choose from Gallery menu (mobile-friendly) */
		enablePhotoMenu?: boolean;
		onChange?: (results: UploadResult[]) => void;
		onUploadProgress?: (completed: number, total: number, currentFile: string) => void;
		onCompressionProgress?: (progress: { processed: number; total: number; currentFile: string }) => void;
	}

	let {
		id = 'media-uploader',
		label = '',
		maxFiles = 1,
		maxDuration = 30, // In seconds
		maxFileSize = 2, // In MB for compressed images
		allowedTypes = ['image/*'],
		files = [],
		error = '',
		width,
		height,
		className = 'aspect-square h-20 w-20 sm:h-24 sm:w-24',
		enableImageCompression = true,
		compressionQuality = 0.8,
		maxImageDimension = 3840,
		showCompressionInfo = false,
		useCloudflare = true,
		generateVariants = true,
		uploadFolder = 'uploads',
		enablePhotoMenu = false,
		onChange = () => {},
		onRemove = () => {},
		onError = () => {},
		onCompressionProgress = () => {},
		onUploadProgress = () => {}
	}: MediaUploaderProps = $props();

	// State
	let isCompressing = $state(false);
	let isUploading = $state(false);
	let compressionProgress = $state({ processed: 0, total: 0, currentFile: '' });
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });
	let compressionInfo = $state<CompressionResult[]>([]);
	let uploadResults = $state<UploadResult[]>([]);
	let cameraInputElement = $state<HTMLInputElement | undefined>(undefined);
	let galleryInputElement = $state<HTMLInputElement | undefined>(undefined);
	let photoMenuOpen = $state(false);

	// Show Take Photo / Choose from Gallery menu when images are allowed
	let showPhotoMenu = $derived(enablePhotoMenu && allowedTypes.includes('image/*'));

	// Helper function to detect if a URL is a video
	function isVideoURL(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Get file preview URL
	function getFilePreview(file: File | string | UploadResult): string {
		if (typeof file === 'string') {
			return file;
		}
		if (file instanceof File) {
			return URL.createObjectURL(file);
		}
		// UploadResult
		return uploadService.getImageUrl(file, 'medium');
	}

	// Check if file is video
	function isVideoFile(file: File | string | UploadResult): boolean {
		if (typeof file === 'string') {
			return isVideoURL(file);
		}
		if (file instanceof File) {
			return file.type.startsWith('video/');
		}
		// UploadResult
		return file.type === 'video';
	}

	async function validateAndProcessFile(file: File): Promise<File | null> {
		// Validate file type
		const isImageAllowed = allowedTypes.includes('image/*');
		const isVideoAllowed = allowedTypes.includes('video/*');
		const isImageFile = file.type.startsWith('image/');
		const isVideoFile = file.type.startsWith('video/');

		// Check if the file type is valid
		let isValidType = false;
		
		if (isImageAllowed && isImageFile) {
			isValidType = true;
		} else if (isVideoAllowed && isVideoFile) {
			isValidType = true;
		}

		if (!isValidType) {
			if (isImageAllowed && isVideoAllowed) {
				error = $t('common.components.media_uploader.invalid_file_type_images_videos');
			} else if (isImageAllowed) {
				error = $t('uploader.invalidTypeError');
			} else if (isVideoAllowed) {
				error = $t('common.components.media_uploader.invalid_file_type_videos');
			} else {
				error = $t('uploader.invalidFileType');
			}
			onError(error);
			return null;
		}

		// Process image files with compression
		if (isImageFile && enableImageCompression) {
			// Validate image file before compression
			const validation = validateImageFile(file);
			if (!validation.isValid) {
				error = validation.error || $t('common.components.media_uploader.invalid_image');
				onError(error);
				return null;
			}

			try {
				// Compress the image
				const compressionResult = await compressImage(file, {
					maxSizeMB: maxFileSize,
					maxWidthOrHeight: maxImageDimension,
					quality: compressionQuality,
					fileType: 'image/webp'
				});

				// Store compression info if requested
				if (showCompressionInfo) {
					compressionInfo = [...compressionInfo, compressionResult];
				}

				return compressionResult.file;
			} catch (err) {
				console.error('Image compression failed:', err);
				error = $t('common.components.media_uploader.compression_failed', { values: { error: (err as Error).message } });
				onError(error);
				return null;
			}
		}

		// For non-image files or when compression is disabled, validate file size
		if (file.size > maxFileSize * 1024 * 1024) {
			error = $t('common.components.media_uploader.file_size_limit', { values: { maxSize: maxFileSize } });
			onError(error);
			return null;
		}

		// Validate video duration if applicable
		if (isVideoAllowed && maxDuration && isVideoFile) {
			try {
				const video = document.createElement('video');
				video.preload = 'metadata';
				video.src = URL.createObjectURL(file);

				await new Promise((resolve) => {
					video.onloadedmetadata = () => resolve(null);
				});

				if (video.duration > maxDuration) {
					error = $t('common.components.media_uploader.video_duration_limit', { values: { maxDuration } });
					onError(error);
					URL.revokeObjectURL(video.src);
					return null;
				}

				URL.revokeObjectURL(video.src);
			} catch (err) {
				console.error('Failed to validate video duration:', err);
				error = $t('common.components.media_uploader.failed_validate_video');
				onError(error);
				return null;
			}
		}

		// Validate image dimensions if specified (for non-compressed images)
		if (isImageAllowed && (width || height) && isImageFile && !enableImageCompression) {
			try {
				const img = new Image();
				img.src = URL.createObjectURL(file);

				await new Promise((resolve) => {
					img.onload = () => resolve(null);
				});

				if ((width && img.width !== width) || (height && img.height !== height)) {
					error = $t('common.components.media_uploader.image_dimensions', { values: { width, height } });
					onError(error);
					URL.revokeObjectURL(img.src);
					return null;
				}

				URL.revokeObjectURL(img.src);
			} catch (err) {
				console.error('Failed to validate image dimensions:', err);
				error = $t('common.components.media_uploader.failed_load_image');
				onError(error);
				return null;
			}
		}

		return file;
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		// Reset input so the same file can be selected again
		input.value = '';

		const selectedFilesArray = Array.from(selectedFiles);
		if (files?.length + selectedFilesArray.length > maxFiles) {
			error = $t('common.components.media_uploader.max_files_limit', { values: { maxFiles } });
			onError?.(error);
			return;
		}

		const hasImages = selectedFilesArray.some(file => file.type.startsWith('image/'));

		if (hasImages && enableImageCompression) {
			isCompressing = true;
			compressionProgress = { processed: 0, total: selectedFilesArray.length, currentFile: '' };
		}

		const processedFiles: File[] = [];
		let hasErrors = false;

		for (let i = 0; i < selectedFilesArray.length; i++) {
			const file = selectedFilesArray[i];

			if (hasImages && enableImageCompression) {
				compressionProgress = {
					processed: i,
					total: selectedFilesArray.length,
					currentFile: file.name
				};
				onCompressionProgress(compressionProgress);
			}

			const processedFile = await validateAndProcessFile(file);
			if (!processedFile) {
				hasErrors = true;
				break;
			}
			processedFiles.push(processedFile);
		}

		if (hasImages && enableImageCompression) {
			isCompressing = false;
			compressionProgress = { processed: selectedFilesArray.length, total: selectedFilesArray.length, currentFile: '' };
		}

		if (hasErrors) return;

		isUploading = true;
		uploadProgress = { completed: 0, total: processedFiles.length, currentFile: '' };

		try {
			const uploadOptions: UploadOptions = {
				folder: uploadFolder,
				useCloudflare,
				enableCompression: false,
				generateVariants,
				metadata: {
					uploadedAt: new Date().toISOString(),
					clientCompressed: enableImageCompression && hasImages
				}
			};

			const results = await uploadService.uploadMultipleFiles(
				processedFiles,
				uploadOptions,
				(completed, total, currentFile) => {
					uploadProgress = { completed, total, currentFile };
					onUploadProgress(completed, total, currentFile);
				}
			);

			uploadResults = [...uploadResults, ...results];
			files = [...files, ...results.map(result => (typeof result === 'string' ? result : result.url))];
			error = '';
			onChange(uploadResults);
		} catch (err) {
			console.error('Upload failed:', err);
			error = $t('common.components.media_uploader.upload_failed', { values: { error: (err as Error).message } });
			onError(error);
		} finally {
			isUploading = false;
			uploadProgress = { completed: 0, total: 0, currentFile: '' };
		}
	}

	function removeFile(index: number) {
		const file = files[index];
		files = files.filter((_, i) => i !== index);
		
		// Remove from upload results if it's an UploadResult
		if (uploadResults[index]) {
			uploadResults = uploadResults.filter((_, i) => i !== index);
		}
		
		onRemove(index, file);
		error = '';
	}

	function onTakePhoto() {
		photoMenuOpen = false;
		cameraInputElement?.click();
	}

	function onChooseFromGallery() {
		photoMenuOpen = false;
		galleryInputElement?.click();
	}

	// Get translation strings reactively
	let imagesText = $state('');
	let videosText = $state('');
	$effect(() => {
		imagesText = $t('common.components.media_uploader.images');
		videosText = $t('common.components.media_uploader.videos');
	});

	// Get file type display text
	let fileTypeText = $derived(
		allowedTypes
			.map((type) => {
				if (type === 'image/*') return imagesText;
				if (type === 'video/*') return videosText;
				return type.split('/')[1].toUpperCase();
			})
			.join(', ')
	);

	// Get duration text if applicable
	let durationText = $derived(maxDuration ? ` (Max. ${maxDuration / 60} minutes)` : '');
</script>

<div class="space-y-4">
	<div
		class={maxFiles > 1
			? 'grid w-fit grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5'
			: 'h-full w-full'}
	>
		{#each files as file, index}
			<div class="relative {className}">
				{#if isVideoFile(file)}
					<video
						src={getFilePreview(file)}
						class="h-full w-full cursor-pointer rounded-lg object-cover"
						controls
						muted={false}
						autoplay={false}
						loop={false}
					>
						<track kind="captions" />
					</video>
				{:else}
					<img
						src={getFilePreview(file)}
						alt={$t('common.components.media_uploader.preview')}
						class="h-full w-full rounded-lg object-cover"
					/>
				{/if}
				<button
					aria-label={$t('common.components.media_uploader.remove_file')}
					type="button"
					class="absolute -top-2 -right-2 h-6 w-6 cursor-pointer rounded-full bg-white p-1 text-black shadow-md hover:bg-gray-100"
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

		{#if files.length < maxFiles && !isUploading}
			<div class="relative overflow-hidden {className}">
				{#if showPhotoMenu}
					<!-- Take Photo / Choose from Gallery menu -->
					<details
						class="dropdown dropdown-end h-full w-full"
						bind:open={photoMenuOpen}
						use:clickOutside={{ callback: () => { photoMenuOpen = false; } }}
					>
						<summary
							class="bg-base-200 flex h-full w-full cursor-pointer list-none flex-col items-center justify-center rounded-lg border border-white/50 [&::-webkit-details-marker]:hidden"
						>
							<div class="flex flex-col items-center justify-center pt-5 pb-6">
								<svg
									class="label label-text mb-1 sm:mb-2 h-4 w-4 sm:h-8 sm:w-8"
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
								<p class="label label-text mb-1 sm:mb-2 text-[10px] sm:text-xs">
									<span class="font-semibold">{label}</span>
								</p>
								<p class="label label-text text-center text-[8px] whitespace-normal sm:px-2">
									{fileTypeText} (Max. {maxFileSize}MB{durationText})
								</p>
							</div>
						</summary>
						<ul
							class="menu dropdown-content bg-base-100 rounded-box z-10 mt-1 w-48 p-2 shadow-lg"
							role="menu"
						>
							<li role="menuitem">
								<button type="button" onclick={onTakePhoto} class="gap-2">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
									</svg>
									{$t('common.components.media_uploader.take_photo')}
								</button>
							</li>
							<li role="menuitem">
								<button type="button" onclick={onChooseFromGallery} class="gap-2">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
									{$t('common.components.media_uploader.choose_from_gallery')}
								</button>
							</li>
						</ul>
					</details>
					<input
						type="file"
						class="hidden"
						accept="image/*"
						capture="environment"
						bind:this={cameraInputElement}
						onchange={handleFileChange}
						multiple={files.length + 1 < maxFiles}
						disabled={isUploading}
					/>
					<input
						type="file"
						class="hidden"
						accept="image/*"
						bind:this={galleryInputElement}
						onchange={handleFileChange}
						multiple={files.length + 1 < maxFiles}
						disabled={isUploading}
					/>
				{:else}
					<!-- Single file input (default) -->
					<label
						for="file-upload-{id}"
						class="bg-base-200 flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-white/50"
					>
						<div class="flex flex-col items-center justify-center pt-5 pb-6">
							<svg
								class="label label-text mb-1 sm:mb-2 h-4 w-4 sm:h-8 sm:w-8"
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
							<p class="label label-text mb-1 sm:mb-2 text-[10px] sm:text-xs">
								<span class="font-semibold">{label}</span>
							</p>
							<p class="label label-text text-center text-[8px] whitespace-normal sm:px-2">
								{fileTypeText} (Max. {maxFileSize}MB{durationText})
							</p>
						</div>
					</label>
					<input
						id="file-upload-{id}"
						type="file"
						class="hidden"
						accept={allowedTypes.join(',')}
						onchange={handleFileChange}
						multiple={files.length + 1 < maxFiles}
						disabled={isUploading}
					/>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Compression Progress -->
	{#if isCompressing && compressionProgress.total > 0}
		<div class="alert alert-outline alert-info alert-xs sm:alert-sm py-2">
			<div class="flex items-center gap-2 w-full">
				<svg
					class="animate-spin h-4 w-4 text-info"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<div class="flex-1">
					<div class="text-xs font-medium">
						{$t('common.components.media_uploader.compressing_images')} ({compressionProgress.processed}/{compressionProgress.total})
					</div>
					{#if compressionProgress.currentFile}
						<div class="text-xs opacity-70">{compressionProgress.currentFile}</div>
					{/if}
					<div class="w-full bg-base-300 rounded-full h-1 mt-1">
						<div
							class="bg-info h-1 rounded-full transition-all duration-300"
							style="width: {(compressionProgress.processed / compressionProgress.total) * 100}%"
						></div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Upload Progress -->
	{#if isUploading && uploadProgress.total > 0}
		<div class="alert alert-outline alert-info alert-xs sm:alert-sm py-2">
			<div class="flex items-center gap-2 w-full">
				<svg
					class="animate-spin h-4 w-4 text-info"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<div class="flex-1">
					<div class="text-xs font-medium">
						{$t('common.components.media_uploader.uploading_files')} ({uploadProgress.completed}/{uploadProgress.total})
					</div>
					{#if uploadProgress.currentFile}
						<div class="text-xs opacity-70">{uploadProgress.currentFile}</div>
					{/if}
					<div class="w-full bg-base-300 rounded-full h-1 mt-1">
						<div
							class="bg-info h-1 rounded-full transition-all duration-300"
							style="width: {(uploadProgress.completed / uploadProgress.total) * 100}%"
						></div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Compression Info -->
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
				{#each compressionInfo as info, index}
					<div class="opacity-70">
						{$t('common.components.media_uploader.file_number', { values: { index: index + 1 } })}: {formatFileSize(info.originalSize)} → {formatFileSize(info.compressedSize)} 
						({Math.round((1 - info.compressedSize / info.originalSize) * 100)}% reduction)
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-outline alert-error alert-xs sm:alert-sm py-1">
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
		</div>
	{/if}
</div>