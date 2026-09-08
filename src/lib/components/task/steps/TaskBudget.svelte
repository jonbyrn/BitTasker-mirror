<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { get } from 'svelte/store';
	import { SATS_PER_BTC } from '$lib/utils/helpers/crypto';
	import { compressImage, validateImageFile } from '$lib/utils/imageCompression';
	import { t } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import uploadService from '$lib/api/services/upload.service';
	import UsdSatsInput from '$lib/components/shared/UsdSatsInput.svelte';

	// BTC to USD conversion state
	let usdAmount = $state<number>(0);
	let btcPrice = $state<number>(0);

	// File upload state
	let isUploading = $state(false);
	let uploadProgress = $state({ completed: 0, total: 0, currentFile: '' });
	let isCompressing = $state(false);
	let compressionProgress = $state({ processed: 0, total: 0, currentFile: '' });
	let error = $state('');

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

			// Si ya existe un valor en amount, interpretarlo según la moneda
			if ($store.task.budget.amount) {
				if ($store.task.budget.currency === 'USD') {
					usdAmount = $store.task.budget.amount;
				} else {
					usdAmount = ($store.task.budget.amount / SATS_PER_BTC) * btcPrice;
					store.updateTask({
						budget: {
							...$store.task.budget,
							currency: 'USD',
							amount: usdAmount
						}
					});
				}
			}
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	function updateBudgetAmount(nextUsdAmount: number): void {
		store.updateTask({
			budget: {
				...$store.task.budget,
				amount: nextUsdAmount,
				currency: 'USD'
			}
		});
		usdAmount = nextUsdAmount;
	}

	let {
		errors,
		direction,
		attachmentsToRemove = $bindable()
	} = $props<{
		errors: Record<string, string>;
		direction: 'forward' | 'backward';
		attachmentsToRemove: Attachment[];
	}>();

	// Reactive validation for description - clears error when requirement is met
	// This validates in real-time as the user types
	let descriptionError = $derived.by(() => {
		const description = $store.task.description?.trim() || '';

		// Only validate if there was an error before (from errors prop) or if user has started typing
		// This prevents showing errors before the user has interacted with the field
		if (errors.description || description.length > 0) {
			if (!description) {
				return $t('task.errors.description_required');
			}
			if (description.length < 20) {
				return $t('task.errors.description_min_length');
			}
			// If description meets requirement, return empty string to clear error
			return '';
		}
		return '';
	});

	// File handling functions
	async function validateAndProcessFile(file: File): Promise<File | null> {
		const isImageFile = file.type.startsWith('image/');
		const isVideoFile = file.type.startsWith('video/');

		if (!isImageFile && !isVideoFile) {
			error = $t('common.components.media_uploader.invalid_file_type_images_videos');
			return null;
		}

		// Process image files with compression
		if (isImageFile) {
			const validation = validateImageFile(file);
			if (!validation.isValid) {
				error = validation.error || $t('common.components.media_uploader.invalid_image');
				return null;
			}

			try {
				const compressionResult = await compressImage(file, {
					maxSizeMB: 200,
					maxWidthOrHeight: 3840,
					quality: 0.8,
					fileType: 'image/webp'
				});
				return compressionResult.file;
			} catch (err) {
				console.error('Compression failed:', err);
				error = $t('common.components.media_uploader.compression_failed');
				return null;
			}
		}

		// Validate video files
		if (isVideoFile) {
			const fileSizeMB = file.size / (1024 * 1024);
			const maxSizeMB = 50; // 50MB limit for videos
			if (fileSizeMB > maxSizeMB) {
				// Get the translation template
				const template = $t('common.components.media_uploader.video_file_too_large');
				// Replace all placeholders manually
				error = template
					.replace(/\{fileName\}/g, file.name)
					.replace(/\{actualSize\}/g, fileSizeMB.toFixed(2))
					.replace(/\{maxSize\}/g, maxSizeMB.toString());
				return null;
			}
		}

		return file;
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFiles = input.files;
		if (!selectedFiles) return;

		const totalFiles =
			($store.task.attachments?.length || 0) + (get(store).pendingFiles?.length || 0);
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

		store.updateStore({ pendingFiles: [...(get(store).pendingFiles || []), ...processedFiles] });
		error = '';
	}

	function removeFile(index: number) {
		const allFiles = [...($store.task.attachments || []), ...(get(store).pendingFiles || [])];
		const file = allFiles[index];

		if (file && typeof file === 'object' && 'url' in file) {
			const attachment = $store.task.attachments?.find((att) => att.url === file.url);
			if (attachment) {
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				const attachmentIndex = $store.task.attachments?.findIndex((att) => att.url === file.url);
				if (attachmentIndex !== undefined && attachmentIndex >= 0) {
					$store.task.attachments?.splice(attachmentIndex, 1);
				}
			}
		} else {
			const pendingIndex = index - ($store.task.attachments?.length || 0);
			if (pendingIndex >= 0 && pendingIndex < (get(store).pendingFiles?.length || 0)) {
				const newPendingFiles = [...(get(store).pendingFiles || [])];
				newPendingFiles.splice(pendingIndex, 1);
				store.updateStore({ pendingFiles: newPendingFiles });
			}
		}
	}

	async function uploadPendingFiles(): Promise<Attachment[]> {
		if (!get(store).pendingFiles || get(store).pendingFiles.length === 0) {
			return [];
		}

		isUploading = true;
		uploadProgress = { completed: 0, total: get(store).pendingFiles.length, currentFile: '' };

		try {
			const uploadOptions = {
				folder: 'tasks',
				useCloudflare: true,
				enableCompression: false,
				generateVariants: true,
				metadata: {
					uploadedAt: new Date().toISOString(),
					clientCompressed: true
				}
			};

			const results = await uploadService.uploadMultipleFiles(
				get(store).pendingFiles,
				uploadOptions,
				(completed, total, currentFile) => {
					uploadProgress = { completed, total, currentFile };
				}
			);

			const attachments: Attachment[] = results.map((result) => ({
				key: result.key,
				url: result.url,
				type:
					result.type === 'image' ? 'image/*' : result.type === 'video' ? 'video/*' : 'document',
				alt: result.key,
				size: result.size,
				cloudflareId: result.cloudflareId,
				variants: result.variants
			}));

			$store.task.attachments = [...($store.task.attachments || []), ...attachments];
			store.updateStore({ pendingFiles: [] });

			return attachments;
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

	export { uploadPendingFiles };

	function getFilePreview(file: File | Attachment | Blob): string {
		if (file instanceof File || file instanceof Blob) {
			return URL.createObjectURL(file);
		}
		if (file && typeof file === 'object' && 'url' in file) {
			return file.url;
		}
		return '';
	}

	function isVideoFile(file: File | Attachment | Blob): boolean {
		if (file instanceof File || file instanceof Blob) {
			return file.type.startsWith('video/');
		}
		if (file && typeof file === 'object' && 'type' in file) {
			return file.type.startsWith('video/');
		}
		return false;
	}

	let allFiles = $derived.by(() => {
		const attachments = $store.task.attachments || [];
		const pending = $store.pendingFiles || [];
		return [...attachments, ...pending];
	});

	// Sync usdAmount with store when component loads
	$effect(() => {
		if ($store.task.budget.amount) {
			usdAmount = $store.task.budget.amount;
		}
	});

	onMount(() => {
		fetchBtcPrice();
	});
</script>

<div
	class="space-y-4"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h4 class="text-lg font-semibold">{$t('task.budget_question')}</h4>

	<div class="w-full">
		<label for="budget" class="label">
			<span class="label-text">{$t('task.budget_label')}</span>
		</label>
		<UsdSatsInput
			{usdAmount}
			{btcPrice}
			error={errors.budget}
			showFieldLabels={false}
			usdInputId="budget-usd"
			satsInputId="budget-btc"
			usdPlaceholder={$t('task.usd_placeholder')}
			satsPlaceholder={$t('task.sats_placeholder')}
			btcPriceLabel={$t('task.btc_price')}
			btcPriceClassName="label-text-alt mt-1 block text-base-content/70"
			onUsdChange={({ usdAmount: nextUsdAmount }) => updateBudgetAmount(nextUsdAmount)}
			onSatsChange={({ usdAmount: nextUsdAmount }) => {
				if (nextUsdAmount != null) {
					updateBudgetAmount(nextUsdAmount);
				}
			}}
		/>
	</div>

	<div class="w-full">
		<label for="description" class="label">
			<span class="label-text">{$t('task.description')}</span>
			{#if $store.task.description.length > 0}
				<span
					class="label-text-alt {$store.task.description.length >= 10000
						? 'text-warning'
						: 'text-base-content/60'}"
				>
					{$store.task.description.length}/10000 {$t('dashboard.bids.bid_creation.max')}
				</span>
			{/if}
		</label>
		<textarea
			id="description"
			data-testid="task-description-input"
			value={$store.task.description}
			oninput={(e) => {
				store.updateTask({ description: (e.target as HTMLTextAreaElement).value });
			}}
			class="textarea textarea-bordered h-32 w-full rounded-xl {descriptionError
				? 'textarea-error'
				: ''}"
			placeholder={$t('task.description_placeholder')}
			maxlength="10000"
		></textarea>
		{#if descriptionError}
			<span class="label-text-alt text-error">{descriptionError}</span>
		{/if}
	</div>

	<div class="w-full">
		<div class="my-5">
			<label for="attachments" class="label text-base-content block text-lg font-semibold">
				{$t('task.attachments_label')}
			</label>
			<label for="attachments" class="label-text-alt text-base-content/70 block">
				{$t('task.attachments_hint')}
			</label>
		</div>

		<!-- File Upload Grid -->
		<div class="space-y-4">
			<div
				class="grid grid-cols-2 justify-start gap-6 sm:grid-cols-4 sm:gap-36 md:grid-cols-6 lg:grid-cols-8"
			>
				{#each allFiles as file, index (index)}
					<div class="relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32">
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
							for="file-upload-attachments"
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
							<p class="mb-1 text-xs font-semibold sm:text-sm">{$t('task.attachments')}</p>
							<p class="text-center text-[8px] whitespace-normal sm:px-1 sm:text-xs">
								{$t('common.components.media_uploader.images')},
								{$t('common.components.media_uploader.videos')}
								{$t('common.components.media_uploader.max_info', {
									values: {
										size: 50,
										durationInfo: $t('common.components.media_uploader.duration_info', {
											values: { duration: 0.5 }
										})
									}
								})}
							</p>
							<input
								id="file-upload-attachments"
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

			<!-- Error -->
			{#if error}
				<div class="text-error text-sm">{error}</div>
			{/if}

			<!-- Compression Progress -->
			{#if isCompressing}
				<div class="space-y-2">
					<div class="text-info text-sm">
						{$t('common.components.media_uploader.compressing')}
						{compressionProgress.currentFile}
					</div>
					<div class="h-2 w-full rounded-full bg-gray-200">
						<div
							class="bg-info h-2 rounded-full transition-all duration-300"
							style="width: {(compressionProgress.processed / compressionProgress.total) * 100}%"
						></div>
					</div>
					<div class="text-xs text-gray-500">
						{compressionProgress.processed} / {compressionProgress.total}
					</div>
				</div>
			{/if}

			<!-- Uploading Progress -->
			{#if isUploading}
				<div class="space-y-2">
					<div class="text-info text-sm">
						{$t('common.components.media_uploader.uploading')}
						{uploadProgress.currentFile}
					</div>
					<div class="h-2 w-full rounded-full bg-gray-200">
						<div
							class="bg-info h-2 rounded-full transition-all duration-300"
							style="width: {(uploadProgress.completed / uploadProgress.total) * 100}%"
						></div>
					</div>
					<div class="text-xs text-gray-500">
						{uploadProgress.completed} / {uploadProgress.total}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
