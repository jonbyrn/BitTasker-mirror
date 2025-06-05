<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app.store';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';

	let { errors, direction } = $props();

	const handleFileUpload = async (files: File[]) => {
		if (!files || files.length === 0) return;

		try {
			const uploadedFiles = await uploadService.uploadMultipleFiles(files);
			uploadedFiles.forEach((file, index) => {
				if (!$store.task.attachments) return;
				$store.task.attachments.push({
					url: file.url,
					key: file.key,
					type: files[index].type,
					alt: files[index].name,
					size: files[index].size
				});
			});

			// Save to localStorage immediately after adding attachments
			store.saveDraft();
			appStore.showSuccessToast('Files uploaded successfully');
		} catch (error) {
			// Handle upload failure
			console.error('File upload failed:', error);
			errors.attachments = 'Failed to upload attachments. Please go back and try again.';
			appStore.showErrorToast('Failed to upload attachments. Please go back and try again.');
		}
	};
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
	<h3 class="text-lg font-semibold">Is this a removals task?</h3>
	<div class="flex gap-4">
		<button
			class="btn min-w-1/3 text-xl {$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
			onclick={() => ($store.isRemovals = true)}
		>
			Yes
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
			No
		</button>
	</div>

	<div class="h-1"></div>
	{#if $store.isRemovals}
		<div class="w-full">
			<LocationAutoComplete
				label="Pickup Location"
				placeholder="Enter address or ZIP code"
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
				label="Drop-off Location"
				placeholder="Enter address or ZIP code"
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
		<p class="text-md font-semibold">Where do you need this done?</p>

		<div class="flex gap-4">
			<button
				class="btn {$store.task?.taskType === 'IN_PERSON' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => store.updateTask({ taskType: TaskTypeEnum.IN_PERSON })}
			>
				In-person
			</button>
			<button
				class="btn {$store.task?.taskType === TaskTypeEnum.REMOTE ? 'btn-primary' : 'btn-outline'}"
				onclick={() => {
					store.updateTask({ taskType: TaskTypeEnum.REMOTE });
					store.updateTask({
						pickupLocation: {
							displayName: '',
							longitude: null,
							latitude: null,
							zipCode: '',
							locationLoaded: false
						},
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
				Remote
			</button>
		</div>

		{#if $store.task?.taskType === TaskTypeEnum.IN_PERSON}
			<div class="w-full">
				<LocationAutoComplete
					label="Location"
					placeholder="Enter address or ZIP code"
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
		<label for="attachments" class="label"> Attachments </label>

		<Uploader
			id="attachments"
			label="Attachments"
			files={$store.task.attachments?.map((file) => file.url)}
			maxFiles={5}
			maxFileSize={10}
			onChange={handleFileUpload}
		/>
	</div>
</div>
