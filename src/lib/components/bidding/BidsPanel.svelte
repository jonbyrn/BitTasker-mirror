<script lang="ts">
	import type { Bid, CounterOffer, TaskBid } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import BidCard from '$lib/components/bidding/BidCard.svelte';
	import BidDetailsDrawer from '$lib/components/bidding/BidDetailsDrawer.svelte';
	import taskService from '$lib/api/services/task.service';
	import { t } from 'svelte-i18n';

	// Props
	const props = $props<{
		taskId: string;
		onCreateBid: () => void;
		bids?: TaskBid[];
		selectedBid?: TaskBid | null;
	}>();

	// State
	let bids = $state<TaskBid[]>(props.bids || []);
	let isLoading = $state(false); // No loading state needed as bids are passed directly
	let error = $state<string | null>(null);
	let selectedBid = $state<Bid | null>(props.selectedBid || null);
	let isDrawerOpen = $state(props.selectedBid ? true : false);
	let counterOffers = $state<CounterOffer[]>([]);

	// Lifecycle
	onMount(() => {
		// If a selected bid was provided and has an ID, load its counter offers
		// if (selectedBid && selectedBid.id) {
		// 	counterOffers = bidStore.getCounterOffersForBid(selectedBid.id);
		// 	// Automatically open the drawer if a selected bid was provided
		// 	isDrawerOpen = true;
		// }
	});

	function handleViewDetails(bid: Bid) {
		selectedBid = bid;

		// Load counter offers for this bid
		if (bid.id) {
			// counterOffers = bidStore.getCounterOffersForBid(bid.id);
		} else {
			counterOffers = [];
		}

		isDrawerOpen = true;
	}

	async function handleAcceptBid() {
		if (!props.taskId) return;

		try {
			await taskService.updateTaskStatus(props.taskId, TaskStatusEnum.IN_PROGRESS);
			isDrawerOpen = false;
		} catch (err) {
			console.error('Failed to accept bid:', err);
			error = $t('dashboard.bids.bids_panel.failed_to_accept_bid');
		}
	}

	async function handleRejectBid() {
		if (!props.taskId) return;

		try {
			await taskService.updateTaskStatus(props.taskId, TaskStatusEnum.DISPUTED);
			isDrawerOpen = false;
		} catch (err) {
			console.error('Failed to reject bid:', err);
			error = $t('dashboard.bids.bids_panel.failed_to_reject_bid');
		}
	}

	async function handleCounterOffer() {
		// This would typically open a counter offer form
		// For this implementation, we'll just simulate with a prompt
		if (!props.taskId) return;

		const amount = prompt($t('dashboard.bids.bids_panel.enter_counter_offer_amount'));
		if (!amount) return;

		const message = prompt($t('dashboard.bids.bids_panel.enter_message_for_counter_offer'));
		if (!message) return;

		try {
			// const counterOffer: CounterOffer = {
			// 	id: crypto.randomUUID(),
			// 	bidId: props.taskId,
			// 	price: {
			// 		amount: parseFloat(amount),
			// 		currency: 'USD'
			// 	},
			// 	message,
			// 	proposedBy: 'current-user-id',
			// 	status: 'pending',
			// 	createdAt: new Date().toISOString()
			// };
			// await bidService.createCounterOffer(props.taskId, counterOffer);

			// Refresh counter offers
			if (props.taskId) {
				// counterOffers = bidStore.getCounterOffersForBid(props.taskId);
			}
		} catch (err) {
			console.error('Failed to create counter offer:', err);
			error = $t('dashboard.bids.bids_panel.failed_to_create_counter_offer');
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
			<h2 class="text-xl font-bold">{$t('dashboard.bids.bids_panel.title')}</h2>
			{#if !isLoading}
				<p class="text-sm opacity-70">{bids.length} {bids.length !== 1 ? $t('dashboard.bids.bids_panel.bids') : $t('dashboard.bids.bids_panel.bid')} {$t('dashboard.bids.bids_panel.submitted')}</p>
			{/if}
		</div>
	</div>

	<div class="space-y-4">
		{#each bids as bid (bid.id)}
			<BidCard
				{bid}
				onViewDetails={handleViewDetails}
				onAcceptBid={handleAcceptBid}
				onRejectBid={handleRejectBid}
				onCounterOffer={handleCounterOffer}
			/>
		{/each}
	</div>

	<!-- Bid Details Drawer -->
	<BidDetailsDrawer
		bid={selectedBid}
		isOpen={isDrawerOpen}
		{counterOffers}
		onClose={closeDrawer}
		onAcceptBid={handleAcceptBid}
		onRejectBid={handleRejectBid}
		onCounterOffer={handleCounterOffer}
	/>
</div>
