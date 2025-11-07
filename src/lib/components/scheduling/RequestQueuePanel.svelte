<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { requestQueueStore, type RequestQueueItem } from '$lib/stores/request-queue.store';
	import { filterRequests, sortRequests, type RequestFilterOptions, type RequestSortOption } from '$lib/utils/request-filtering';
	import { sendRequestAcceptance } from '$lib/utils/nostr-scheduling';
	import { handleRequestExpiry } from '$lib/utils/nostr-scheduling';
	import { detectConflicts, isRequestInConflict } from '$lib/utils/conflict-detection';
	import { generateSuggestions, getBestOfferSuggestion } from '$lib/services/suggestion-engine';
	import { calculateRequestScore, getRecommendationBadge } from '$lib/utils/request-scoring';
	import RequestCard from './RequestCard.svelte';
	import BatchActionsBar from './BatchActionsBar.svelte';
	import { createPullToRefreshHandler, isMobileDevice } from '$lib/utils/mobile-gestures';
	import { t } from 'svelte-i18n';
	import { calculateAvailableSlots } from '$lib/utils/availability-calculator';
	import type { Availability } from '$lib/types/profile';

	const props = $props<{
		profileAvailability?: Availability;
		onRequestAccepted?: (requestId: string) => void;
		onRequestRejected?: (requestId: string) => void;
	}>();

	let requests = $state<RequestQueueItem[]>([]);
	let selectedRequests = $state<Set<string>>(new Set());
	let filterStatus = $state<RequestFilterOptions>({});
	let sortOption = $state<RequestSortOption>('expires-asc');
	let searchQuery = $state('');
	let showFilters = $state(false);
	let expiryCheckInterval: number | null = null;
	let containerElement: HTMLDivElement | null = $state(null);
	let pullToRefreshCleanup: (() => void) | null = null;
	let isMobile = $state(false);
	let isRefreshing = $state(false);

	// Subscribe to request queue store
	$effect(() => {
		const unsubscribe = requestQueueStore.subscribe((queue) => {
			requests = queue;
		});
		return unsubscribe;
	});

	// Filter and sort requests
	let filteredAndSortedRequests = $derived(() => {
		let filtered = filterRequests(requests, filterStatus);

		// Apply search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(req) =>
					req.taskId.toLowerCase().includes(query) ||
					req.bidId.toLowerCase().includes(query) ||
					req.taskerPubkey.toLowerCase().includes(query)
			);
		}

		return sortRequests(filtered, sortOption);
	});

	// Detect conflicts using conflict detection utility
	let conflicts = $derived(() => {
		const allRequests = requestQueueStore.getAllRequests();
		const result = detectConflicts(allRequests);
		
		// Convert to the format expected by the component
		return result.conflicts.map((conflict) => ({
			timeSlot: conflict.timeSlot,
			requests: conflict.requests
		}));
	});

	// Generate suggestions
	let suggestions = $derived(() => {
		const allRequests = requestQueueStore.getAllRequests();
		return generateSuggestions(allRequests, {
			maxSuggestions: 5,
			includeConflictSuggestions: true
		});
	});

	// Best offer suggestion
	let bestOfferSuggestion = $derived(() => {
		const allRequests = requestQueueStore.getAllRequests();
		return getBestOfferSuggestion(allRequests);
	});

	onMount(() => {
		isMobile = isMobileDevice();

		// Check for expired requests every minute
		expiryCheckInterval = window.setInterval(() => {
			handleRequestExpiry();
		}, 60000);

		// Initial expiry check
		handleRequestExpiry();

		// Add pull-to-refresh for mobile
		if (isMobile && containerElement) {
			pullToRefreshCleanup = createPullToRefreshHandler(containerElement, {
				threshold: 80,
				onRefresh: async () => {
					isRefreshing = true;
					// Refresh requests
					handleRequestExpiry();
					// Simulate refresh delay
					await new Promise((resolve) => setTimeout(resolve, 500));
					isRefreshing = false;
				}
			});
		}
	});

	onDestroy(() => {
		if (expiryCheckInterval !== null) {
			clearInterval(expiryCheckInterval);
		}
		if (pullToRefreshCleanup) {
			pullToRefreshCleanup();
		}
	});

	function toggleSelection(requestId: string) {
		if (selectedRequests.has(requestId)) {
			selectedRequests.delete(requestId);
		} else {
			selectedRequests.add(requestId);
		}
		selectedRequests = new Set(selectedRequests); // Trigger reactivity
	}

	function clearSelection() {
		selectedRequests = new Set();
	}

	function isConflict(request: RequestQueueItem): boolean {
		const allRequests = requestQueueStore.getAllRequests();
		return isRequestInConflict(request, allRequests);
	}

	async function handleAccept(requestId: string) {
		const request = requests.find((r) => r.id === requestId);
		if (!request || request.status !== 'pending') return;

		try {
			// For time slot requests, accept with the requested time
			if (request.type === 'time-slot-request') {
				const timeSlotRequest = request.request as import('$lib/types/scheduling').TimeSlotRequest;
				await sendRequestAcceptance({
					requestId: request.id,
					bidId: request.bidId,
					taskId: request.taskId,
					taskerPubkey: request.taskerPubkey,
					taskeePubkey: request.taskeePubkey,
					acceptedStartTime: timeSlotRequest.requestedStartTime,
					acceptedEndTime: timeSlotRequest.requestedEndTime
				});

				// Update status
				requestQueueStore.updateRequestStatus(request.id, 'accepted', {
					acceptedTime: {
						startTime: timeSlotRequest.requestedStartTime,
						endTime: timeSlotRequest.requestedEndTime
					}
				});
			} else {
				// For soonest available requests, we need to calculate available slots first
				// This will be handled by SoonestAvailableHandler component
				if (props.onRequestAccepted) {
					props.onRequestAccepted(requestId);
				}
			}

			selectedRequests.delete(requestId);
			selectedRequests = new Set(selectedRequests);
		} catch (error) {
			console.error('Failed to accept request:', error);
		}
	}

	async function handleReject(requestId: string) {
		// TODO: Implement rejection logic
		if (props.onRequestRejected) {
			props.onRequestRejected(requestId);
		}
	}

	async function handleAcceptAll() {
		const selected = Array.from(selectedRequests);
		for (const requestId of selected) {
			await handleAccept(requestId);
		}
		clearSelection();
	}

	async function handleRejectAll() {
		const selected = Array.from(selectedRequests);
		for (const requestId of selected) {
			await handleReject(requestId);
		}
		clearSelection();
	}
