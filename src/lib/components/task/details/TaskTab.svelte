<script lang="ts">
	import type { Attachment, Task } from '$lib/types/task';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { formatStandardDate, formatStandardDateShort, formatStandardDateTime, parseDateToLocalMidnight } from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { fade, scale } from 'svelte/transition';
	import { getContracts } from '$lib/utils/nostr-contract';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { contractStore } from '$lib/stores/contract.store';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';
	import TaskShareButton from '../TaskShareButton.svelte';
	// Icon imports for unplugin-icons
	import IconPlus from '~icons/mdi/plus';

	let { task, isOwner, onClose, onRequestEditConfirm, onRequestDeleteConfirm, isDeleting, onBid } = $props<{
		task: Task;
		isOwner: boolean;
		onClose: () => void;
		onRequestEditConfirm?: () => void;
		onRequestDeleteConfirm?: () => void;
		isDeleting?: boolean;
		onBid?: () => void;
	}>();

	let btcPrice = $state<number>(63000); // Default fallback price
	let canDelete = $state(true); // Default to true, will be checked
	let isCheckingDelete = $state(false);

	// Helper function to format date string with time (for timestamps like createdAt)
	function formatDateStringWithTime(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		if (!dateObj || isNaN(dateObj.getTime())) return '';
		return formatStandardDateTime(dateObj, $locale || 'en');
	}

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	function handleEditTask() {
		if (onRequestEditConfirm) {
			onRequestEditConfirm();
		}
	}

	// Check if task can be deleted (similar to contract deletion logic)
	async function checkCanDeleteTask(): Promise<void> {
		if (!task?.id) {
			canDelete = false;
			return;
		}

		try {
			isCheckingDelete = true;
			
			// Check if task has any contracts (which means it has an escrow)
			const contracts = await getContracts({ taskIds: [task.id] });
			
			if (contracts.length === 0) {
				// No contracts found - task was never funded, can delete
				canDelete = true;
				return;
			}

			// Task has contracts - check if any escrow was funded
			for (const contract of contracts) {
				const fundingStatus = await escrow.checkEscrowFundingStatus(contract.escrowData.id);
				
				if (fundingStatus.error) {
					// Error checking escrow - be conservative and disallow deletion
					canDelete = false;
					return;
				}
				
				if (fundingStatus.wasFunded) {
					// Escrow was funded - cannot delete
					canDelete = false;
					return;
				}
			}
			
			// All escrows were never funded - can delete
			canDelete = true;
		} catch (error) {
			console.error('Error checking if task can be deleted:', error);
			// On error, be conservative and disallow deletion
			canDelete = false;
		} finally {
			isCheckingDelete = false;
		}
	}

	// Show delete confirmation
	function showDeleteConfirmation() {
		if (!canDelete) return;
		onRequestDeleteConfirm();
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			throw new Error('Unable to fetch Bitcoin price. Please try again later.');
		}
	}


	onMount(() => {
		fetchBtcPrice();
		checkCanDeleteTask();
	});
</script>

