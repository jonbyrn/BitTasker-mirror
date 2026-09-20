<script lang="ts">
	import { t } from 'svelte-i18n';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import LocationPicker from '$lib/components/LocationPicker.svelte';

	let { errors, direction } = $props<{
		errors: Record<string, string>;
		direction: 'forward' | 'backward';
	}>();
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
	<h4 class="text-lg font-semibold">{$t('task.relocation_question')}</h4>
	<div class="flex gap-4">
		<button
			class="btn {$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
			onclick={() => ($store.isRemovals = true)}
		>
			{$t('task.yes')}
		</button>
		<button
			class="btn {!$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
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
			<div class="mb-6">
				<h5 class="text-md text-primary font-semibold">📍 {$t('task.start_location')}</h5>
				<p class="text-base-content text-sm">{$t('task.pickup_location_description')}</p>
			</div>
			<p class="text-base-content mb-2">{$t('task.location_map_instruction')}</p>
			<LocationPicker
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
				showMap={true}
				mapHeight="300px"
				showFullscreen={true}
				showGeolocation={true}
				showServiceRadius={false}
			/>
		</div>
		<div class="w-full">
			<div class="mt-10 mb-6">
				<h5 class="text-md text-success font-semibold">🏁 {$t('task.destination_location')}</h5>
				<p class="text-base-content text-sm">{$t('task.dropoff_location_description')}</p>
			</div>
			<p class="text-base-content mb-2 text-sm">{$t('task.location_map_instruction')}</p>
			<LocationPicker
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
				showMap={true}
				mapHeight="300px"
				showFullscreen={true}
				showGeolocation={true}
				showServiceRadius={false}
			/>
		</div>
		{#if errors.location}
			<span class="label-text-alt text-error block">{errors.location}</span>
		{/if}
	{:else}
		<p class="text-lg font-semibold">{$t('task.location_question')}</p>

		<div class="flex gap-4">
			<button
				type="button"
				class="btn {$store.task?.taskType === TaskTypeEnum.IN_PERSON
					? 'btn-primary'
					: 'btn-outline'}"
				data-testid="in-person-task-btn"
				onclick={() => store.updateTask({ taskType: TaskTypeEnum.IN_PERSON })}
			>
				{$t('task.in_person')}
			</button>
			<button
				class="btn {$store.task?.taskType === TaskTypeEnum.REMOTE ? 'btn-primary' : 'btn-outline'}"
				data-testid="remote-task-btn"
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
				<p class="text-base-content mb-2 text-sm">{$t('task.location_map_instruction')}</p>
				<LocationPicker
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
					showMap={true}
					mapHeight="300px"
					showFullscreen={true}
					showGeolocation={true}
					showServiceRadius={false}
				/>
				{#if errors.location}
					<span class="label-text-alt text-error">{errors.location}</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>
