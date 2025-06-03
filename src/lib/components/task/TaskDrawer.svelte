<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { Bid, CounterOffer, TaskBid } from '$lib/types/bid';
	import { formatDistanceToNow, format } from 'date-fns';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import taskService from '$lib/api/services/task.service';
	import bidService from '$lib/api/services/bid.service';
	import Tabs from '$lib/components/Tabs.svelte';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import CounterOfferHistory from '$lib/components/bidding/CounterOfferHistory.svelte';
	import EditTaskForm from './EditTaskForm.svelte';
	import { t } from '$lib/stores/i18n.store';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		taskId: number | null;
		isOpen: boolean;
		activeTab: string;
		onClose: () => void;
	}>();

	// State
	let task = $state<Task | null>(null);
	let bids = $state<TaskBid[]>([]);
	let loading = $state(false);
	let loadingBids = $state(false);
	let errorMessage = $state('');
	let currentTab = $state('details'); // 'details' or 'bids'
	let isEditing = $state(false);
	let selectedImage = $state<string | null>(null);
	// Bid withdrawal state
	let withdrawalReason = $state('');
	let bidToWithdraw = $state<string | null>(null); // Now storing just the bid ID
	let withdrawingBid = $state(false);
	let withdrawalError = $state('');
	let selectedBid = $state<TaskBid | null>(null);
	let expandedBidId = $state<string | null>(null);
	let showCounterOfferForm = $state(false);
	let currentUserId = $state<string>('current-user-id'); // Should come from auth store

	// Define tabs
	const tabs = [
		{ id: 'details', label: $t('task.drawer.details') },
		{ id: 'bids', label: $t('task.drawer.bids') }
	];
	let isUserDetailsModalOpen = $state(false);

// User details handling
const openUserDetailsModal = (bidData?: TaskBid) => {
	// If bid data is provided, update userDetails with bid data
	if (bidData && bidData.userProfile) {
		// Destructure data from the bid
		const { userProfile } = bidData;
		
		// Update individual properties instead of reassigning the whole object
		userDetails.name = userProfile.user.displayName || 'Anonymous';
		userDetails.tasksCompleted = userProfile.tasksPosted || 0;
		userDetails.bio = userProfile.bio || 'No bio available';
		userDetails.amount = bidData.amount;
		userDetails.currency = bidData.currency || 'BTC';
		userDetails.userId = userProfile.userId || 0;
		userDetails.profileId = userProfile.id || 0;
	}
	
	isUserDetailsModalOpen = true;
};

const closeUserDetailsModal = () => {
	isUserDetailsModalOpen = false;
};