<div class="space-y-6">
	<!-- Task header with status and edit button -->
	<!-- 	<div class="flex items-center justify-between">
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
	</div> -->

	<!-- Task details -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 relative">
		<!-- Share Button - Upper Right Corner -->
		<div class="absolute top-0 right-0 z-10" onclick={(e) => e.stopPropagation()}>
			<TaskShareButton {task} variant="circle" />
		</div>
		<div>
			<small class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.budget')} - {task.budget.type}
			</small>

			<div class="text-lg font-bold">
				${formatNumberWithTwoDecimals(task.budget.amount)}

				<div class="text-base-content/60 text-sm">
					{satsFromUsd(task.budget.amount, btcPrice)}
				</div>
			</div>
		</div>

		<div>
			<small class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.type')}
			</small>
			<p class="font-semibold">
				{task.taskType === TaskTypeEnum.REMOTE
					? $t('dashboard.task_details_by_task.remote')
					: $t('dashboard.task_details_by_task.in_person')}
			</p>
		</div>

		{#if task.deadline}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.deadline')}
				</small>
				<p class="font-semibold">
					{formatStandardDate(parseDateToLocalMidnight(task.deadline) || new Date(task.deadline), $locale || 'en')}
				</p>
			</div>
		{:else if task.dateRange}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.date_range')}
				</small>
				<p class="font-semibold">
					{formatStandardDateShort(parseDateToLocalMidnight(task.dateRange.start) || new Date(task.dateRange.start), $locale || 'en')} - {formatStandardDateShort(
						parseDateToLocalMidnight(task.dateRange.end) || new Date(task.dateRange.end),
						$locale || 'en'
					)}
				</p>
			</div>
		{/if}

		<div>
			<small class="text-base-content/60 text-sm"
				>{$t('dashboard.task_details_by_task.posted')}</small
			>
			<p class="font-semibold">{formatDateStringWithTime(task.createdAt)}</p>
		</div>
	</div>

	<!-- Task description -->
	<div class="mb-4">
		<small class="text-base-content/60"
			>{$t('dashboard.task_details_by_task.description_task')}</small
		>
		<div class="bg-base-200 rounded-2xl p-3">
			<div class="max-h-28 overflow-y-auto">
				<TranslatableTask 
					{task} 
					showTitle={false}
					showDescription={true}
					showToggle={false}
					descriptionClass="text-sm whitespace-pre-line"
				/>
			</div>
		</div>
	</div>

	<!-- Task skills -->
	{#if task.skills?.length > 0}
		<div>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.required_skills')}
			</small>
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
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.categories')}
			</small>
			<div class="flex flex-wrap gap-1">
				{#each task.categories as category}
					<span class="badge badge-outline badge-info pb-[2px]">
						{typeof category === 'string' ? category : category.name}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task location -->
	<div class="space-y-3">
		{#if task.taskType === TaskTypeEnum.REMOTE}
			<!-- Remote task - show message that it can be completed remotely -->
			<div class="alert alert-outline alert-info">
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
				<span>{$t('dashboard.task_details_by_task.remote_location_description')}</span>
			</div>
		{:else}
			<!-- In-person task - show pickup and/or dropoff locations -->
			{#if task.pickupLocation && task.pickupLocation.latitude !== null && task.pickupLocation.longitude !== null && task.pickupLocation.locationLoaded}
				<LocationDetailsCard
					location={task.pickupLocation}
					label={$t('common.location.pickup_location')}
					showDirections={true}
					showAddress={true}
				/>
			{/if}
			{#if task.dropOffLocation && task.dropOffLocation.latitude !== null && task.dropOffLocation.longitude !== null && task.dropOffLocation.locationLoaded && task.dropOffLocation.displayName}
				<LocationDetailsCard
					location={task.dropOffLocation}
					label={$t('common.location.dropoff_location')}
					showDirections={true}
					showAddress={true}
				/>
			{/if}
		{/if}
	</div>

	<!-- Task attachments -->
	{#if task.attachments && task.attachments.length > 0}
		<div class={!isOwner ? 'mb-20 sm:mb-0' : ''}>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.attachments')}
			</small>

			<div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
				{#each task.attachments as attachment, i}
					{#if isVideoFile(attachment.url)}
						<!-- Video -->
						<div class="bg-base-200 overflow-hidden rounded-lg pb-4">
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
					{:else}
						<!-- Image -->
						<div class="overflow-hidden rounded-lg pb-4 bg-base-200">
							<img
								src={attachment.url}
								alt={attachment?.alt || 'Attachment'}
								class="h-32 w-full object-cover"
							/>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<div class="space-y-3 pb-4">
		<!-- Action Buttons Row -->
		<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
			<!-- Bid Button (shown when task is open and user is not owner) -->
			{#if task.status === TaskStatusEnum.OPEN && !isOwner && onBid}
				<button
					class="btn btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none gap-2"
					onclick={async (e) => {
						e.stopPropagation();
						if (onBid) {
							await onBid();
						}
					}}
					aria-label={$t('dashboard.task_details_by_task.bid_now') || 'Bid on this task'}
				>
					<IconPlus class="h-4 w-4 shrink-0" />
					<span>{$t('dashboard.task_details_by_task.bid_now')}</span>
				</button>
			{/if}

			{#if isOwner && task.status === TaskStatusEnum.OPEN && onRequestEditConfirm}
				<button class="btn btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none" onclick={handleEditTask}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4 shrink-0"
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
			
			<!-- Delete Button (only shown when onRequestDeleteConfirm is provided) -->
			{#if isOwner && onRequestDeleteConfirm}
				<button
					class="btn btn-error btn-sm min-h-[40px] flex-1 sm:flex-none"
					onclick={showDeleteConfirmation}
					disabled={(isDeleting ?? false) || isCheckingDelete || !canDelete}
				>
					{#if (isDeleting ?? false) || isCheckingDelete}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					{/if}
					{$t('dashboard.task_details_by_task.delete_task')}
				</button>
			{/if}
		</div>
	</div>
</div>
