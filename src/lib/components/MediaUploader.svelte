<script lang="ts">
	import type { UploaderProps } from '$lib/types/props';
	import { t } from 'svelte-i18n';
	import { 
		compressImage, 
		compressImages,
		validateImageFile, 
		formatFileSize,
		type CompressionResult 
	} from '$lib/utils/imageCompression';
	import uploadService, { type UploadResult, type UploadOptions } from '$lib/api/services/upload.service';

	interface MediaUploaderProps extends Omit<UploaderProps, 'onChange'> {
		enableImageCompression?: boolean;
		compressionQuality?: number;
		maxImageDimension?: number;
		showCompressionInfo?: boolean;
		useCloudflare?: boolean;
		generateVariants?: boolean;
		uploadFolder?: string;
		onChange?: (results: UploadResult[]) => void;
		onUploadProgress?: (completed: number, total: number, currentFile: string) => void;
		onCompressionProgress?: (progress: { processed: number; total: number; currentFile: string }) => void;
		onFileSelect?: (files: File[]) => void;
		autoUpload?: boolean;
	}

	let {
		id = 'media-uploader',
		label = $t('uploader.uploadImage'),
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
		onChange = () => {},
		onRemove = () => {},
		onError = () => {},
		onCompressionProgress = () => {},
		onUploadProgress = () => {},
		onFileSelect = () => {},
		autoUpload = true
	}: MediaUploaderProps = $props();

	// State
	let isCompressing = $state(false);
	let isUploading = $state(false);
	let compressionProgress = $state({ processed: 0, total: 0, currentFile: '' });
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });
	let compressionInfo = $state<CompressionResult[]>([]);
	let uploadResults = $state<UploadResult[]>([]);
	let selectedFiles = $state<File[]>([]);
	let processedFiles = $state<File[]>([]);
	let isDragOver = $state(false);
	let dropZoneElement: HTMLDivElement;

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
		const newFiles = input.files;
		if (!newFiles) return;

		if (files?.length + newFiles.length > maxFiles) {
			error = $t('common.components.media_uploader.max_files_limit', { values: { maxFiles } });
			onError?.(error);
			return;
		}

		const newFilesArray = Array.from(newFiles);
		
		// Store selected files
		selectedFiles = [...selectedFiles, ...newFilesArray];
		
		// Process files for validation and compression
		await processSelectedFiles(newFilesArray);
		
		// Call onFileSelect callback
		onFileSelect(selectedFiles);
		
		// If autoUpload is enabled, upload immediately
		if (autoUpload) {
			await uploadProcessedFiles();
		}
		
		// Clear the input to allow selecting the same file again
		input.value = '';
	}

	async function processSelectedFiles(filesToProcess: File[]) {
		const hasImages = filesToProcess.some(file => file.type.startsWith('image/'));
		
		if (hasImages && enableImageCompression) {
			isCompressing = true;
			compressionProgress = { processed: 0, total: filesToProcess.length, currentFile: '' };
		}

		// Process files sequentially to avoid memory issues with large files
		const newProcessedFiles: File[] = [];
		let hasErrors = false;

		for (let i = 0; i < filesToProcess.length; i++) {
			const file = filesToProcess[i];
			
			// Update compression progress
			if (hasImages && enableImageCompression) {
				compressionProgress = { 
					processed: i, 
					total: filesToProcess.length, 
					currentFile: file.name 
				};
				onCompressionProgress(compressionProgress);
			}

			const processedFile = await validateAndProcessFile(file);
			if (!processedFile) {
				hasErrors = true;
				break;
			}
			newProcessedFiles.push(processedFile);
		}

		// Finalize compression state
		if (hasImages && enableImageCompression) {
			isCompressing = false;
			compressionProgress = { processed: filesToProcess.length, total: filesToProcess.length, currentFile: '' };
		}

		if (hasErrors) {
			return;
		}

		// Store processed files
		processedFiles = [...processedFiles, ...newProcessedFiles];
		
		// Update files array for preview
		files = [...files, ...newProcessedFiles.map(file => URL.createObjectURL(file))];
	}

	async function uploadProcessedFiles() {
		if (processedFiles.length === 0) return;

		isUploading = true;
		uploadProgress = { completed: 0, total: processedFiles.length, currentFile: '' };

		try {
			const uploadOptions: UploadOptions = {
				folder: uploadFolder,
				useCloudflare,
				enableCompression: false, // Already compressed client-side
				generateVariants,
				metadata: {
					uploadedAt: new Date().toISOString(),
					clientCompressed: enableImageCompression && processedFiles.some(file => file.type.startsWith('image/'))
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
			files = [...files, ...results.map(result => typeof result === 'string' ? result : result.url)];
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

	// Expose upload method for external use
	export async function uploadFiles() {
		await uploadProcessedFiles();
	}

	// Drag and drop handlers
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		// Only set isDragOver to false if we're leaving the drop zone entirely
		if (!dropZoneElement.contains(event.relatedTarget as Node)) {
			isDragOver = false;
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;

		const droppedFiles = event.dataTransfer?.files;
		if (!droppedFiles || droppedFiles.length === 0) return;

		// Convert FileList to Array and process like regular file selection
		const filesArray = Array.from(droppedFiles);
		
		if (files?.length + filesArray.length > maxFiles) {
			error = $t('common.components.media_uploader.max_files_limit', { values: { maxFiles } });
			onError?.(error);
			return;
		}

		// Store selected files
		selectedFiles = [...selectedFiles, ...filesArray];
		
		// Process files for validation and compression
		await processSelectedFiles(filesArray);
		
		// Call onFileSelect callback
		onFileSelect(selectedFiles);
		
		// If autoUpload is enabled, upload immediately
		if (autoUpload) {
			uploadProcessedFiles();
		}
	}

	function removeFile(index: number) {
		const file = files[index];
		files = files.filter((_, i) => i !== index);
		
		// Remove from selected files
		if (selectedFiles[index]) {
			selectedFiles = selectedFiles.filter((_, i) => i !== index);
		}
		
		// Remove from processed files
		if (processedFiles[index]) {
			processedFiles = processedFiles.filter((_, i) => i !== index);
		}
		
		// Remove from upload results if it's an UploadResult
		if (uploadResults[index]) {
			uploadResults = uploadResults.filter((_, i) => i !== index);
		}
		
		onRemove(index, file);
		error = '';
	}

	// Get file type display text
	let fileTypeText = $derived(
		allowedTypes
			.map((type) => {
				if (type === 'image/*') return $t('common.components.media_uploader.images');
				if (type === 'video/*') return $t('common.components.media_uploader.videos');
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
		bind:this={dropZoneElement}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="region"
		aria-label="File upload drop zone"
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

		{#if files.length < maxFiles && !isUploading && !isCompressing}
			<div class="relative overflow-hidden {className}">
				<label
					for="file-upload-{id}"
					class="bg-base-200 flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-white/50 transition-colors duration-200 {isDragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}"
				>
					<div class="flex flex-col items-center justify-center pt-5 pb-6">
						{#if isDragOver}
							<svg
								class="label label-text mb-1 sm:mb-2 h-4 w-4 sm:h-8 sm:w-8 text-blue-500"
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
								/>
							</svg>
							<p class="label label-text mb-1 sm:mb-2 text-[10px] sm:text-xs text-blue-500">
								<span class="font-semibold">Drop files here</span>
							</p>
						{:else}
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
						{/if}
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