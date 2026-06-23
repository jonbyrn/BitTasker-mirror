<script lang="ts">
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import BidAcceptanceFormV2 from '$lib/components/bidding/BidAcceptanceFormV2.svelte';
	import BidCard from '$lib/components/bidding/BidCard.svelte';
	import NoBids from '$lib/components/bidding/NoBids.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { getTaskRelay, ndk } from '$lib/nostr/ndk';
	import { createDebug } from '$lib/utils/debug';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import { NDKTask } from '$lib/nostr/events/task';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import PaymentRequestModal from '$lib/components/wallet/PaymentRequestModal.svelte';
	import IconClose from '~icons/mdi/close';
	import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import { bidStore } from '$lib/stores/bid.store';
	import { appStore } from '$lib/stores/app.store';

	type ReceiveFormState = {
		amount: string;
		unit: 'sats' | 'usd';
		mathExpression: string;
		memo: string;
		selectedNetwork: string;
		chargeFeesToPayer: boolean;
		currentStep?: 1 | 2;
	};

	// State
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<NDKBid | null>(null);
	let isReceiveModalOpen = $state(false);
	let receiveInitialState = $state<ReceiveFormState | null>(null);

	// Centralized Payment Request Modal state
	let paymentRequestModal = $state<{
		isOpen: boolean;
		swapId?: string | null;
		address?: string | null;
		network?: string | null;
		amount?: number | null;
		memo?: string | null;
		chargeFeesToPayer?: boolean;
		totalFees?: number | null;
		formState?: ReceiveFormState | null;
	}>({
		isOpen: false,
		swapId: null,
		address: null,
		network: null,
		amount: null,
		memo: null,
		chargeFeesToPayer: false,
		totalFees: null,
		formState: null
	});

	function openPaymentRequestModal(data: Record<string, unknown>) {
		paymentRequestModal = {
			isOpen: true,
			...data
		};
	}

	function closePaymentRequestModal() {
		paymentRequestModal.isOpen = false;
	}

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

	// Message modal state
	let showMessageModal = $state(false);
	let selectedBidderId = $state<string | null>(null);
	let selectedBidderName = $state<string>('');

	// Reject confirmation modal state
	let showRejectModal = $state(false);
	let bidToReject = $state<NDKBid | null>(null);
	let rejectingBidId = $state<string | null>(null);

	async function handleAcceptBid(bid: NDKBid) {
		d.log('accepting bid', bid);
		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	async function handleRejectBid(bid: NDKBid) {
		bidToReject = bid;
		showRejectModal = true;
	}

	function closeRejectModal() {
		showRejectModal = false;
		bidToReject = null;
	}

	async function confirmRejectBid() {
		if (!bidToReject) return;

		const bid = bidToReject;
		const bidContent = bid.bidContent;
		const bidderPubkey = bidContent?.bidderId;
		const taskIdFromTag = bid.tags?.find((t) => t[0] === 't')?.[1];
		const taskId = taskIdFromTag || page.params.taskId;

		if (!bidderPubkey) {
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.failed_to_reject_bid'));
			closeRejectModal();
			return;
		}

		try {
			rejectingBidId = bid.id;
			showRejectModal = false;

			bidStore.addProcessingBid(bid.id);
			await sendBidStatusUpdate(bid.id, taskId, bidderPubkey, BidStatusEnum.REJECTED);
			// sendBidStatusUpdate handles its own success toast and cache clearing internally
		} catch (err) {
			console.error('Error rejecting bid:', err);
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.failed_to_reject_bid'));
		} finally {
			rejectingBidId = null;
			bidToReject = null;
			// sendBidStatusUpdate also calls removeProcessingBid internally,
			// but we call it again as a safety net
			bidStore.removeProcessingBid(bid.id);
		}
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

	function handleAddFunds(amountUsd: number) {
		receiveInitialState = {
			amount: amountUsd.toFixed(2),
			unit: 'usd',
			mathExpression: amountUsd.toFixed(2),
			memo: `Fund task: ${task?.taskContent.title.slice(0, 50) || 'Task'}`,
			selectedNetwork: 'lightning-bitcoin',
			chargeFeesToPayer: true
		};
		isReceiveModalOpen = true;
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
					isRejecting={rejectingBidId === bid.id}
				/>
			{/each}
		</div>
	{/if}
</div>

<Drawer
	isOpen={showAcceptanceForm}
	title={$t('dashboard.bids.bid_acceptance.accept_bid_fund_contract')}
	onClose={handleCloseBid}
	position="right"
	isScrollable={true}
>
	{#if showAcceptanceForm && bidToAccept && task}
		<BidAcceptanceFormV2
			bid={bidToAccept}
			{task}
			onCancel={handleCloseBid}
			onAddFunds={handleAddFunds}
		/>
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

<!-- Reject Bid Confirmation Modal -->
{#if showRejectModal && bidToReject}
	<div
		class="modal modal-open modal-middle z-120"
		role="dialog"
		aria-modal="true"
		aria-labelledby="reject-modal-title"
	>
		<div class="modal-box flex max-h-[90vh] max-w-md flex-col p-4">
			<h3 id="reject-modal-title" class="shrink-0 text-lg font-bold">
				{$t('dashboard.bids.bid_acceptance.reject_confirm_title')}
			</h3>
			<div class="min-h-0 flex-1 py-3">
				<p class="text-sm">
					{$t('dashboard.bids.bid_acceptance.reject_confirm_message')}
				</p>
			</div>
			<div class="modal-action border-base-300 shrink-0 gap-3 border-t pt-4">
				<button type="button" class="btn btn-ghost flex-1" onclick={closeRejectModal}>
					{$t('dashboard.bids.bid_acceptance.reject_confirm_cancel')}
				</button>
				<button
					type="button"
					class="btn btn-error flex-1"
					onclick={confirmRejectBid}
					disabled={rejectingBidId !== null}
				>
					{#if rejectingBidId}
						<span class="loading loading-spinner loading-sm"></span>
					{/if}
					{$t('dashboard.bids.bid_acceptance.reject_confirm_submit')}
				</button>
			</div>
		</div>
		<button type="button" class="modal-backdrop" onclick={closeRejectModal} aria-label="Close modal"
		></button>
	</div>
{/if}

<WalletPaymentModal isOpen={isReceiveModalOpen} onClose={() => (isReceiveModalOpen = false)}>
	<div class="flex h-full flex-col p-4">
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-bold">{$t('wallet.receive.receive_funds')}</h3>
			<button class="btn btn-ghost btn-sm" onclick={() => (isReceiveModalOpen = false)}>
				<IconClose class="h-5 w-5" />
			</button>
		</div>
		<ReceivePaymentForm
			initialFormState={receiveInitialState}
			onCancel={() => (isReceiveModalOpen = false)}
			onOpenPaymentRequest={(data) => {
				isReceiveModalOpen = false;
				openPaymentRequestModal(data);
			}}
		/>
	</div>
</WalletPaymentModal>

<!-- Centralized Payment Request Modal -->
{#if paymentRequestModal.isOpen && (paymentRequestModal.swapId || paymentRequestModal.address)}
	<WalletPaymentModal isOpen={paymentRequestModal.isOpen} onClose={closePaymentRequestModal}>
		<PaymentRequestModal
			isOpen={paymentRequestModal.isOpen}
			swapId={paymentRequestModal.swapId ?? undefined}
			address={paymentRequestModal.address ?? undefined}
			network={paymentRequestModal.network ?? undefined}
			amount={paymentRequestModal.amount ?? undefined}
			memo={paymentRequestModal.memo ?? undefined}
			chargeFeesToPayer={paymentRequestModal.chargeFeesToPayer}
			totalFees={paymentRequestModal.totalFees ?? undefined}
			onClose={closePaymentRequestModal}
			onEdit={() => {
				if (paymentRequestModal.formState) {
					receiveInitialState = paymentRequestModal.formState;
				}
				closePaymentRequestModal();
				isReceiveModalOpen = true;
			}}
		/>
	</WalletPaymentModal>
{/if}