</script>

<div bind:this={containerElement} class="container mx-auto px-4 py-6 pb-safe">
	<!-- Pull-to-refresh indicator -->
	{#if isMobile && isRefreshing}
		<div class="flex justify-center items-center py-2">
			<span class="loading loading-spinner loading-sm"></span>
			<span class="ml-2 text-sm">{$t('scheduling.refreshing')}</span>
		</div>
	{/if}
	<!-- Header -->
	<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
		<div>
			<h1 class="text-2xl font-bold">{$t('scheduling.request_queue.title')}</h1>
			<p class="text-sm text-base-content/70">
				{$t('scheduling.request_queue.subtitle', { count: filteredAndSortedRequests.length })}
			</p>
		</div>

		<!-- Actions -->
		<div class="flex gap-2">
			<button class="btn btn-sm btn-ghost" onclick={() => (showFilters = !showFilters)}>
				{$t('common.buttons.filter')}
			</button>
			{#if selectedRequests.size > 0}
				<button class="btn btn-sm btn-ghost" onclick={clearSelection}>
					{$t('common.buttons.clear_selection')}
				</button>
			{/if}
		</div>
	</div>

	<!-- Filters -->
	{#if showFilters}
		<div class="card bg-base-200 p-4 mb-4">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<!-- Status filter -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$t('scheduling.filters.status')}</span>
					</label>
					<select
						class="select select-bordered select-sm"
						bind:value={filterStatus.status}
						onchange={(e) => {
							const value = e.target.value;
							filterStatus = {
								...filterStatus,
								status: value ? [value as any] : undefined
							};
						}}
					>
						<option value="">{$t('common.all')}</option>
						<option value="pending">{$t('scheduling.status.pending')}</option>
						<option value="accepted">{$t('scheduling.status.accepted')}</option>
						<option value="confirmed">{$t('scheduling.status.confirmed')}</option>
						<option value="expired">{$t('scheduling.status.expired')}</option>
						<option value="cancelled">{$t('scheduling.status.cancelled')}</option>
					</select>
				</div>

				<!-- Sort option -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$t('scheduling.filters.sort')}</span>
					</label>
					<select class="select select-bordered select-sm" bind:value={sortOption}>
						<option value="expires-asc">{$t('scheduling.sort.expires_soonest')}</option>
						<option value="expires-desc">{$t('scheduling.sort.expires_latest')}</option>
						<option value="created-desc">{$t('scheduling.sort.newest')}</option>
						<option value="created-asc">{$t('scheduling.sort.oldest')}</option>
						<option value="status">{$t('scheduling.sort.by_status')}</option>
					</select>
				</div>

				<!-- Search -->
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$t('common.search')}</span>
					</label>
					<input
						type="text"
						class="input input-bordered input-sm"
						placeholder={$t('scheduling.search_placeholder')}
						bind:value={searchQuery}
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Best Offer Suggestion -->
	{#if bestOfferSuggestion}
		<div class="alert alert-success alert-outline mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current shrink-0 h-6 w-6"
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
			<div class="flex-1">
				<h3 class="font-bold">⭐ {$t('scheduling.best_offer')}</h3>
				<div class="text-sm">{bestOfferSuggestion.message}</div>
			</div>
			<button
				class="btn btn-sm btn-success"
				onclick={() => handleAccept(bestOfferSuggestion!.request.id)}
			>
				{$t('scheduling.accept_best')}
			</button>
		</div>
	{/if}

	<!-- Other Suggestions -->
	{#if suggestions.length > 1}
		<div class="alert alert-info alert-outline mb-4">
			<div class="flex-1">
				<h3 class="font-bold">{$t('scheduling.suggestions')}</h3>
				<div class="text-sm space-y-1">
					{#each suggestions.slice(1, 4) as suggestion (suggestion.request.id)}
						<div class="flex items-center gap-2">
							<span class="badge badge-{suggestion.type === 'urgent' ? 'warning' : 'info'} badge-sm">
								{suggestion.type === 'urgent' ? '⏰' : suggestion.type === 'high-value' ? '💰' : '✓'}
							</span>
							<span>{suggestion.message}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Conflicts warning -->
	{#if conflicts.length > 0}
		<div class="alert alert-warning alert-outline mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current shrink-0 h-6 w-6"
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
			<span>
				{$t('scheduling.conflicts_detected', { count: conflicts.length })}
			</span>
		</div>
	{/if}

	<!-- Request list -->
	{#if filteredAndSortedRequests.length === 0}
		<div class="card bg-base-200 p-8 text-center">
			<p class="text-base-content/70">{$t('scheduling.no_requests')}</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 {isMobile ? '' : 'md:grid-cols-2 lg:grid-cols-3'} gap-4">
			{#each filteredAndSortedRequests as request (request.id)}
				{@const requestScore = calculateRequestScore(request)}
				{@const isBestOffer = bestOfferSuggestion?.request.id === request.id}
				<RequestCard
					{request}
					isSelected={selectedRequests.has(request.id)}
					onSelect={toggleSelection}
					onAccept={handleAccept}
					onReject={handleReject}
					showConflictIndicator={isConflict(request)}
					{requestScore}
					{isBestOffer}
				/>
			{/each}
		</div>
	{/if}

	<!-- Batch actions bar -->
	<BatchActionsBar
		selectedCount={selectedRequests.size}
		onAcceptAll={handleAcceptAll}
		onRejectAll={handleRejectAll}
		onClearSelection={clearSelection}
	/>
</div>

