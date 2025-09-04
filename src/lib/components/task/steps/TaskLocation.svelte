<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import { t, locale } from 'svelte-i18n';

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

</div>