// User details state - using let instead of const to allow updates
let userDetails = $state({
	name: 'Anonymous',
	rating: 4.7,
	tasksCompleted: 48,
	memberSince: '2024-01-15',
	skills: ['Delivery', 'Home Repair', 'Cleaning'],
	bio: 'Experienced tasker with expertise in various home and delivery services. Always committed to providing excellent service and meeting deadlines.',
	responseRate: '95%',
	responseTime: '< 1 hour',
	amount: 0,
	currency: 'BTC',
	userId: 0,
	profileId: 0
});

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle drawer state changes
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();

			// Set active tab from props if provided
			if (props.activeTab) {
				currentTab = props.activeTab;
			}

			// Load task details if taskId is available
			if (props.taskId) {
				loadTaskDetails(props.taskId);
			}
		} else {
			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	async function loadTaskDetails(taskId: string) {
		try {
			loading = true;
			errorMessage = '';

			const res = await taskService.getTaskById(taskId);
			task = res;
			console.log("🚀 ~ loadTaskDetails ~ task:", task)
			bids = task.bids;
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('task.drawer.error.load');
		} finally {
			loading = false;
		}
	}

	loadTaskDetails(props.taskId);

	function handleTabChange(tabId: string) {
		currentTab = tabId;
	}

	const handleClose = () => props.onClose();

	// Format helpers
	const formatTimeAgo = (date: string): string =>
		formatDistanceToNow(new Date(date), { addSuffix: true });

	const formatDateString = (date: string): string => format(new Date(date), 'MMM d, yyyy');

	// Bid actions
	async function handleAcceptBid(bid: TaskBid) {
		try {
			await bidService.acceptBid(bid.id);
			// Refresh task to update status and bids
			await loadTaskDetails(props.taskId!);
		} catch (error) {
			console.error('Error accepting bid:', error);
		}
	}

	async function handleRejectBid(bid: TaskBid) {
		try {
			await bidService.rejectBid(bid.id);
			// Refresh task to update status and bids
			await loadTaskDetails(props.taskId!);
		} catch (error) {
			console.error('Error rejecting bid:', error);
		}
	}

	function toggleBidWithdrawal(bidId: string) {
		// If we're already withdrawing this bid, cancel withdrawal mode
		if (bidToWithdraw === bidId) {
			bidToWithdraw = null;
			withdrawalReason = '';
			withdrawalError = '';
			return;
		}

		// Otherwise, enter withdrawal mode for this bid
		withdrawalReason = '';
		withdrawalError = '';
		bidToWithdraw = bidId;

		// Make sure the bid details are expanded
		if (expandedBidId !== bidId) {
			// expandedBidId = bidId;
		}
	}

	async function handleWithdrawBid(bidId: string) {
		// Validate reason is provided
		if (!withdrawalReason.trim()) {
			withdrawalError = $t('task.drawer.error.withdraw_reason');
			return;
		}

		try {
			withdrawingBid = true;
			withdrawalError = '';
			await bidService.withdrawBid(bidId, withdrawalReason.trim());

			// Reset state
			withdrawalReason = '';
			bidToWithdraw = null;

			// Refresh task to update status and bids
			await loadTaskDetails(props.taskId!);
		} catch (error) {
			console.error('Error withdrawing bid:', error);
			withdrawalError = $t('task.drawer.error.withdraw_failed');
		} finally {
			withdrawingBid = false;
		}
	}

	function handleCounterOffer(bid: TaskBid) {
		selectedBid = bid;
		showCounterOfferForm = true;
	}

	function toggleBidDetails(bidId: string) {
		expandedBidId = expandedBidId === bidId ? null : bidId;
	}

	// Counter offer functions
	async function submitCounterOffer(
		bidId: string,
		counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
	) {
		try {
			// API call to create counter offer
			await bidService.createCounterOffer(bidId, counterOffer);
			// Reset state
			showCounterOfferForm = false;
			selectedBid = null;
			// Reload task to update bids with counter offer
			if (props.taskId) {
				await loadTaskDetails(props.taskId);
			}
		} catch (error) {
			console.error($t('task.drawer.error.counter_offer'), error);
		}
	}

	async function handleRespondToCounterOffer(counterId: string, action: 'accept' | 'reject') {
		try {
			// API call to respond to counter offer
			await bidService.respondToCounterOffer(counterId, action);
			// Reload task to update counter offer status
			if (props.taskId) {
				await loadTaskDetails(props.taskId);
			}
		} catch (error) {
			console.error(`Error ${action}ing counter offer:`, error);
		}
	}
</script>

<!-- Drawer Overlay -->
<div
	class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!props.isOpen}
	class:invisible={!props.isOpen}
	onclick={handleClose}
	onkeydown={(e) => e.key === 'Escape' && handleClose()}
	role="dialog"
	tabindex="-1"
></div>

<!-- Drawer -->
<div
	class="bg-base-100 fixed inset-y-0 right-0 z-50 w-full overflow-y-auto shadow-xl transition-transform duration-300 ease-in-out sm:w-[70%]"
	class:translate-x-0={props.isOpen}
	class:translate-x-full={!props.isOpen}
	class:overflow-hidden={showCounterOfferForm}
