<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { appStore } from '$lib/stores/app.store';

	let { errors, direction } = $props();
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h2 class="text-xl font-semibold">Review Your Task</h2>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<h3 class="mb-2 text-lg font-medium">Basic Information</h3>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div>
					<span class="font-medium">Title:</span>
					<span>{$store.task.title}</span>
				</div>

				<div>
					<span class="font-medium">Task Type:</span>
					<span>{$store.task.taskType === TaskTypeEnum.IN_PERSON ? 'In Person' : 'Remote'}</span>
				</div>

				<div>
					<span class="font-medium">Timeline:</span>
					<span>
						{#if $store.task.dateRange}
							From {new Date($store.task.dateRange.start).toLocaleDateString()} to {new Date(
								$store.task.dateRange.end
							).toLocaleDateString()}
						{:else}
							Deadline: {new Date($store.task.deadlineDate).toLocaleDateString()}
						{/if}
					</span>
				</div>
			</div>

			<h4 class="mt-3 font-medium">Categories</h4>
			<div class="flex flex-wrap gap-2">
				{#each $appStore.categories.filter( (cat) => $store.task.categoryIds.includes(cat.id) ) as category}
					<div class="badge badge-primary">{category.name}</div>
				{/each}
			</div>

			<h4 class="mt-3 font-medium">Skills</h4>
			<div class="flex flex-wrap gap-2">
				{#each $appStore.skills.filter((skill) => $store.task.skillIds.includes(skill.id)) as skill}
					<div class="badge badge-secondary">{skill.name}</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<h3 class="mb-2 text-lg font-medium">Location</h3>
			{#if $store.isRemovals}
				<div class="grid grid-cols-1 gap-2">
					<div>
						<span class="font-medium">Pickup Location:</span>
						<span>{$store.task.pickupLocation?.displayName}</span>
					</div>
					<div>
						<span class="font-medium">Drop-off Location:</span>
						<span>{$store.task.dropOffLocation?.displayName}</span>
					</div>
				</div>
			{:else if $store.task.taskType === TaskTypeEnum.IN_PERSON}
				<div>
					<span class="font-medium">Task Location:</span>
					<span>{$store.task.pickupLocation?.displayName}</span>
				</div>
			{:else}
				<div>Remote Task - No location specified</div>
			{/if}
		</div>
	</div>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<h3 class="mb-2 text-lg font-medium">Budget & Details</h3>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div>
					<span class="font-medium">Budget Type:</span>
					<span
						>{$store.task.budgetType === BudgetTypeEnum.FIXED ? 'Fixed Price' : 'Hourly Rate'}</span
					>
				</div>
				<div>
					<span class="font-medium">Budget Amount:</span>
					<span>${$store.task.budget}</span>
				</div>
				{#if $store.task.budgetType === BudgetTypeEnum.HOURLY}
					<div>
						<span class="font-medium">Estimated Hours:</span>
						<span>{$store.task.estimatedHours}</span>
					</div>
				{/if}
			</div>

			<h4 class="mt-3 font-medium">Description</h4>
			<div class="bg-base-100 mt-1 rounded-md p-3">
				<p>{$store.task.description}</p>
			</div>

			{#if $store.task.attachments && $store.task.attachments.length > 0}
				<h4 class="mt-3 font-medium">Attachments</h4>
				<div class="flex flex-wrap gap-2">
					{#each $store.task.attachments as attachment, i}
						<div class="badge badge-outline">
							<span class="max-w-xs truncate">{attachment.fileName}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if $store.recurringTask.isRecurring}
		<div class="alert alert-info">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<div>
				<h3 class="font-bold">This is a recurring task!</h3>
				<div class="text-sm">After review, you'll be asked to set up the recurring schedule.</div>
			</div>
		</div>
	{/if}

	{#if errors.general}
		<div class="alert alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<span>{errors.general}</span>
		</div>
	{/if}
</div>
