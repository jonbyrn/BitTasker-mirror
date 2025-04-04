<script lang="ts">
	import type { Bid, CounterOffer } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import BidCard from '$lib/components/bidding/BidCard.svelte';
	import BidDetailsDrawer from '$lib/components/bidding/BidDetailsDrawer.svelte';
	import bidService from '$lib/api/services/bid.service';
	import { bidStore } from '$lib/stores/bid.store';

	// Props
	const props = $props<{
		taskId: string;
		isTaskOwner?: boolean;
		onCreateBid: () => void;
	}>();

	// State
	let bids = $state<Bid[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedBid = $state<Bid | null>(null);
	let isDrawerOpen = $state(false);
	let counterOffers = $state<CounterOffer[]>([]);

	// Lifecycle
	onMount(async () => {
		await loadBids();
		bids = $bidStore.bids.filter((bid) => bid.taskId === props.taskId);
	});

	// Methods
	async function loadBids() {
		isLoading = true;
		error = null;

		try {
			// Try to get bids from the API through the service
			const taskBids = await bidService.getBidsForTask(props.taskId);
			bids = taskBids;

			// Mark this task as loaded in the store to avoid duplicate fetches
			bidStore.markTaskLoaded(props.taskId);
		} catch (err) {
			console.error('Failed to load bids:', err);
			error = 'Failed to load bids for this task';
		} finally {
			isLoading = false;
		}
	}

	function handleViewDetails(bid: Bid) {
		selectedBid = bid;

		// Load counter offers for this bid
		if (bid.id) {
			counterOffers = bidStore.getCounterOffersForBid(bid.id);
		} else {
			counterOffers = [];
		}

		isDrawerOpen = true;
	}

	async function handleAcceptBid(bid: Bid) {
		if (!bid.id || !props.taskId) return;

		try {
			await bidService.acceptBid(bid.id, props.taskId);
			isDrawerOpen = false;
		} catch (err) {
			console.error('Failed to accept bid:', err);
			error = 'Failed to accept bid';
		}
	}

	async function handleRejectBid(bid: Bid) {
		if (!bid.id) return;

		try {
			await bidService.rejectBid(bid.id);
			isDrawerOpen = false;
		} catch (err) {
			console.error('Failed to reject bid:', err);
			error = 'Failed to reject bid';
		}
	}

	async function handleCounterOffer(bid: Bid) {
		// This would typically open a counter offer form
		// For this implementation, we'll just simulate with a prompt
		if (!bid.id) return;

		const amount = prompt('Enter counter offer amount:');
		if (!amount) return;

		const message = prompt('Enter message for counter offer:');
		if (!message) return;

		try {
			await bidService.createCounterOffer(bid.id, {
				price: {
					amount: parseFloat(amount),
					currency: bid.currency
				},
				message,
				proposedBy: 'current-user-id' // This would come from user store
			});

			// Refresh counter offers
			if (bid.id) {
				counterOffers = bidStore.getCounterOffersForBid(bid.id);
			}
		} catch (err) {
			console.error('Failed to create counter offer:', err);
			error = 'Failed to create counter offer';
		}
	}

	function closeDrawer() {
		isDrawerOpen = false;
	}
</script>

<div class="w-full">
	<!-- Header with Bid Count -->
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h2 class="text-xl font-bold">Bids</h2>
			{#if !isLoading}
				<p class="text-sm opacity-70">{bids.length} bid{bids.length !== 1 ? 's' : ''} submitted</p>
			{/if}
		</div>

		<!-- Create Bid Button (only shown if not task owner) -->
		{#if !props.isTaskOwner}
			<button
				class="btn btn-primary"
				onclick={props.onCreateBid}
				aria-label="Submit a bid for this task"
			>
				Submit a Bid
			</button>
		{/if}
	</div>

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex justify-center py-8">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
		<!-- Error State -->
	{:else if error}
		<div class="alert alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/></svg
			>
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadBids} aria-label="Retry loading bids">Retry</button>
		</div>
		<!-- Empty State -->
	{:else if bids.length === 0}
		<div class="bg-base-200 rounded-lg py-8 text-center">
			<div class="mb-3">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto h-12 w-12 opacity-50"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h3 class="text-lg font-medium">No bids yet</h3>
			<p class="mt-1 text-sm opacity-70">
				{#if props.isTaskOwner}
					No bids have been submitted for this task yet.
				{:else}
					Be the first to submit a bid for this task!
				{/if}
			</p>
			{#if !props.isTaskOwner}
				<button
					class="btn btn-primary mt-4"
					onclick={props.onCreateBid}
					aria-label="Submit a bid for this task"
				>
					Submit a Bid
				</button>
			{/if}
		</div>
		<!-- Bids List -->
	{:else}
		<div class="space-y-4">
			{#each bids as bid (bid.id)}
				<BidCard
					{bid}
					isTaskOwner={props.isTaskOwner}
					onViewDetails={handleViewDetails}
					onAcceptBid={handleAcceptBid}
					onRejectBid={handleRejectBid}
					onCounterOffer={handleCounterOffer}
				/>
			{/each}
		</div>
	{/if}

	<!-- Bid Details Drawer -->
	<BidDetailsDrawer
		bid={selectedBid}
		isOpen={isDrawerOpen}
		isTaskOwner={props.isTaskOwner}
		{counterOffers}
		onClose={closeDrawer}
		onAcceptBid={handleAcceptBid}
		onRejectBid={handleRejectBid}
		onCounterOffer={handleCounterOffer}
	/>
</div>
