<script lang="ts">
	import type { UploaderProps } from '$lib/types/props';
	
	let {
		id = 'image-uploader',
		label = 'Upload Image',
		maxFiles = 1,
		maxFileSize = 8,
		allowedTypes = ['image/*'],
		files = [],
		error = '',
		dimensions = { width: 500, height: 500 },
		onChange = () => {},
		onError = () => {}
	}: UploaderProps = $props();

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		if (files?.length + selectedFiles.length > maxFiles) {
			error = `Maximum ${maxFiles} images allowed`;
			onError?.(error);
			return;
		}

		Array.from(selectedFiles).forEach((file) => {
			if (!allowedTypes?.includes(file.type)) {
				error = 'Invalid file type. Only JPG, PNG and WebP images are allowed';
				onError(error);
				return;
			}

			if (file.size > maxFileSize * 1024 * 1024) {
				error = `File size must be less than ${maxFileSize}MB`;
				onError(error);
				return;
			}

			const img = new Image();
			img.src = URL.createObjectURL(file);
			img.onload = () => {
				if (img.width !== dimensions.width || img.height !== dimensions.height) {
					error = `Image dimensions must be ${dimensions.width}x${dimensions.height}px`;
					onError(error);
					return;
				}

				files = [...files, file];
				onChange(files);
				error = '';
			};
		});
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		onChange(files);
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

	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
		{#each files as file, index}
			<div class="relative aspect-square">
				<img
					src={URL.createObjectURL(file)}
					alt="Preview"
					class="h-full w-full rounded-lg object-cover"
				/>
				<button
					aria-label="Remove image"
					type="button"
					class="absolute -top-2 -right-2 rounded-full bg-white p-1 shadow-md hover:bg-gray-100"
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
			<div class="relative aspect-square">
				<label
					for="file-upload-{id}"
					class="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:bg-gray-50"
				>
					<div class="flex flex-col items-center justify-center pt-5 pb-6">
						<svg
							class="mb-4 h-8 w-8 text-gray-500"
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
						<p class="mb-2 text-sm text-gray-500">
							<span class="font-semibold">{label}</span>
						</p>
						<p class="text-xs text-gray-500">
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
