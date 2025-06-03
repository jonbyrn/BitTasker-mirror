<script lang="ts">
	import type { UploaderProps } from '$lib/types/props';
	import { t } from '$lib/stores/i18n.store';

	let {
		id = 'image-uploader',
		label = $t('uploader.uploadImage'),
		maxFiles = 1,
		maxDuration = 60,
		maxFileSize = 8,
		allowedTypes = ['image/*'],
		files = [],
		error = '',
		width,
		height,
		customClass = 'aspect-square h-20 w-20 sm:h-24 sm:w-24',
		onChange = () => {},
		onRemove = () => {},
		onError = () => {}
	}: UploaderProps = $props();

	// Helper function to detect if a URL is a video
	function isVideoURL(url: string): boolean {
		// Check common video extensions
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	async function validateFile(file: File): Promise<boolean> {
		// Validate file type
		const isImage = allowedTypes.includes('image/*');
		const isVideo = allowedTypes.includes('video/*');

		if (isImage && !file.type.startsWith('image/')) {
			error = $t('uploader.invalidTypeError');
			onError(error);
			return false;
		}

		if (isVideo && !file.type.startsWith('video/')) {
			error = $t('uploader.invalidFileType') + ' Only MP4, WebM and OGG videos are allowed';
			onError(error);
			return false;
		}

		if (!isImage && !isVideo && !allowedTypes.includes(file.type)) {
			error = $t('uploader.invalidFileType');
			onError(error);
			return false;
		}

		// Validate file size
		if (file.size > maxFileSize * 1024 * 1024) {
			error = `File size must be less than ${maxFileSize}MB`;
			onError(error);
			return false;
		}

		// Validate video duration if applicable
		if (isVideo && maxDuration && file.type.startsWith('video/')) {
			try {
				const video = document.createElement('video');
				video.preload = 'metadata';
				video.src = URL.createObjectURL(file);

				await new Promise((resolve) => {
					video.onloadedmetadata = () => resolve(null);
				});

				if (video.duration > maxDuration) {
					error = `Video must be ${maxDuration} seconds or shorter`;
					onError(error);
					URL.revokeObjectURL(video.src);
					return false;
				}

				URL.revokeObjectURL(video.src);
			} catch (err) {
				console.error('Failed to validate video duration:', err);
				error = $t('uploader.failedToValidateVideo');
				onError(error);
				return false;
			}
		}

		// Validate image dimensions if specified
		if (isImage && (width || height)) {
			try {
				const img = new Image();
				img.src = URL.createObjectURL(file);

				await new Promise((resolve) => {
					img.onload = () => resolve(null);
				});

				if ((width && img.width !== width) || (height && img.height !== height)) {
					error = `Image dimensions must be ${width}x${height}px`;
					onError(error);
					URL.revokeObjectURL(img.src);
					return false;
				}

				URL.revokeObjectURL(img.src);
			} catch (err) {
				console.error('Failed to validate image dimensions:', err);
				error = $t('uploader.failedToLoadImage');
				onError(error);
				return false;
			}
		}

		return true;
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		if (files?.length + selectedFiles.length > maxFiles) {
			error = `Maximum of ${maxFiles} files allowed`;
			onError?.(error);
			return;
		}

		// Create a new array to collect the processed files
		const newFiles = [...files];
		let hasErrors = false;

		// Process files sequentially to avoid memory issues with large files
		for (const file of Array.from(selectedFiles)) {
			const isValid = await validateFile(file);
			if (!isValid) {
				hasErrors = true;
				break;
			}
			newFiles.push(file);
		}

		if (!hasErrors) {
			files = newFiles;
			error = '';
			onChange(files as File[]);
		}
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		onRemove(index);
		error = '';
	}

	// Get file type display text
	let fileTypeText = $derived(
		allowedTypes
			.map((type) => {
				if (type === 'image/*') return 'Images';
				if (type === 'video/*') return 'Videos';
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
			<div class="relative {customClass}">
				{#if typeof file === 'string'}
					{#if isVideoURL(file)}
						<video
							src={file}
							class="h-full w-full cursor-pointer rounded-lg object-cover"
							controls
							muted={false}
							autoplay={false}
							loop={false}
						>
							<track kind="captions" />
						</video>
					{:else}
						<img src={file} alt="Preview" class="h-full w-full rounded-lg object-cover" />
					{/if}
				{:else if file.type.startsWith('video/')}
					<video
						src={URL.createObjectURL(file)}
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
						src={URL.createObjectURL(file)}
						alt="Preview"
						class="h-full w-full rounded-lg object-cover"
					/>
				{/if}
				<button
					aria-label="Remove file"
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

		{#if files.length < maxFiles}
			<div class="relative overflow-hidden {customClass}">
				<label
					for="file-upload-{id}"
					class="bg-base-200 flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-white/50"
				>
					<div class="flex flex-col items-center justify-center pt-5 pb-6">
						<svg
							class="label label-text mb-2 h-4 w-4 sm:h-8 sm:w-8"
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
						<p class="label label-text mb-2 text-[10px] sm:text-xs">
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
				/>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="alert alert-error alert-xs sm:alert-sm py-1">
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
