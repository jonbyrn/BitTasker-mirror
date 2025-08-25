<script lang="ts">
	import type { Task, Attachment } from '$lib/types/task';
	import { goto } from '$app/navigation';
	import { deleteTask } from '$lib/nostr/task';
	import { taskStore } from '$lib/stores/task.store';
	import { myTasksStore } from '$lib/stores/task.store';
	import { format } from 'date-fns';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { formatCurrencyWithUsd } from '$lib/utils/helpers/currencyFormatter';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { calculateUsdtEstimate } from '$lib/utils/helpers/crypto';
	import Gallery from '$lib/components/Gallery.svelte';

	let { task, isOwner, onClose } = $props<{
		task: Task;
		isOwner: boolean;
		onClose: () => void;
	}>();

	let isDeleting = $state(false);
	let errorMessage = $state('');
	let btcPrice = $state<number>(63000); // Default fallback price

	const formatDateString = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'M/d/yyyy, haaa');
	};

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Helper function to prepare images for Gallery component
	const prepareGalleryImages = async (attachments: Attachment[]) => {
		const imagePromises = attachments
			.filter((attachment) => !isVideoFile(attachment.url))
			.map((attachment) => {
				return new Promise((resolve) => {
					const img = new Image();
					img.onload = () => {
						resolve({
							url: attachment.url,
							alt: attachment.alt || 'Task attachment',
							width: img.naturalWidth,
							height: img.naturalHeight,
							size: attachment.size
						});
					};
					img.onerror = () => {
						resolve({
							url: attachment.url,
							alt: attachment.alt || 'Task attachment',
							width: 0,
							height: 0,
							size: attachment.size
						});
					};
					img.src = attachment.url;
				});
			});

		return await Promise.all(imagePromises);
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

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	onMount(() => {
		fetchBtcPrice();
	});
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
				{$t('dashboard.task_details_by_task.edit_task')}
			</button>
		{/if}
	</div>

	<!-- Task details -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<h5 class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.budget')} - {task.budget.type}
			</h5>
			<div class="text-lg font-bold">
				${calculateUsdtEstimate(task.budget.amount, btcPrice)}
				<div class="text-base-content/60 text-lowercase text-sm">
					{formatCurrencyWithUsd(task.budget.amount, task.budget.currency || 'USD', btcPrice, true)}
				</div>
			</div>
		</div>

		<div>
			<h5 class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.type')}
			</h5>
			<p class="font-semibold">
				{task.taskType === TaskTypeEnum.REMOTE
					? $t('dashboard.task_details_by_task.remote')
					: $t('dashboard.task_details_by_task.in_person')}
			</p>
		</div>

		{#if task.deadline}
			<div>
				<h5 class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.deadline')}
				</h5>
				<p class="font-semibold">
					{new Date(task.deadline).toLocaleDateString('en-US', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric'
					})}, 12pm
				</p>
			</div>
		{:else if task.dateRange}
			<div>
				<h5 class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.date_range')}
				</h5>
				<p class="font-semibold">
					{new Date(task.dateRange.start).toLocaleDateString('en-US', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric'
					})} - {new Date(task.dateRange.end).toLocaleDateString('en-US', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric'
					})}
				</p>
			</div>
		{/if}

		<div>
			<h5 class="text-base-content/60 text-sm">{$t('dashboard.task_details_by_task.posted')}</h5>
			<p class="font-semibold">{formatDateString(task.createdAt)}</p>
		</div>
	</div>

	<!-- Task description -->
	<div class="mb-4">
		<h4 class="mb-2 font-medium">{$t('dashboard.task_details_by_task.description_task')}</h4>
		<div class="bg-base-200 rounded-2xl p-3">
			<div class="max-h-[7rem] overflow-y-auto">
				<p>{task.description}</p>
			</div>
		</div>
	</div>

	<!-- Task skills -->
	{#if task.skills?.length > 0}
		<div>
			<h5 class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.required_skills')}
			</h5>
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
			<h5 class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.categories')}
			</h5>
			<div class="flex flex-wrap gap-1">
				{#each task.categories as category}
					<span class="badge badge-outline badge-info pb-[2px]">
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
				<h5 class="text-base-content/60 mb-1 text-sm">
					{$t('dashboard.task_details_by_task.pickup_location')}
				</h5>
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
				<h5 class="text-base-content/60 mb-1 text-sm">
					{$t('dashboard.task_details_by_task.dropoff_location')}
				</h5>
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
			<p class="text-base-content/60 mb-1 text-sm">{$t('dashboard.task_details_by_task.remote')}</p>
		</div>
	{/if}

	<!-- Task attachments -->
	{#if task.attachments && task.attachments.length > 0}
		<div class={!isOwner ? 'mb-20 sm:mb-0' : ''}>
			<h5 class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.attachments')}
			</h5>

			<!-- Images using PhotoSwipe Gallery -->
			{#if task.attachments.filter((att: Attachment) => !isVideoFile(att.url)).length > 0}
				<div class="mb-4">
					{#await prepareGalleryImages(task.attachments) then galleryImages}
						<Gallery
							galleryID="task-tab-images-gallery"
							images={galleryImages}
							thumbnailSize="h-32 w-32"
						/>
					{/await}
				</div>
			{/if}

			<!-- Videos in grid layout -->
			{#if task.attachments.filter((att: Attachment) => isVideoFile(att.url)).length > 0}
				<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
					{#each task.attachments.filter( (att: Attachment) => isVideoFile(att.url) ) as attachment, i}
						<div class="bg-base-200 overflow-hidden rounded-lg">
							<video class="h-32 w-full object-cover" controls preload="metadata">
								<source src={attachment.url} type="video/mp4" />
								<track kind="captions" src="" label="English" />
								{$t('dashboard.task_details_by_task.video_not_supported')}
							</video>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
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
				{$t('dashboard.task_details_by_task.delete_task')}
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
