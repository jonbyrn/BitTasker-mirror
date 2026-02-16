<script lang="ts">
	import type { TaskBody } from '$lib/types/task';
	import TaskLocationViewer from './TaskLocationViewer.svelte';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { t } from 'svelte-i18n';

	let { task, isRemovals = false } = $props<{
		task: TaskBody;
		isRemovals?: boolean;
	}>();

	// Determine if this is a removal task with both pickup and drop-off locations
	let isRemovalTask = $derived(
		isRemovals && 
		task.pickupLocation?.locationLoaded === true && 
		task.dropOffLocation?.locationLoaded === true
	);
	let isRemoteTask = $derived(task.taskType === TaskTypeEnum.REMOTE);
	
	// Check if we have a valid drop-off location
	let hasDropOffLocation = $derived(task.dropOffLocation?.locationLoaded === true);

	// Helper function to get complete address for display
	function getCompleteAddress(location: typeof task.pickupLocation | typeof task.dropOffLocation): string {
		if (!location) return '';
		return location.formattedAddress || location.displayName;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between flex-wrap">
		<h4 class="font-medium">{$t('task.location_title')}</h4>
		{#if isRemoteTask}
			<span class="badge badge-info text-black text-xs px-1">{$t('task.remote_task')}</span>
		{:else if isRemovalTask}
			<span class="badge badge-warning text-black text-xs px-1">{$t('task.removal_delivery')}</span>
		{:else}
			<span class="badge badge-success text-black text-xs px-1">{$t('task.in_person_badge')}</span>
		{/if}
	</div>

	{#if isRemoteTask}
		<div class="alert alert-success alert-outline">
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
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{$t('task.remote_completion_message')}</span>
		</div>
	{:else if task.pickupLocation?.locationLoaded}
		<!-- Show the map visualization only if we have both locations for removals -->
		{#if !isRemovals || hasDropOffLocation}
			<TaskLocationViewer
				pickupLocation={task.pickupLocation}
				dropOffLocation={task.dropOffLocation}
				isRemovals={isRemovalTask}
				height="400px"
				showDirections={isRemovalTask && hasDropOffLocation}
			/>
		{/if}

		<!-- Legend for removal tasks -->
		{#if isRemovals && task.dropOffLocation?.latitude && task.dropOffLocation?.longitude}
			<div class="mt-3 flex items-center justify-center gap-4 text-sm">
				<div class="flex items-center gap-1">
					<div class="h-3 w-3 rounded-full bg-orange-500"></div>
					<span>Pickup</span>
				</div>
				<div class="flex items-center gap-1">
					<div class="h-3 w-3 rounded-full bg-green-500" ></div>
					<span>Drop-off</span>
				</div>
				{#if isRemovalTask && hasDropOffLocation}
					<div class="flex items-center gap-1">
						<div class="h-0.5 w-4 bg-blue-500"></div>
						<span>Route</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Location details -->
		<div class="space-y-3">
			{#if isRemovalTask && hasDropOffLocation}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="alert border-orange-500">
						<div class="h-3 w-3 rounded-full bg-orange-500"></div>
						<div>
							<h4 class="font-semibold text-orange-500">{$t('task.pickup_location_review')}</h4>
							<p class="text-sm text-orange-500 wrap-break-word">{getCompleteAddress(task.pickupLocation)}</p>
							{#if task.pickupLocation.zipCode}
								<p class="text-xs text-orange-500">
									{$t('task.zip_label')}
									{task.pickupLocation.zipCode}
								</p>
							{/if}
						</div>
					</div>

					<div class="alert alert-success alert-outline">
						<div class="h-3 w-3 rounded-full bg-green-500"></div>
						<div>
							<h4 class="font-semibold ">{$t('task.dropoff_location_review')}</h4>
							<p class="text-sm wrap-break-word">{getCompleteAddress(task.dropOffLocation)}</p>
							{#if task.dropOffLocation.zipCode}
								<p class="text-xs ">
									{$t('task.zip_label')}
									{task.dropOffLocation.zipCode}
								</p>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<!-- Single location display with success alert design -->
				<div class="alert alert-success alert-outline">
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
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="wrap-break-word">{$t('task.location_picker.location_set')}: {getCompleteAddress(task.pickupLocation)}</span>
				</div>
			{/if}
		</div>
	{:else}
		<div class="alert alert-warning alert-outline">
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span>{$t('task.location_not_available')}</span>
		</div>
	{/if}
</div>
