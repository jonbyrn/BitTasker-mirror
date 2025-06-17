<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import Uploader from '$lib/components/Uploader.svelte';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';

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

	const handleFileUpload = async (files: File[]) => {
		if (($store.task.attachments?.length || 0) + files.length > 5) return;
		if (!files || files.length === 0) return;
		files.forEach((file) => {
			if (file instanceof File) {
				newFiles.push(file);
			}
		});
	};

	const handleFileRemove = (index: number, file?: File | string) => {
		if (file && file instanceof File) {
			newFiles = newFiles.filter((f: File) => f !== file);
		} else {
			const attachment = $store.task.attachments?.[index];
			attachmentsToRemove.push(attachment);
			$store.task.attachments?.splice(index, 1);
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
	<h3 class="text-lg font-semibold">Do you need something moved to another location?</h3>
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
		<p class="text-lg font-semibold">Where do you need this done?</p>

		<div class="flex gap-4">
			<button
				class="btn {$store.task?.taskType === TaskTypeEnum.IN_PERSON
					? 'btn-primary'
					: 'btn-outline'}"
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
		<div class="my-5">
			<label for="attachments" class="label block font-semibold text-white text-lg">
				Add videos and images
			</label>
			<label for="attachments" class="label-text-alt block text-white/70">
				Improve bid estimates by showing taskers what needs to be done
			</label>
		</div>

		<!-- TODO: Add support for videos -->
		<Uploader
			id="attachments"
			label="Attachments"
			files={$store.task.attachments?.map((file) => file.url)}
			maxFiles={5}
			maxFileSize={10}
			onChange={handleFileUpload}
			onRemove={handleFileRemove}
		/>
	</div>
</div>
