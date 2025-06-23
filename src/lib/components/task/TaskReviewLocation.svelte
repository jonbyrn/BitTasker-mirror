<script lang="ts">
	import type { TaskBody } from '$lib/types/task';
	import TaskLocationViewer from './TaskLocationViewer.svelte';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';

	let { 
		task,
		isRemovals = false 
	} = $props<{
		task: TaskBody;
		isRemovals?: boolean;
	}>();

	// Determine if this is a removal task
	let isRemovalTask = $derived(isRemovals || task.dropOffLocation?.locationLoaded === true);
	let isRemoteTask = $derived(task.taskType === TaskTypeEnum.REMOTE);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">Task Location</h3>
		{#if isRemoteTask}
			<span class="badge badge-info text-black">Remote Task</span>
		{:else if isRemovalTask}
			<span class="badge badge-warning text-black">Removal/Delivery</span>
		{:else}
			<span class="badge badge-success text-black">In-Person</span>
		{/if}
	</div>

	{#if isRemoteTask}
		<div class="alert alert-info">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="h-6 w-6 shrink-0 stroke-current"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>This task can be completed remotely</span>
		</div>
	{:else if task.pickupLocation?.locationLoaded}
		<!-- Show the map visualization -->
		<TaskLocationViewer
			pickupLocation={task.pickupLocation}
			dropOffLocation={task.dropOffLocation}
			isRemovals={isRemovalTask}
			height="400px"
			showDirections={true}
		/>

		<!-- Location details -->
		<div class="space-y-3">
			{#if isRemovalTask}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="card bg-green-50 border border-green-200 rounded-xl">
						<div class="card-body p-4">
							<h4 class="text-sm font-semibold text-green-800 flex items-center gap-2">
								<div class="w-3 h-3 bg-green-500 rounded-full"></div>
								Pickup Location
							</h4>
							<p class="text-sm text-green-700">{task.pickupLocation.displayName}</p>
							{#if task.pickupLocation.zipCode}
								<p class="text-xs text-green-600">ZIP: {task.pickupLocation.zipCode}</p>
							{/if}
						</div>
					</div>

					{#if task.dropOffLocation?.locationLoaded}
						<div class="card bg-red-50 border border-red-200 rounded-xl">
							<div class="card-body p-4">
								<h4 class="text-sm font-semibold text-red-800 flex items-center gap-2">
									<div class="w-3 h-3 bg-red-500 rounded-full"></div>
									Drop-off Location
								</h4>
								<p class="text-sm text-red-700">{task.dropOffLocation.displayName}</p>
								{#if task.dropOffLocation.zipCode}
									<p class="text-xs text-red-600">ZIP: {task.dropOffLocation.zipCode}</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="card bg-blue-50 border border-blue-200">
					<div class="card-body p-4">
						<h4 class="text-sm font-semibold text-blue-800 flex items-center gap-2">
							<div class="w-3 h-3 bg-blue-500 rounded-full"></div>
							Task Location
						</h4>
						<p class="text-sm text-blue-700">{task.pickupLocation.displayName}</p>
						{#if task.pickupLocation.zipCode}
							<p class="text-xs text-blue-600">ZIP: {task.pickupLocation.zipCode}</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="alert alert-warning">
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
			<span>Location information not available</span>
		</div>
	{/if}
</div> 