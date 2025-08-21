<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { Task } from '$lib/types/task';
	import { formatDistanceToNow, format } from 'date-fns';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import { calculateUsdtEstimate, formatSatsAmount } from '$lib/utils/helpers/crypto';
	import { user } from '$lib/stores/user.store';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';

	// Get taskId from route params
	const taskId = $page.params.taskId;

	// Tab management
	let availableTabs = $state([
		{ id: 'details', label: 'Details' },
		{ id: 'bids', label: 'Bids' }
	]);
	let activeTab = $state('details');

	// State
	let task = $state<Task | null>(null);
	let loading = $state(true);
	let errorMessage = $state('');
	let taskCreatorPubkey = $state<string>('');
	let btcPrice = $state<number>(120000); // Default fallback price

	// Bid drawer state
	let selectedTaskId = $state<string | null>(taskId || null);
	let isSidebarOpen = $state(false);

	// Check if current user is the task creator
	const isOwner = $derived(task?.npub === $user?.npub);

	// Format helpers
	const formatTimeAgo = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return formatDistanceToNow(dateObj, { addSuffix: true });
	};

	const formatDateString = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'MMM d, yyyy');
	};

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
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

			// Get the task creator's pubkey from the event
			taskCreatorPubkey = event.pubkey;

			task = {
				...taskData,
				id: event.id
			};
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('bids.task_details.error.failed_to_load_details');
		} finally {
			loading = false;
		}
	}

	const handleBidNow = () => {
		// Open the bid drawer
		isSidebarOpen = true;
	};

	// Handle tab change
	function handleTabChange(tabId: string) {
		activeTab = tabId;
	}

	onMount(() => {
		loadTaskDetails(taskId || '');
	});
</script>

