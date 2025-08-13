<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Task } from '$lib/types/task';
	import { formatDistanceToNow, format } from 'date-fns';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import BidCreationForm from './BidCreationForm.svelte';
	import { calculateUsdtEstimate, formatSatsAmount } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		taskId: string | null;
		isOpen: boolean;
		onClose: () => void;
	}>();

	// State
	let task = $state<Task | null>(null);
	let loading = $state(false);
	let errorMessage = $state('');
	let bidSubmitted = $state(false);
	let showBidForm = $state(false);

	// Bid form state
	let amount = $state('');
	let description = $state('');
	let estimatedDuration = $state('');
	let proposedApproach = $state('');
	let hourlyRate = $state('');
	let estimatedHours = $state('');
	let bidType = $state<'FIXED' | 'HOURLY'>('FIXED');
	let bidFormErrors = $state<Record<string, string>>({});

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle drawer state changes, including scroll locking
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();

			// Load task details if taskId is available
			if (props.taskId) {
				loadTaskDetails(props.taskId);
			}
		} else {
			// Reset state when drawer closes
			bidSubmitted = false;
			showBidForm = false;
			resetBidForm();

			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	let btcPrice = $state<number>(120000); // Default fallback price

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	async function loadTaskDetails(taskId: string) {
		if (!taskId) return;

		try {
			loading = true;
			errorMessage = '';

			const { data: event } = await nostrEventsService.findEventById(taskId);

			if (!event) {
				errorMessage = $t('bids.task_details.error.failed_to_load');
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;

			// Ensure we have a valid ID
			if (!event.id) {
				errorMessage = $t('bids.task_details.error.task_id_missing');
				return;
			}

			task = {
				...taskData,
				id: event.id
			};

			// Default to showing the bid form
			showBidForm = true;
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('bids.task_details.error.failed_to_load_details');
		} finally {
			loading = false;
		}
	}

	function resetBidForm() {
		amount = '';
		description = '';
		estimatedDuration = '';
		proposedApproach = '';
		hourlyRate = '';
		estimatedHours = '';
		bidType = 'FIXED';
		bidFormErrors = {};
	}

	const handleClose = () => props.onClose();

	const formatTimeAgo = (date: string | number): string =>
		formatDistanceToNow(typeof date === 'number' ? new Date(date * 1000) : new Date(date), {
			addSuffix: true
		});

	onMount(() => {
		if (browser) {
			fetchBtcPrice();
		}
	});
</script>

<!-- Drawer Overlay -->
<div
	class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!props.isOpen}
	class:invisible={!props.isOpen}
	onclick={props.onClose}
	onkeydown={(e) => e.key === 'Escape' && props.onClose()}
	role="dialog"
	tabindex="-1"
></div>

<div
	class="bg-base-100 fixed top-0 right-0 z-50 h-full w-full transform overflow-auto shadow-xl transition-transform duration-300 sm:w-[70%] {props.isOpen
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<!-- Header -->
	<div class="bg-base-200 sticky top-0 z-10 flex items-center justify-between border-b p-4">
		<h2 id="drawer-title" class="text-xl font-bold">
			{loading
				? $t('bids.task_details.loading')
				: bidSubmitted
					? $t('bids.task_details.bid_submitted')
					: task
						? $t('bids.task_details.task_details')
						: $t('bids.task_details.task_not_found')}
		</h2>
		<button class="btn btn-ghost btn-circle" onclick={handleClose} aria-label="Close dialog">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
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
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
		<!-- Error state -->
	{:else if errorMessage}
		<div class="p-4">
			<div class="alert alert-error alert-outline">
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
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{errorMessage}</span>
			</div>
			<div class="mt-4 flex justify-center">
				<button
					class="btn btn-primary"
					onclick={() => props.taskId && loadTaskDetails(props.taskId)}
				>
					{$t('bids.task_details.try_again')}
				</button>
			</div>
		</div>
		<!-- Success state after bid submission -->
	{:else if bidSubmitted}
		<div class="p-8 text-center">
			<div class="mb-6">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-success mx-auto h-16 w-16"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h3 class="mb-2 text-2xl font-bold">{$t('bids.task_details.success.title')}</h3>
			<p class="mb-6">
				{$t('bids.task_details.success.message')}
			</p>
			<div class="flex justify-center gap-4">
				<button class="btn btn-primary" onclick={handleClose}>
					{$t('bids.task_details.success.close')}
				</button>
			</div>
		</div>
		<!-- Task details and bid form -->
	{:else if task}
		<div class="p-4">
			<!-- Task details section -->
			<div class="mb-6">
				<div class="mb-4 flex items-center justify-between">
					<h4 class="line-clamp-3">{task.title}</h4>
					<div class="flex items-center gap-2">
						<span class="badge badge-primary badge-outline">
							{task.status}
						</span>
					</div>
				</div>

				<div class="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
					<div>
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.budget')}:
						</span>
						<div class="font-semibold">
							{formatSatsAmount(task.budget.amount)}
							{#if task.budget.type === 'HOURLY'}
								<span class="text-base-content/60 ml-1 text-xs">/hr</span>
							{/if}
						</div>
						<span class="text-info text-xs"
							>≈ {calculateUsdtEstimate(task.budget.amount, btcPrice)} USDT</span
						>
					</div>

					<div>
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.type')}:
						</span>
						<div class="font-semibold">
							{task.taskType === TaskTypeEnum.REMOTE
								? $t('bids.task_details.remote')
								: $t('bids.task_details.in_person')}
						</div>
					</div>

					{#if task.deadline}
						<div>
							<span class="text-base-content/60 text-sm">
								{$t('bids.task_details.deadline')}:
							</span>
							<div class="font-semibold">{formatTimeAgo(task.deadline)}</div>
						</div>
					{:else if task.dateRange}
						<div>
							<span class="text-base-content/60 text-sm">
								{$t('bids.task_details.date_range')}:
							</span>
							<div class="font-semibold">
								{format(new Date(task.dateRange.start), 'MMM d, yyyy')} -
								{format(new Date(task.dateRange.end), 'MMM d, yyyy')}
							</div>
						</div>
					{/if}

					<div>
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.posted')}:
						</span>
						<div class="font-semibold">{formatTimeAgo(task.createdAt)}</div>
					</div>
				</div>

				<div class="mb-4">
					<span class="text-base-content/60 text-sm">
						{$t('bids.task_details.description')}:
					</span>
					<div class="bg-base-200 mt-1 rounded-md p-3">
						<div class="max-h-[5rem] overflow-y-auto">
							<p class="whitespace-pre-line">{task.description}</p>
						</div>
					</div>
				</div>

				{#if task.skills?.length > 0}
					<div class="mb-4">
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.required_skills')}:
						</span>
						<div class="mt-1 flex flex-wrap gap-1">
							{#each task.skills as skill}
								<span class="badge badge-primary badge-outline">{skill}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if task.categories?.length > 0}
					<div class="mb-4">
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.categories')}:
						</span>
						<div class="mt-1 flex flex-wrap gap-1">
							{#each task.categories as category}
								<span class="badge badge-primary badge-outline">{category}</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Location Information -->
				{#if task.pickupLocation || task.dropOffLocation}
					<div class="mb-4">
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.location_details')}:
						</span>
						<div class="mt-2 space-y-2">
							{#if task.pickupLocation}
								<div class="flex items-start gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mt-0.5 h-4 w-4 text-green-600"
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
									<div>
										<div class="text-sm font-medium">
											{$t('bids.task_details.pickup_location')}
										</div>
										<div class="text-base-content/70 text-sm">
											{task.pickupLocation.displayName}
											{#if task.pickupLocation.zipCode}
												<br /><span class="text-base-content/60 text-xs"
													>{$t('bids.task_details.zip_code')}: {task.pickupLocation
														.zipCode}</span
													>
											{/if}
										</div>
									</div>
								</div>
							{/if}

							{#if task.dropOffLocation}
								<div class="flex items-start gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mt-0.5 h-4 w-4 text-red-600"
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
									<div>
										<div class="text-sm font-medium">
											{$t('bids.task_details.drop_off_location')}
										</div>
										<div class="text-base-content/70 text-sm">
											{task.dropOffLocation.displayName}
											{#if task.dropOffLocation.zipCode}
												<br /><span class="text-base-content/60 text-xs"
													>{$t('bids.task_details.zip_code')}: {task.dropOffLocation
														.zipCode}</span
													>
											{/if}
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Creator Information -->
				{#if task.creator}
					<div class="mb-4">
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.posted_by')}:
						</span>
						<div class="mt-2 flex items-center gap-3">
							{#if task.creator.avatar}
								<img
									src={task.creator.avatar}
									alt={task.creator.username}
									class="h-10 w-10 rounded-full object-cover"
								/>
							{:else}
								<div class="bg-primary/20 flex h-10 w-10 items-center justify-center rounded-full">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-primary h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
										/>
									</svg>
								</div>
							{/if}
							<div>
								<div class="text-sm font-medium">
									{task.creator.username}
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Attachments -->
				{#if task.attachments && task.attachments.length > 0}
					<div class="mb-4">
						<span class="text-base-content/60 text-sm">
							{$t('bids.task_details.attachments')}:
						</span>
						<div class="mt-2 grid grid-cols-2 gap-2">
							{#each task.attachments as attachment}
								<div class="h-full max-h-64 min-h-32 w-full max-w-full rounded-lg">
									{#if attachment.type.startsWith('image/')}
										<!-- Image Display -->
										<img
											src={attachment.url}
											alt={attachment.alt || 'Task attachment'}
											class="h-full w-full object-contain"
											loading="lazy"
										/>
									{:else if attachment.type.startsWith('video/')}
										<!-- Video Display -->
										<video controls class="h-full w-full" preload="metadata">
											<track kind="captions" />
											<source src={attachment.url} type={attachment.type} />
											Your browser does not support the video tag.
										</video>
									{:else}
										<!-- Other File Types -->
										<div class="flex items-center gap-3">
											<div class="bg-primary/20 flex h-12 w-12 items-center justify-center rounded">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="text-primary h-6 w-6"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
													/>
												</svg>
											</div>
											<a
												aria-label={$t('bids.task_details.open_attachment')}
												href={attachment.url}
												target="_blank"
												rel="noopener noreferrer"
												class="btn btn-ghost btn-sm"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
													/>
												</svg>
											</a>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<div class="divider"></div>

			<!-- Bid form -->
			{#if showBidForm && task}
				{#if task.id && task.status === TaskStatusEnum.OPEN}
					<BidCreationForm taskId={task.id} onClose={() => handleClose()} />
				{:else if !task.id}
					<div class="alert alert-error">
						<span>{$t('bids.task_details.task_id_missing')}</span>
					</div>
				{:else if task.status !== TaskStatusEnum.OPEN}
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
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L73.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span>{$t('bids.task_details.task_not_open_for_bidding')}</span>
					</div>
				{/if}
			{:else}
				<p class="text-base-content/60 mt-4">{$t('bids.task_details.loading_bid_form')}</p>
			{/if}
		</div>
		<!-- Task not found state -->
	{:else}
		<div class="p-8 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-lg font-semibold">{$t('bids.task_details.task_not_found')}</h3>
			<p class="text-base-content/60 mt-1">
				{$t('bids.task_details.error.failed_to_load')}
			</p>
		</div>
	{/if}
</div>
