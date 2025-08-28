<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import { t, locale } from 'svelte-i18n';

	let {
		errors,
		direction,
		newFiles = $bindable(),
		attachmentsToRemove = $bindable()
	} = $props<{
		errors: Record<string, string>;
		direction: 'forward' | 'backward';
		newFiles: File[];
		attachmentsToRemove: Attachment[];
	}>();

	// Handle file upload results from MediaUploader
	const handleUploadResults = (results: UploadResult[]) => {
		// Convert UploadResult to Attachment format
		const attachments: Attachment[] = results.map(result => ({
			key: result.key,
			url: result.url,
			type: result.type === 'image' ? 'image/*' : result.type === 'video' ? 'video/*' : 'document',
			alt: result.key, // Use key as alt for now
			cloudflareId: result.cloudflareId,
			variants: result.variants
		}));

		// Add to existing attachments
		$store.task.attachments = [...($store.task.attachments || []), ...attachments];
		
		// Clear newFiles since they've been uploaded
		newFiles = [];
	};

	// Handle file removal for both new and existing files
	const handleFileRemove = (index: number, file?: File | string | UploadResult) => {
		if (typeof file === 'string') {
			// Find the attachment to remove and schedule it for deletion
			const attachment = $store.task.attachments?.find((att) => att.url === file);
			if (attachment) {
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				// Remove from store
				const attachmentIndex = $store.task.attachments?.findIndex((att) => att.url === file);
				if (attachmentIndex !== undefined && attachmentIndex >= 0) {
					$store.task.attachments?.splice(attachmentIndex, 1);
				}
			}
		} else if (file instanceof File) {
			// Remove from new files
			const newFileIndex = newFiles.findIndex(f => f === file);
			if (newFileIndex >= 0) {
				newFiles.splice(newFileIndex, 1);
				newFiles = [...newFiles]; // Trigger reactivity
			}
		} else if (file && typeof file === 'object' && 'key' in file) {
			// UploadResult - find in attachments and remove
			const attachment = $store.task.attachments?.find((att) => att.key === file.key);
			if (attachment) {
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				const attachmentIndex = $store.task.attachments?.findIndex((att) => att.key === file.key);
				if (attachmentIndex !== undefined && attachmentIndex >= 0) {
					$store.task.attachments?.splice(attachmentIndex, 1);
				}
			}
		} else {
			// Fallback: remove by index from attachments
			if ($store.task.attachments && index < $store.task.attachments.length) {
				const attachment = $store.task.attachments[index];
				attachmentsToRemove = [...attachmentsToRemove, attachment];
				$store.task.attachments.splice(index, 1);
			}
		}
	};

	// Combine saved attachments (as URLs) with new files for the Uploader
	let uploaderFiles = $derived(
		(() => {
			const savedAttachments = $store.task.attachments?.map((file) => file.url) || [];
			return [...savedAttachments, ...newFiles];
		})()
	);
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
	<h3 class="text-lg font-semibold">{$t('task.relocation_question')}</h3>
	<div class="flex gap-4">
		<button
			class="btn min-w-1/3 text-xl {$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
			onclick={() => ($store.isRemovals = true)}
		>
			{$t('task.yes')}
		</button>
		<button
			class="btn min-w-1/3 text-xl {!$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
			onclick={() => {
				$store.isRemovals = false;
				store.updateTask({
					dropOffLocation: {
						displayName: '',
						longitude: null,
						latitude: null,
						zipCode: '',
						locationLoaded: false
					}
				});
			}}
		>
			{$t('task.no')}
		</button>
	</div>

	<div class="h-1"></div>
	{#if $store.isRemovals}
		<div class="w-full">
			<LocationAutoComplete
				label={$t('task.pickup_location')}
				placeholder={$t('task.address_placeholder')}
				location={$store.task.pickupLocation}
				onLocationSelect={(location) => {
					store.updateTask({
						pickupLocation: {
							...location,
							locationLoaded: true
						}
					});
				}}
			/>
		</div>
		<div class="w-full">
			<LocationAutoComplete
				label={$t('task.dropoff_location')}
				placeholder={$t('task.address_placeholder')}
				location={$store.task.dropOffLocation}
				onLocationSelect={(location) => {
					store.updateTask({
						dropOffLocation: {
							...location,
							locationLoaded: true
						}
					});
				}}
			/>
		</div>
		{#if errors.location}
			<span class="label-text-alt text-error block">{errors.location}</span>
		{/if}
	{:else}
		<p class="text-lg font-semibold">{$t('task.location_question')}</p>

		<div class="flex gap-4">
			<button
				class="btn {$store.task?.taskType === TaskTypeEnum.IN_PERSON
					? 'btn-primary'
					: 'btn-outline'}"
				onclick={() => store.updateTask({ taskType: TaskTypeEnum.IN_PERSON })}
			>
				{$t('task.in_person')}
			</button>
			<button
				class="btn {$store.task?.taskType === TaskTypeEnum.REMOTE ? 'btn-primary' : 'btn-outline'}"
				onclick={() => {
					const defaultLocation = {
						displayName: '',
						longitude: null,
						latitude: null,
						zipCode: '',
						locationLoaded: false
					};
					store.updateTask({
						taskType: TaskTypeEnum.REMOTE,
						pickupLocation: defaultLocation,
						dropOffLocation: defaultLocation
					});
				}}
			>
				{$t('task.remote')}
			</button>
		</div>

		{#if $store.task?.taskType === TaskTypeEnum.IN_PERSON}
			<div class="w-full">
				<LocationAutoComplete
					label={$t('task.location')}
					placeholder={$t('task.address_placeholder')}
					location={$store.task.pickupLocation}
					onLocationSelect={(location) => {
						store.updateTask({
							pickupLocation: {
								...location,
								locationLoaded: true
							}
						});
					}}
				/>
				{#if errors.location}
					<span class="label-text-alt text-error">{errors.location}</span>
				{/if}
			</div>
		{/if}
	{/if}

	<div class="w-full">
		<div class="my-5">
			<label for="attachments" class="label block text-lg font-semibold text-white">
				{$t('task.attachments_label')}
			</label>
			<label for="attachments" class="label-text-alt block text-white/70">
				{$t('task.attachments_hint')}
			</label>
		</div>

		<MediaUploader
			id="attachments"
			label={$t('task.attachments')}
			allowedTypes={['image/*', 'video/*']}
			files={uploaderFiles}
			maxFiles={5}
			maxFileSize={200}
			maxDuration={30}
			className="w-full h-full min-h-28"
			enableImageCompression={true}
			compressionQuality={0.8}
			maxImageDimension={3840}
			showCompressionInfo={true}
			useCloudflare={true}
			generateVariants={true}
			uploadFolder="tasks"
			onChange={handleUploadResults}
			onRemove={handleFileRemove}
		/>
	</div>
</div>