>
	<!-- Header -->
	<div class="bg-base-200 sticky top-0 z-10 border-b p-4">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-bold">
				{loading ? 'Loading...' : task ? task.title : 'Task Details'}
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
	</div>

	<!-- Loading state -->
	{#if loading}
		<div class="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
			<span class="loading loading-spinner loading-lg"></span>
		</div>

		<!-- Error state -->
	{:else if errorMessage}
		<div class="p-4">
			<div class="alert alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
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
					Try Again
				</button>
			</div>
		</div>

		<!-- Task found state -->
	{:else if task}
		<!-- Tabs -->
		<div class="px-4 pt-4">
			<Tabs {tabs} activeTab={currentTab} onTabChange={handleTabChange} />
		</div>

		<!-- Tab content -->
		<div class="p-4">
			<!-- Task Details Tab -->
			{#if currentTab === 'details'}
				<div class="space-y-6">
					<!-- Task header with status and edit button -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div
								class="badge badge-lg {task.status === TaskStatusEnum.OPEN
									? 'badge-success'
									: task.status === TaskStatusEnum.COMPLETED
										? 'badge-primary'
										: 'badge-neutral'}"
							>
								{task.status}
							</div>
							{#if task.isOwner}
								<span class="badge badge-info">You are the owner</span>
							{:else}
								<span class="badge badge-info">You are the provider</span>
							{/if}
						</div>

						{#if task.isOwner && task.status === TaskStatusEnum.OPEN}
							<button class="btn btn-outline btn-sm" onclick={() => (isEditing = !isEditing)}>
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
								{isEditing ? 'Cancel' : 'Edit'}
							</button>
						{/if}
					</div>

					{#if !isEditing}
						<!-- Task details -->
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<h3 class="text-base-content/60 text-sm">Budget</h3>
								<p class="text-lg font-semibold">
									{formatCurrency(task.budget, task.currency || 'USD')}
									{#if task.budgetType === 'HOURLY'}
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

							{#if task.deadlineDate}
								<div>
									<h3 class="text-base-content/60 text-sm">Deadline</h3>
									<p class="font-semibold">{formatTimeAgo(task.deadlineDate)}</p>
									<p class="text-xs">{formatDateString(task.deadlineDate)}</p>
								</div>
							{:else if task.dateRange}
								<div>
									<h3 class="text-base-content/60 text-sm">Date Range</h3>
									<p class="font-semibold">
										{formatDateString(task.dateRange.start)} - {formatDateString(
											task.dateRange.end
										)}
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
							<div class="bg-base-200 rounded-box p-4 whitespace-pre-wrap">
								{task.description}
							</div>
						</div>

						<!-- Task skills -->
						{#if task.requiredSkills?.length > 0}
							<div>
								<h3 class="text-base-content/60 mb-1 text-sm">Required Skills</h3>
								<div class="flex flex-wrap gap-1">
									{#each task.requiredSkills as skillItem}
										<span class="badge badge-primary badge-outline">{skillItem.skill.name}</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Task categories -->
						{#if task.categories?.length > 0}
							<div>
								<h3 class="text-base-content/60 mb-1 text-sm">Categories</h3>
								<div class="flex flex-wrap gap-1">
									{#each task.categories as category}
										<span class="badge badge-secondary badge-outline">
											{category.category.name}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Task location -->
						{#if task.pickupLocation && task.taskType === TaskTypeEnum.IN_PERSON}
							<div>
								<h3 class="text-base-content/60 mb-1 text-sm">Location</h3>
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

						<!-- Task attachments -->
						{#if task.attachments && task.attachments.length > 0}
							<div>
								<h3 class="text-base-content/60 mb-1 text-sm">Attachments</h3>
								<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
									{#each task.attachments as image, i}
										<button
											class="group rounded-box relative overflow-hidden"
											onclick={() => (selectedImage = image.fileUrl)}
											aria-label="View attachment {i + 1}"
										>
											<img
												src={image.fileUrl}
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

						<!-- Action button for non-owners -->
						{#if !task.isOwner && task.status === TaskStatusEnum.OPEN}
							<div class="divider"></div>
							<div class="flex justify-center">
								<!-- <BidCreationForm taskId={task.id} onClose={() => {}} /> -->
							</div>
						{/if}
					{:else}
						<div class="mt-4">
							<EditTaskForm
								{task}
								onCancel={() => (isEditing = false)}
								onSuccess={() => (isEditing = false)}
							/>
						</div>
					{/if}
				</div>
				{#if selectedImage}
					<div
						class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
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
				<!-- Bids Tab -->
			{:else if currentTab === 'bids'}
				<div class="space-y-6">
					<!-- Loading state for bids -->
					{#if loadingBids}
						<div class="flex justify-center py-8">
							<span class="loading loading-spinner loading-lg"></span>
						</div>

						<!-- No bids state -->
					{:else if bids.length === 0}
						<div class="py-8 text-center">
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
							<h3 class="mt-4 text-lg font-semibold">No bids yet</h3>
							<p class="text-base-content/60 mt-1">
								{task.isOwner
									? 'Your task has not received any bids yet.'
									: 'You have not bid on this task yet.'}
							</p>
						</div>

						<!-- Bids list -->
					{:else}
						<div class="space-y-4">
				
							{#each bids as bid}
								<!-- Bid card -->
								<div class="card bg-base-200 shadow-sm transition-shadow hover:shadow-md">
									<div class="card-body p-4">
										<!-- Bid header with status and amount -->
										<div class="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
											<div>
												<div  class="flex items-center gap-4 justify-between">
													<h3 class="text-lg font-semibold">
														{bid?.userProfile?.user?.displayName || 'Anonymous'}
													</h3>
													<button class="text-sm border-gray border-b-1 text-primary" onclick={() => openUserDetailsModal(bid)}>
														View user details
													</button>

												</div>
												
								
												<p class="text-base-content/60 text-xs">
													Submitted {formatTimeAgo(bid.createdAt)}
												</p>
											</div>
											<div class="flex flex-col sm:items-end">
												<div
													class="badge badge-lg mb-1 {bid.status === 'ACCEPTED'
														? 'badge-success'
														: bid.status === 'REJECTED'
															? 'badge-error'
															: bid.status === 'WITHDRAWN'
																? 'badge-warning'
																: bid.status === 'COUNTERED'
																	? 'badge-info'
																	: 'badge-primary'}"
												>
													{bid.status}
												</div>
												<p class="text-primary font-bold">
													{formatCurrency(bid.amount, bid.currency || 'USD')}
												</p>
											</div>
										</div>

										<!-- Bid summary (always visible) -->
										<div class="mt-2">
											<p class="line-clamp-2">{bid.description}</p>
										</div>

										<!-- Withdrawal reason -->
										{#if bidToWithdraw === bid.id}
											<div class="animate-fadeIn mt-4 space-y-4">
												<div class="border-base-300 border-t pt-4">
													<h4 class="text-base-content/80 mb-3 text-sm font-medium">
														Withdraw Your Bid
													</h4>
													<p class="mb-2 text-sm">
														Please provide a reason for withdrawing your bid:
													</p>

													<div class="form-control w-full">
														<textarea
															id="withdrawal-reason-{bid.id}"
															name="withdrawal-reason"
															class="textarea textarea-bordered h-20 w-full {withdrawalError
																? 'textarea-error'
																: ''}"
															placeholder="Please explain why you're withdrawing your bid..."
															bind:value={withdrawalReason}
														></textarea>

														{#if withdrawalError}
															<label class="label" for="withdrawal-reason-{bid.id}">
																<span class="label-text-alt text-error">{withdrawalError}</span>
															</label>
														{/if}
													</div>
												</div>
											</div>
										{/if}

										<!-- Expanded bid details -->
										{#if expandedBidId === bid.id}
											<div class="animate-fadeIn mt-4 space-y-4">
												<!-- Payment details -->
												<div>
													<h4 class="text-base-content/60 mb-1 text-sm font-medium">
														Payment Details
													</h4>
													<div class="bg-base-300 rounded-box p-3">
														<div class="grid grid-cols-2 gap-2">
															<div>
																<span class="text-base-content/60 text-xs">Payment Type:</span>
																<p>{bid.paymentType}</p>
															</div>
															{#if bid.paymentType === 'HOURLY'}
																<div>
																	<span class="text-base-content/60 text-xs">Hourly Rate:</span>
																	<p>
																		{formatCurrency(bid.hourlyRate || 0, bid.currency || 'USD')}/hr
																	</p>
																</div>
																<div>
																	<span class="text-base-content/60 text-xs">Estimated Hours:</span>
																	<p>{bid.estimatedHours || 0} hours</p>
																</div>
															{/if}
															<div>
																<span class="text-base-content/60 text-xs">Total Amount:</span>
																<p class="font-semibold">
																	{formatCurrency(bid.amount, bid.currency || 'USD')}
																</p>
															</div>
														</div>
													</div>
												</div>

												<!-- Full description -->
												<div>
													<h4 class="text-base-content/60 mb-1 text-sm font-medium">Proposal</h4>
													<div class="bg-base-300 rounded-box p-3 whitespace-pre-wrap">
														{bid.description}
													</div>
												</div>

												<!-- Approach -->
												{#if bid.proposedApproach}
													<div>
														<h4 class="text-base-content/60 mb-1 text-sm font-medium">
															Proposed Approach
														</h4>
														<div class="bg-base-300 rounded-box p-3 whitespace-pre-wrap">
															{bid.proposedApproach}
														</div>
													</div>
												{/if}

												<!-- Timeline -->
												{#if bid.estimatedDuration}
													<div>
														<h4 class="text-base-content/60 mb-1 text-sm font-medium">
															Estimated Timeline
														</h4>
														<div class="bg-base-300 rounded-box p-3">
															{bid.estimatedDuration}
														</div>
													</div>
												{/if}

												<!-- Provider highlights -->
												<!-- {#if bid.providerHighlights}
													<div>
														<h4 class="text-base-content/60 mb-1 text-sm font-medium">
															Provider Highlights
														</h4>
														<div class="bg-base-300 rounded-box p-3">
															{#if bid.providerHighlights.skills && bid.providerHighlights.skills.length > 0}
																<div class="mb-2">
																	<span class="text-base-content/60 text-xs">Skills:</span>
																	<div class="mt-1 flex flex-wrap gap-1">
																		{#each bid.providerHighlights.skills as skill}
																			<span class="badge badge-outline">{skill}</span>
																		{/each}
																	</div>
																</div>
															{/if}
															{#if bid.providerHighlights.certifications && bid.providerHighlights.certifications.length > 0}
																<div>
																	<span class="text-base-content/60 text-xs">Certifications:</span>
																	<ul class="mt-1 list-inside list-disc">
																		{#each bid.providerHighlights.certifications as cert}
																			<li class="text-sm">{cert}</li>
																		{/each}
																	</ul>
																</div>
															{/if}
														</div>
													</div>
												{/if} -->

												<!-- Milestones -->
												{#if bid.milestones && bid.milestones.length > 0}
													<div>
														<h4 class="text-base-content/60 mb-1 text-sm font-medium">
															Milestones
														</h4>
														<div class="bg-base-300 rounded-box p-3">
															<ul class="list-inside list-disc">
																{#each bid.milestones as milestone}
																	<li class="text-sm">{milestone?.description}</li>
																{/each}
															</ul>
														</div>
													</div>
												{/if}
											</div>
										{/if}

										<!-- Counter Offer History (if any) -->
										{#if expandedBidId === bid.id && bid.counterOffers && bid.counterOffers.length > 0}
											<!-- <div class="mt-4 border-t pt-4">
												<CounterOfferHistory
													{bid}
													counterOffers={bid.counterOffers}
													{currentUserId}
													onRespondToOffer={handleRespondToCounterOffer}
												/>
											</div> -->
										{/if}

										<!-- Action buttons -->
										<div class="card-actions mt-4 justify-end">
											<button
												class="btn btn-ghost btn-outline btn-sm border"
												onclick={() => toggleBidDetails(bid.id)}
											>
												{expandedBidId === bid.id ? 'Hide details' : 'Show details'}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="ml-1 h-4 w-4 transition-transform duration-300 {expandedBidId ===
													bid.id
														? 'rotate-180'
														: ''}"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 9l-7 7-7-7"
													/>
												</svg>
											</button>
											{#if task.isOwner && bid.status && bid.status === 'PENDING'}
												<button class="btn btn-error btn-sm" onclick={() => handleRejectBid(bid)}>
													Decline
												</button>
												<button
													class="btn btn-outline btn-sm"
													onclick={() => handleCounterOffer(bid)}
												>
													Counter
												</button>
												<button class="btn btn-primary btn-sm" onclick={() => handleAcceptBid(bid)}>
													Accept
												</button>
											{:else if !task.isOwner && bid.status && bid.status === 'PENDING'}
												<button
													class="btn {bidToWithdraw === bid.id
														? 'btn-error'
														: 'btn-warning'} btn-sm"
													onclick={() => toggleBidWithdrawal(bid.id)}
												>
													{bidToWithdraw === bid.id ? 'Cancel Withdrawal' : 'Withdraw'}
												</button>
												{#if bidToWithdraw === bid.id}
													<button
														class="btn btn-warning btn-sm"
														onclick={() => handleWithdrawBid(bid.id)}
														disabled={withdrawingBid}
													>
														{#if withdrawingBid}
															<span class="loading loading-spinner loading-xs"></span>
														{/if}
														Confirm Withdrawal
													</button>
												{/if}
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#if showCounterOfferForm && selectedBid}
					<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
						<div class="w-full max-w-3xl p-4">
							<CounterOfferForm
								bid={selectedBid}
								onSubmit={submitCounterOffer}
								onCancel={() => {
									showCounterOfferForm = false;
									selectedBid = null;
								}}
							/>
						</div>
					</div>
				{/if}
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
			<h3 class="mt-4 text-lg font-semibold">Task Not Found</h3>
			<p class="text-base-content/60 mt-1">The task you're looking for could not be found.</p>
		</div>
	{/if}
</div>

<!-- User Details Modal -->
{#if isUserDetailsModalOpen}
<div class="modal modal-open modal-bottom sm:modal-middle">
	<div class="modal-box relative">
		<button class="btn btn-sm btn-circle absolute right-2 top-2" onclick={closeUserDetailsModal} aria-label="Close modal">
			✕
		</button>
		<h3 class="text-lg font-bold mb-4">User Profile</h3>
		
		<div class="flex flex-col gap-4">
			<!-- User Header -->
			<div class="flex items-center gap-3">
				<div class="avatar placeholder">
					<div class="bg-neutral text-neutral-content rounded-full w-16">
						<span class="text-xl">{userDetails.name.charAt(0)}</span>
					</div>
				</div>
				<div>
					<h4 class="text-xl font-semibold">{userDetails.name}</h4>
					<div class="flex items-center gap-1 text-sm">
						<div class="rating rating-sm">
							<input type="radio" name="rating-2" class="mask mask-star-2 bg-orange-400" disabled />
						</div>
						<span>{userDetails.rating} · {userDetails.tasksCompleted} tasks completed</span>
					</div>
					<div class="text-xs text-gray-500">Member since {new Date(userDetails.memberSince).toLocaleDateString()}</div>
				</div>
			</div>
			
			<!-- Bid Details (new section) -->
			{#if userDetails.amount > 0}
			<div class="bg-base-200 p-4 rounded-lg">
				<h5 class="font-medium mb-2">Bid Details</h5>
				<div class="flex justify-between">
					<span>Bid Amount:</span>
					<span class="font-bold text-primary">{formatCurrency(userDetails.amount, userDetails.currency)}</span>
				</div>
			</div>
			{/if}
			
			<!-- Stats -->
			<div class="stats stats-vertical lg:stats-horizontal shadow">
				<div class="stat">
					<div class="stat-title">Response Rate</div>
					<div class="stat-value text-primary">{userDetails.responseRate}</div>
				</div>
				<div class="stat">
					<div class="stat-title">Response Time</div>
					<div class="stat-value text-secondary">{userDetails.responseTime}</div>
				</div>
			</div>
			
			<!-- Skills -->
			<div>
				<h5 class="font-medium mb-2">Skills</h5>
				<div class="flex flex-wrap gap-2">
					{#each userDetails.skills as skill}
						<span class="badge badge-outline">{skill}</span>
					{/each}
				</div>
			</div>
			
			<!-- Bio -->
			<div>
				<h5 class="font-medium mb-2">About</h5>
				<p class="text-sm">{userDetails.bio}</p>
			</div>
			
			<!-- Contact Button -->
			<button class="btn btn-primary mt-2">Contact User</button>
		</div>
	</div>
	<div class="modal-backdrop" role="button" tabindex="-1" onclick={closeUserDetailsModal} onkeydown={(e) => e.key === 'Escape' && closeUserDetailsModal()}></div>
</div>
{/if}


<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.animate-fadeIn {
		animation: fadeIn 0.3s ease-in-out;
	}
</style>
