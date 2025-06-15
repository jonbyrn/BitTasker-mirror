<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { goto } from '$app/navigation';
	import { deleteTask } from '$lib/nostr/task';
	import { taskStore } from '$lib/stores/task.store';
	import { myTasksStore } from '$lib/stores/task.store';
	import { formatDistanceToNow, format } from 'date-fns';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';

	let { task, isOwner, onClose } = $props<{
		task: Task;
		isOwner: boolean;
		onClose: () => void;
	}>();

	let selectedImage = $state<string | null>(null);
	let isDeleting = $state(false);
	let errorMessage = $state('');

	// Format helpers
	const formatTimeAgo = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return formatDistanceToNow(dateObj, { addSuffix: true });
	};

	const formatDateString = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'MMM d, yyyy');
	};

	function handleEditTask() {
		const editTask = { ...task };
		['id', 'author'].forEach((key) => {
			delete editTask[key as keyof Task];
		});
		taskStore.saveEditTaskDraft(task?.id, task?.uniqueId, editTask);
		goto(`/dashboard/create-task?edit=true`);
	}

	async function handleDeleteTask() {
		try {
			isDeleting = true;
			if (!task?.id) return;
			await deleteTask(task.id);
			$myTasksStore.items = $myTasksStore.items.filter((t) => t.id !== task.id);
			onClose();
		} catch (error) {
			console.error('Failed to delete task:', error);
			errorMessage = 'Failed to delete task';
		} finally {
			isDeleting = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Task header with status and edit button -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			{#if task.status}
				<div
					class="badge {task.status === TaskStatusEnum.OPEN
						? 'badge-success'
						: task.status === TaskStatusEnum.COMPLETED
							? 'badge-primary'
							: 'badge-neutral'}"
				>
					{task.status}
				</div>
			{/if}
			{#if isOwner}
				<span class="badge badge-info">You are the owner</span>
			{:else}
				<span class="badge badge-info">You are the client</span>
			{/if}
		</div>

		{#if isOwner && task.status === TaskStatusEnum.OPEN}
			<button class="btn btn-outline btn-sm" onclick={handleEditTask}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
					/>
				</svg>
				Edit
			</button>
		{/if}
	</div>

	<!-- Task details -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h3 class="text-base-content/60 text-sm">Budget - {task.budget.type}</h3>
			<p class="text-lg font-semibold">
				{formatCurrency(task.budget.amount, task.budget.currency || 'USD')}
				{#if task.budget.type === 'HOURLY'}
					<span class="text-sm font-normal">/hr</span>
				{/if}
			</p>
		</div>

		<div>
			<h3 class="text-base-content/60 text-sm">Type</h3>
			<p class="font-semibold">
				{task.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In-Person'}
			</p>
		</div>

		{#if task.deadline}
			<div>
				<h3 class="text-base-content/60 text-sm">Deadline</h3>
				<p class="font-semibold">{formatTimeAgo(task.deadline)}</p>
				<p class="text-xs">{formatDateString(task.deadline)}</p>
			</div>
		{:else if task.dateRange}
			<div>
				<h3 class="text-base-content/60 text-sm">Date Range</h3>
				<p class="font-semibold">
					{formatDateString(task.dateRange.start)} - {formatDateString(task.dateRange.end)}
				</p>
			</div>
		{/if}

		<div>
			<h3 class="text-base-content/60 text-sm">Posted</h3>
			<p class="font-semibold">{formatTimeAgo(task.createdAt)}</p>
			<p class="text-xs">{formatDateString(task.createdAt)}</p>
		</div>
	</div>

	<!-- Task description -->
	<div>
		<h3 class="text-base-content/60 mb-1 text-sm">Description</h3>
		<div class="bg-base-200 rounded-box rounded-lg p-4 whitespace-pre-wrap">
			{task.description}
		</div>
	</div>

	<!-- Task skills -->
	{#if task.skills?.length > 0}
		<div>
			<h3 class="text-base-content/60 mb-1 text-sm">Required Skills</h3>
			<div class="flex flex-wrap gap-1">
				{#each task.skills as skill}
					<span class="badge badge-primary badge-outline pb-[2px]">{skill}</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task categories -->
	{#if task?.categories?.length > 0}
		<div>
			<h3 class="text-base-content/60 mb-1 text-sm">Categories</h3>
			<div class="flex flex-wrap gap-1">
				{#each task.categories as category}
					<span class="badge badge-outline/90 pb-[2px] text-white/90">
						{category}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task location -->
	{#if task.taskType === TaskTypeEnum.IN_PERSON}
		{#if task.pickupLocation}
			<div>
				<h3 class="text-base-content/60 mb-1 text-sm">Pickup Location</h3>
				<div class="flex items-center gap-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/60 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					<span>{task.pickupLocation.displayName || task.pickupLocation.zipCode}</span>
				</div>
			</div>
		{/if}

		{#if task.dropOffLocation && task.dropOffLocation.displayName}
			<div>
				<h3 class="text-base-content/60 mb-1 text-sm">Drop Off Location</h3>
				<div class="flex items-center gap-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/60 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
					</svg>
					<span>{task.dropOffLocation.displayName || task.dropOffLocation.zipCode}</span>
				</div>
			</div>
		{/if}
	{:else}
		<div>
			<p class="text-base-content/60 mb-1 text-sm">Remote task</p>
		</div>
	{/if}

	<!-- Task attachments -->
	{#if task.attachments && task.attachments.length > 0}
		<div class={!isOwner ? 'mb-20 sm:mb-0' : ''}>
			<h3 class="text-base-content/60 mb-1 text-sm">Attachments</h3>
			<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
				{#each task.attachments as image, i}
					<button
						class="group rounded-box relative overflow-hidden"
						onclick={() => (selectedImage = image.url)}
						aria-label="View attachment {i + 1}"
					>
						<img
							src={image.url}
							alt="Task attachment {i + 1}"
							loading="lazy"
							class="h-32 w-full object-cover transition-all duration-300 group-hover:scale-105"
						/>
						<div
							class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-8 w-8 text-white"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
								/>
							</svg>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if isOwner && task.status === TaskStatusEnum.OPEN}
		<div class="divider"></div>
		<button
			class="btn btn-error btn-outline btn-sm mb-20 block min-w-10 place-self-end sm:mb-0"
			onclick={handleDeleteTask}
			disabled={isDeleting}
		>
			{#if isDeleting}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				Delete Task
			{/if}
		</button>
	{/if}

	<!-- Action button for non-owners -->
	<!-- {#if !isOwner && task.status === TaskStatusEnum.OPEN}
            <div class="divider"></div>
            <div class="flex justify-center">
                <BidCreationForm taskId={task.id} onClose={() => {}} />
            </div>
        {/if} -->
</div>

{#if selectedImage}
	<div
		class="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={() => (selectedImage = null)}
		onkeydown={(e) => e.key === 'Escape' && (selectedImage = null)}
		role="dialog"
		aria-modal="true"
		aria-label="Image preview"
		tabindex="-1"
	>
		<button
			class="absolute top-4 right-4 text-white"
			onclick={(e) => {
				e.stopPropagation();
				selectedImage = null;
			}}
			aria-label="Close image preview"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
		<div class="max-h-[90vh] max-w-[90vw] overflow-auto">
			<img
				src={selectedImage}
				alt="Task attachment preview"
				class="max-h-full max-w-full rounded-lg object-contain"
			/>
		</div>
	</div>
{/if}
