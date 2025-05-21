<script lang="ts">
	import type { UploaderProps } from '$lib/types/props';
	import { t } from '$lib/stores/i18n.store';

	let {
		id = 'image-uploader',
		label = $t('uploader.uploadImage'),
		maxFiles = 1,
		maxFileSize = 8,
		allowedTypes = ['image/*'],
		files = [],
		error = '',
		width,
		height,
		customClass = 'aspect-square h-20 w-20 sm:h-24 sm:w-24',
		onChange = () => {},
		onError = () => {}
	}: UploaderProps = $props();

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		if (files?.length + selectedFiles.length > maxFiles) {
			error = `Maximum of ${maxFiles} images allowed`;
			onError?.(error);
			return;
		}

		// Create a new array to collect the processed files
		const newFiles = [...files];
		let hasErrors = false;
		let processedCount = 0;
		const totalToProcess = selectedFiles.length;

		Array.from(selectedFiles).forEach((file) => {
			// Validate file type
			if (allowedTypes?.includes('image/*')) {
				if (!file.type.startsWith('image/')) {
					error = $t('uploader.invalidTypeError');
					onError(error);
					hasErrors = true;
					return;
				}
			} else if (!allowedTypes?.includes(file.type)) {
				error = 'Invalid file type. Only JPG, PNG and WebP images are allowed';
				onError(error);
				hasErrors = true;
				return;
			}

			// Validate file size
			if (file.size > maxFileSize * 1024 * 1024) {
				error = `File size must be less than ${maxFileSize}MB`;
				onError(error);
				hasErrors = true;
				return;
			}

			// Check image dimensions if specified
			const img = new Image();
			img.src = URL.createObjectURL(file);
			img.onload = () => {
				if ((width && img.width !== width) || (height && img.height !== height)) {
					error = `Image dimensions must be ${width}x${height}px`;
					onError(error);
					hasErrors = true;
				} else {
					// Add the file to our collection
					newFiles.push(file);
				}

				// Increment processed count
				processedCount++;

				// If this is the last file and there are no errors, update the files array
				if (processedCount === totalToProcess && !hasErrors) {
					files = newFiles;
					error = '';
					// Call onChange with the updated files array
					onChange(files as File[]);
				}
			};

			img.onerror = () => {
				error = $t('uploader.failedToLoadImage');
				onError(error);
				hasErrors = true;
				processedCount++;
			};
		});
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		onChange(files as File[]);
		error = '';
	}
</script>

<div class="space-y-4">
	{#if error}
		<div class="alert alert-error">
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

	<div
		class={maxFiles > 1
			? 'grid w-fit grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5'
			: 'h-full w-full'}
	>
		{#each files as file, index}
			<div class="relative {customClass}">
				<img
					src={typeof file === 'string' ? file : URL.createObjectURL(file)}
					alt="Preview"
					class="h-full w-full rounded-lg object-cover"
				/>
				<button
					aria-label="Remove image"
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
							class="mb-2 h-4 w-4 label label-text sm:h-8 sm:w-8"
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
						<p class="mb-2 text-[10px] label label-text sm:text-xs">
							<span class="font-semibold">{label}</span>
						</p>
						<p class="text-[8px] label label-text">
							{allowedTypes.map((type) => type.split('/')[1].toUpperCase()).join(', ')} (Max. {maxFileSize}MB)
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
</div>
