<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import BidAcceptanceFormV2 from '$lib/components/bidding/BidAcceptanceFormV2.svelte';
	import BidCard from '$lib/components/bidding/BidCard.svelte';
	import NoBids from '$lib/components/bidding/NoBids.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { getTaskRelay, ndk, setNDKSigner } from '$lib/nostr/ndk';
	import { createDebug } from '$lib/utils/debug';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import { NDKTask } from '$lib/nostr/events/task';
	import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import { bidStore } from '$lib/stores/bid.store';
	import { appStore } from '$lib/stores/app.store';

	// State
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<NDKBid | null>(null);

	const d = createDebug('BidsPage');

	$effect(() => {
		if (ndk.$currentPubkey) return;
		void setNDKSigner().catch((error) => {
			if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true') {
				console.warn('[bids] signer init failed', error);
			}
		});
	});

	// Task lives on a separate relay — must be its own subscription.
	const taskSub = ndk.$subscribe<NDKTask>(() => {
		const taskAuthor =
			page.url.searchParams.get('author') ??
			page.url.searchParams.get('client') ??
			ndk.$currentPubkey;
		if (!taskAuthor) return undefined;
		return {
			filters: [
				{ kinds: [KINDS.TASK_CREATION], authors: [taskAuthor], '#d': [page.params.taskId] }
			],
			wrap: true,
			relaySet: getTaskRelay(),
			noDedupe: true
		};
	});

	let task = $derived(taskSub.events[0]);
	const routeTaskEventId = $derived(page.url.searchParams.get('event') ?? undefined);
	const routeClientHex = $derived(
		page.url.searchParams.get('author') ?? page.url.searchParams.get('client') ?? undefined
	);
	const bidRecipientPubkey = $derived(routeClientHex ?? ndk.$currentPubkey);
	const taskEventId = $derived(routeTaskEventId ?? task?.id);
	const bidFilter = $derived.by(() => {
		if (!bidRecipientPubkey || !taskEventId) return undefined;
		return { kinds: [KINDS.BIDS], '#p': [bidRecipientPubkey], '#e': [taskEventId], limit: 50 };
	});

	// Single subscription for both bids (30007) and their status events (30008).
	// Both use the same relay pool and the same task tag — no reason for two subscriptions.
	// wrap: true is required so NDK calls NDKBid.from() which decrypts bid content.
	// Kind 30008 has no registered event class so it stays as raw NDKEvent.
	const bidsAndStatusSub = ndk.$subscribe(() => {
		if (!bidFilter) return undefined;
		return {
			filters: [bidFilter, { kinds: [KINDS.BID_STATUS], '#t': [page.params.taskId], limit: 500 }],
			wrap: true,
			relaySet: getTaskRelay()
		};
	});

	const rawBidsSub = ndk.$subscribe(() => {
		if (!bidFilter) return undefined;
		return {
			filters: [bidFilter],
			relaySet: getTaskRelay(),
			noDedupe: true
		};
	});
	const rawBidEvents = $derived(
		(rawBidsSub.events as import('@nostr-dev-kit/ndk').NDKEvent[]).filter(
			(e) => e.kind === KINDS.BIDS
		)
	);

	// Bid events (kind 30007) — already wrapped as NDKBid by NDK's event class registry.
	const bids = $derived(
		(bidsAndStatusSub.events as (NDKBid | import('@nostr-dev-kit/ndk').NDKEvent)[]).filter(
			(e) => e.kind === KINDS.BIDS
		) as NDKBid[]
	);

	$effect(() => {
		if (import.meta.env.VITE_E2E_TURNSTILE_BYPASS !== 'true') return;
		console.log('[bids]', {
			filter: bidFilter ?? null,
			currentPubkey: ndk.$currentPubkey ?? null,
			bidRecipientPubkey: bidRecipientPubkey ?? null,
			taskEventId: taskEventId ?? null,
			raw: rawBidEvents.length,
			cards: bids.length
		});
	});

	// Status map: bid event id → latest status string, derived from kind 30008 tags (plaintext).
	// Keeps only the most recent status per bid.
	const statusMap = $derived.by(() => {
		const map = new SvelteMap<string, string>();
		const timestamps = new SvelteMap<string, number>();
		for (const event of bidsAndStatusSub.events) {
			if (event.kind !== KINDS.BID_STATUS) continue;
			const statusTag = event.tags.find((t) => t[0] === 's');
			const bidEventIdTag = event.tags.find((t) => t[0] === 'e');
			if (!statusTag?.[1] || !bidEventIdTag?.[1]) continue;
			const eventTs = event.created_at ?? 0;
			const existingTs = timestamps.get(bidEventIdTag[1]) ?? 0;
			if (eventTs >= existingTs) {
				map.set(bidEventIdTag[1], statusTag[1]);
				timestamps.set(bidEventIdTag[1], eventTs);
			}
		}
		return map;
	});

	// Reject confirmation modal state
	let showRejectModal = $state(false);
	let bidToReject = $state<NDKBid | null>(null);
	let rejectingBidId = $state<string | null>(null);
	let rejectedBidIds = $state(new Set<string>());

	function getBidStatus(bidId: string): string | undefined {
		// Local optimistic state takes priority (instant feedback after reject click)
		if (rejectedBidIds.has(bidId)) return BidStatusEnum.REJECTED;
		// Fall back to server-persisted status from kind 30008 events
		return statusMap.get(bidId);
	}

	// Message modal state
	let showMessageModal = $state(false);
	let selectedBidderId = $state<string | null>(null);
	let selectedBidderName = $state<string>('');

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
			const success = await sendBidStatusUpdate(
				bid.id,
				taskId,
				bidderPubkey,
				BidStatusEnum.REJECTED
			);

			if (success) {
				rejectedBidIds = new Set([...rejectedBidIds, bid.id]);
			} else {
				appStore.showErrorToast($t('dashboard.bids.bid_acceptance.failed_to_reject_bid'));
			}
		} catch (err) {
			console.error('Error rejecting bid:', err);
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.failed_to_reject_bid'));
		} finally {
			rejectingBidId = null;
			bidToReject = null;
			bidStore.removeProcessingBid(bid.id);
		}
	}

	function handleCloseBid() {
		showAcceptanceForm = false;
		bidToAccept = null;
	}

	function openMessageModal(bidderId: string, bidderName: string) {
		selectedBidderId = bidderId;
		selectedBidderName = bidderName;
		showMessageModal = true;
	}

	function handleFunded(_contractId: string) {
		showAcceptanceForm = false;
		bidToAccept = null;
	}

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
	{#if bids.length > 0}
		<div class="flex flex-col gap-4">
			{#each bids as bid (bid.id)}
				{@const status = getBidStatus(bid.id)}
				<BidCard
					{bid}
					acceptedBidId={task?.acceptedBid}
					onAcceptBid={handleAcceptBid}
					onRejectBid={handleRejectBid}
					onOpenMessage={openMessageModal}
					isRejecting={rejectingBidId === bid.id}
					isRejected={status === BidStatusEnum.REJECTED}
				/>
			{/each}
		</div>
	{:else if !bidsAndStatusSub.eosed}
		<!-- Still waiting for the initial relay batch — don't show bids with stale status -->
		<div class="flex items-center justify-center py-6">
			<div class="loading loading-spinner loading-md"></div>
			<span class="text-base-content/60 ml-2">{$t('common.loading')}</span>
		</div>
	{:else if bids.length === 0}
		<NoBids onRetry={() => {}} />
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
		<div class="flex flex-col gap-4 px-2 py-2">
			<BidAcceptanceFormV2
				bid={bidToAccept}
				{task}
				onCancel={handleCloseBid}
				onFunded={handleFunded}
			/>
		</div>
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