<svelte:head>
	<title>{task ? task.title : 'Task Details'} - BitTasker</title>
	<meta name="description" content={task?.description || 'View complete task details'} />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 md:px-0">
	<div class="mb-2">
		<h3 class="">Task Details</h3>
		<p class="text-base-content/70">Here you can see the details of the task</p>
	</div>
	<!-- Loading state -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<span class="loading loading-spinner loading-lg"></span>
				<p class="mt-4 text-lg">Loading task details...</p>
			</div>
		</div>
	{:else if errorMessage}
		<!-- Error state -->
		<div class="py-12 text-center">
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
			<h3 class="mt-4 text-lg font-semibold">Task Not Found</h3>
			<p class="text-base-content/60 mt-1">{errorMessage}</p>
		</div>
	{:else if task}
		<!-- Task header -->

		<!-- Details Tab -->
		<div id="panel-details" role="tabpanel" aria-labelledby="tab-details" class="mt-3">
			<!-- Task details -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<!-- Main content -->
				<div class="space-y-4 lg:col-span-2">
					<!-- Main task info card -->
					<div class="bg-base-100 border-base-300 rounded-2xl border p-6 shadow-sm">
						<!-- Header row with title and posted date -->
						<div class="mb-6 flex flex-row items-start justify-between gap-3">
							<div class="">
								<h3 class="mb-2 line-clamp-1 max-w-2xl">{task.title}</h3>
								<p class="line-clamp-2 text-base leading-relaxed whitespace-pre-line">
									{task.description}
								</p>
							</div>
							<div class="text-right">
								<span class="text-base-content/60 text-sm">Posted</span>
								<p class="text-sm font-medium">
									{new Date(task.createdAt).toLocaleDateString()}
								</p>
								<p class="text-base-content/60 text-xs">
									{new Date(task.createdAt).toLocaleTimeString()}
								</p>
							</div>
						</div>

						<div class="divider"></div>

						<!-- Description section -->
						<div class="mb-6 flex justify-between">
							{#if task.deadline || task.dateRange}
								<div>
									{#if task.deadline}
										<div>
											<h4 class="mb-1 font-semibold">Deadline</h4>
											<div class="font-semibold">{formatTimeAgo(task.deadline)}</div>
											<div class="text-sm">{formatDateString(task.deadline)}</div>
										</div>
									{:else if task.dateRange}
										<div>
											<span class="text-base-content/60 text-sm">Date Range</span>
											<div class="font-semibold">
												{formatDateString(task.dateRange.start)} - {formatDateString(
													task.dateRange.end
												)}
											</div>
										</div>
									{/if}
								</div>
							{/if}

							<div class="mt-2 pt-4">
								<div class="text-lg font-semibold">
									{formatSatsAmount(task.budget.amount)}
									{#if task.budget.type === 'HOURLY'}
										<span class="text-base-content/60 ml-1 text-sm">/hr</span>
									{/if}
								</div>
								<div class="text-right">
									<span class="text-info text-sm">
										≈ {calculateUsdtEstimate(task.budget.amount, btcPrice)} USDT
									</span>
								</div>
							</div>
						</div>

						<!-- Timeline and Requirements in same row -->
						<div class="mb-2 flex justify-between">
							<!-- Location information -->
							{#if task.pickupLocation || task.dropOffLocation}
								<div class="mb-2">
									<h4 class="mb-1 font-semibold">Location Details</h4>
									<div class="grid grid-cols-1">
										{#if task.pickupLocation}
											<div>
												<span class="text-base-content/60 text-sm">Pickup Location</span>
												<div class="font-medium">{task.pickupLocation.displayName}</div>
											</div>
										{/if}
										{#if task.dropOffLocation}
											<div>
												<span class="text-base-content/60 text-sm">Drop-off Location</span>
												<div class="font-medium">{task.dropOffLocation.displayName}</div>
											</div>
										{/if}
									</div>
								</div>
							{/if}
							<!-- Requirements -->
							<div>
								<h4 class="mb-1 font-semibold">Requirements</h4>
								<div class="space-y-3">
									{#if task.skills?.length > 0}
										<div>
											<span class="text-base-content/60 text-sm">Required Skills</span>
											<div class="mt-1 flex flex-wrap gap-1">
												{#each task.skills as skill}
													<span class="badge badge-primary badge-outline badge-sm">{skill}</span>
												{/each}
											</div>
										</div>
									{/if}

									<!-- 	{#if task.categories?.length > 0}
											<div>
												<span class="text-base-content/60 text-sm">Categories</span>
												<div class="mt-1 flex flex-wrap gap-1">
													{#each task.categories as category}
														<span class="badge badge-secondary badge-outline badge-sm"
															>{category}</span
														>
													{/each}
												</div>
											</div>
										{/if} -->
								</div>
							</div>
						</div>

						<!-- Attachments -->
						{#if task.attachments && task.attachments.length > 0}
							<div class="mb-6">
								<h4 class="mb-1 font-semibold">Attachments</h4>
								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
									{#each task.attachments as attachment}
										<div class="bg-base-200 overflow-hidden rounded-lg">
											{#if isVideoFile(attachment.url)}
												<video class="h-48 w-full object-cover" controls preload="metadata">
													<source src={attachment.url} type="video/mp4" />
													<track kind="captions" src="" label="English" />
													Your browser does not support the video tag.
												</video>
											{:else}
												<button
													class="focus:ring-primary h-48 w-full cursor-pointer object-cover transition-opacity hover:opacity-90 focus:opacity-90 focus:ring-2 focus:outline-none"
													onclick={() => window.open(attachment.url, '_blank')}
													onkeydown={(e) =>
														e.key === 'Enter' && window.open(attachment.url, '_blank')}
													aria-label={`View ${attachment?.alt || 'attachment'} in new tab`}
												>
													<img
														src={attachment.url}
														alt={attachment?.alt || 'Task attachment'}
														class="h-48 w-full object-cover"
													/>
												</button>
											{/if}
											<div class="p-3">
												<p class="truncate text-sm font-medium">
													{attachment?.alt || 'Attachment'}
												</p>
												<p class="text-base-content/60 text-xs">
													{(attachment.size / 1024 / 1024).toFixed(2)} MB
												</p>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Sidebar -->
				<div class="lg:col-span-1">
					<div class="bg-base-100 border-base-300 sticky top-6 rounded-2xl border p-6 shadow-sm">
						<!-- Action buttons -->
						{#if task.status === TaskStatusEnum.OPEN && !isOwner}
							<div class="mb-6">
								<h4 class="mb-4">Interested in this task?</h4>
								<button class="btn btn-primary btn-sm w-full" onclick={handleBidNow}>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="mr-2 h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 4v16m8-8H4"
										/>
									</svg>
									Bid Now
								</button>
							</div>
						{:else if task.status !== TaskStatusEnum.OPEN}
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
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L73.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								<span>This task is not open for bidding</span>
							</div>
						{:else if isOwner}
							<div class="alert alert-info">
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
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span>You are the owner of this task</span>
							</div>
						{/if}

						<!-- Task creator info -->
						{#if task.creator}
							<div class="border-base-300 border-t pt-4">
								<h4 class="mb-2 font-semibold">Task Creator</h4>
								<div class="flex items-center gap-3">
									{#if task.creator.avatar}
										<img
											src={task.creator.avatar}
											alt={task.creator.username}
											class="h-10 w-10 rounded-full object-cover"
										/>
									{/if}
									<div>
										<p class="font-medium">{task.creator.username}</p>
										<p class="text-base-content/60 text-sm">
											Member since {formatDateString(task.createdAt)}
										</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Task Details Bid Drawer -->
<TaskDetailsBidDrawer
	taskId={selectedTaskId}
	onClose={() => (isSidebarOpen = false)}
	isOpen={isSidebarOpen}
/>
