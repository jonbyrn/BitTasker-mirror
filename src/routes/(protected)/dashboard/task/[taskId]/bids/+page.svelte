<script lang="ts">
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import BidCard from '$lib/components/bidding/BidCard.svelte';
	// import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import NoBids from '$lib/components/bidding/NoBids.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	// import Modal from '$lib/components/Modal.svelte';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { getTaskRelay, ndk } from '$lib/nostr/ndk';
	import { createDebug } from '$lib/utils/debug';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import { NDKTask } from '$lib/nostr/events/task';

	// State
	let showAcceptanceForm = $state(false);
	// let showCounterOfferForm = $state(false);
	let bidToAccept = $state<NDKBid | null>(null);

	const d = createDebug('BidsPage');

	const taskSub = ndk.$subscribe<NDKTask>(() => {
		// No subscription until we have the users pubkey
		if (!ndk.$currentPubkey) return undefined;
		return {
			filters: [
				{ kinds: [KINDS.TASK_CREATION], authors: [ndk.$currentPubkey], '#d': [page.params.taskId] }
			],
			wrap: true, // Wrap the event in a NDKTask object
			relaySet: getTaskRelay(), // Only pull from task relay
			noDedupe: true // No deduplication to ensure we get the latest task
		};
	});

	let task = $derived(taskSub.events[0]);

	const bidsSub = ndk.$subscribe<NDKBid>(() => {
		// No subscription until we have the users pubkey
		if (!ndk.$currentPubkey) return undefined;
		return {
			filters: [
				{ kinds: [KINDS.BIDS], limit: 50, '#p': [ndk.$currentPubkey], '#t': [page.params.taskId] }
			],
			wrap: true
		};
	});

	$inspect(bidsSub.events, 'bidsSub');

	// Message modal state
	let showMessageModal = $state(false);
	let selectedBidderId = $state<string | null>(null);
	let selectedBidderName = $state<string>('');

	async function handleAcceptBid(bid: NDKBid) {
		//task.acceptedBid = bid.id;
		// publish only to relay 2
		//await task.publishReplaceable(getTaskRelay());
		d.log('accepting bid', bid);
		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	// async function submitCounterOffer(
	// 	_bidId: string,
	// 	_counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
	// ) {
	// 	try {
	// 		// TODO: Implement counter offer with nostr
	// 		/* // API call to create counter offer
	// 		await bidService.createCounterOffer(bidId, counterOffer);
	// 		// Clear bid cache to ensure fresh data
	// 		clearBidCache();
	// 		// Reset state
	// 		showCounterOfferForm = false;
	// 		selectedBid = null;
	// 		// Reload task to update bids with counter offer
	// 		await loadTaskDetails(); */
	// 	} catch (error) {
	// 		console.error($t('task.drawer.error.counter_offer'), error);
	// 	}
	// }

	async function handleRejectBid(bid: NDKBid) {
		d.log('rejecting bid', bid);
		return;
	}

	function handleCloseBid() {
		showAcceptanceForm = false;
		bidToAccept = null;
	}

	// Function to open the message modal
	function openMessageModal(bidderId: string, bidderName: string) {
		selectedBidderId = bidderId;
		selectedBidderName = bidderName;
		showMessageModal = true;
	}

	// Function to close the message modal
	function closeMessageModal() {
		showMessageModal = false;
		selectedBidderId = null;
		selectedBidderName = '';
	}
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-4 sm:mb-6">
		<h3 class="text-xl font-bold sm:text-2xl">{$t('task.drawer.bids_received')}</h3>
		<h3>{task?.acceptedBid}</h3>
		<p class="text-base-content/70 mt-2 text-sm sm:text-base">
			{$t('task.drawer.bids_description')}
		</p>
		<div class="mt-3 flex items-center justify-between">
			<button onclick={() => history.back()} class="btn btn-ghost btn-sm">
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
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/>
				</svg>
				{$t('common.back')}
			</button>
		</div>
	</div>
	{#if bidsSub.events.length === 0}
		<NoBids onRetry={() => {}} />
	{:else}
		<div class="space-y-4">
			{#each bidsSub.events as bid (bid.id)}
				<BidCard
					{bid}
					acceptedBidId={task?.acceptedBid}
					onAcceptBid={handleAcceptBid}
					onRejectBid={handleRejectBid}
					onOpenMessage={openMessageModal}
				/>
			{/each}
		</div>
	{/if}
</div>

<!-- Modals -->
<!-- <Modal
	isOpen={!!(showCounterOfferForm && selectedBid)}
	title={$t('dashboard.bids.counter_offer.title')}
	size="lg"
	isScrollable={true}
	onClose={() => {
		showCounterOfferForm = false;
		selectedBid = null;
	}}
>
	{#if showCounterOfferForm && selectedBid}
		<CounterOfferForm
			bid={selectedBid}
			onSubmit={submitCounterOffer}
			onCancel={() => {
				showCounterOfferForm = false;
				selectedBid = null;
			}}
		/>
	{/if}
</Modal> -->

<Drawer
	isOpen={showAcceptanceForm}
	title={$t('dashboard.bids.bid_acceptance.accept_bid_fund_contract')}
	onClose={handleCloseBid}
	position="right"
	isScrollable={true}
>
	{#if showAcceptanceForm && bidToAccept && task}
		<BidAcceptanceForm bid={bidToAccept} {task} onCancel={handleCloseBid} />
	{/if}
</Drawer>

<!-- Message Modal -->
{#if selectedBidderId}
	<MessageModal
		isOpen={showMessageModal}
		recipientName={selectedBidderName}
		recipientPubkey={selectedBidderId}
		onClose={closeMessageModal}
	/>
{/if}
