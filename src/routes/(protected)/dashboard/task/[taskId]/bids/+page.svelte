<script lang="ts">
	import type { NostrBidContent } from '$lib/types/bid';
	import { t, locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTime, parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	// import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import NoBids from '$lib/components/bidding/NoBids.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	// import Modal from '$lib/components/Modal.svelte';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { getTaskRelay, ndk } from '$lib/nostr/ndk';
	import { createDebug } from '$lib/utils/debug';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import { NDKTask } from '$lib/nostr/events/task';

	// State
	let expandedBidId = $state<string | null>(null);
	let showAcceptanceForm = $state(false);
	// let showCounterOfferForm = $state(false);
	let bidToAccept = $state<NDKBid | null>(null);
	// let selectedBid = $state<NDKBid | null>(null);

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

	// Simple function to get translated bid content (description, proposedApproach, coverLetter)
	// Reactive to locale changes via $locale
	function getTranslatedBidContent(
		bid: NostrBidContent,
		field: 'description' | 'proposedApproach' | 'coverLetter'
	): string {
		const currentLang = $locale || 'en';
		const originalText = bid[field] || '';

		// If no translations, return original
		if (!bid.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if (bid.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = bid.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	function toggleBidDetails(bidId: string) {
		expandedBidId = expandedBidId === bidId ? null : bidId;
	}

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
				{@const bidContent = bid.bidContent}
				<div
					class="bg-base-100 border-base-200 rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md"
				>
					<div class="p-4 md:p-6">
						<!-- Top row: User info and status (full width) -->
						<div class="mb-4 flex w-full items-center justify-between gap-4">
							<!-- Left side: UserInfoDisplay -->
							<div class="flex min-w-0 flex-1 items-center gap-4">
								<UserInfoDisplay
									avatar={bidContent.bidderAvatar}
									username={bidContent.bidderName ?? ''}
									rating={bidContent.bidderRating ?? 0}
									size="md"
									pubkey={bidContent.bidderId}
									profileLink={bidContent.bidderId}
									memberSince={bidContent.timestamp}
								/>
							</div>

							<!-- Right side: Status badge, profile link, and actions menu (right-aligned) -->
							<div class="flex shrink-0 flex-col items-end gap-2">
								<!-- Top row: status badge -->
								<!-- Bid Status Badge -->
								{#if ( task?.acceptedBid === bid.id || bidContent.status === 'ACCEPTED')}
									<div class="badge badge-success badge-sm text-primary-content">
										{$t('dashboard.bids.bid_acceptance.accepted')}
									</div>
									<!-- {:else if bidContent.status === 'REJECTED'}
									<div class="badge badge-error badge-sm text-primary-content">
										{$t('dashboard.bids.bid_acceptance.rejected')}
									</div>
								{:else if bidContent.status === 'PENDING'}
									<div class="badge badge-warning badge-sm text-primary-content">
										{$t('dashboard.bids.bid_acceptance.pending')}
									</div> -->
								{/if}
								<!-- See Profile link -->
								{#if bidContent.bidderId}
									<button
										class="btn btn-ghost btn-xs text-primary hover:bg-primary/10 cursor-pointer"
										onclick={() => goto(`/npub/${bid.author.npub}`)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
												/>
											</svg>
											<span class="">{$t('dashboard.bids.bid_acceptance.see_profile')}</span>
										</button>
									{/if}

									{#if bidContent.bidderId}
										<ActionsMenu
											contentType="bid"
											reportedPubkey={bidContent.bidderId}
											reportedEventId={bid.id}
										/>
									{/if}
								</div>
							</div>
						</div>

						<!-- Second row: Description and payment info -->
						<div class="mb-4 flex flex-col gap-4">
							<!-- Description -->
							<div class="min-w-0 flex-1">
								<p class="text-base-content/80 wrap-break-words line-clamp-2">
									{getTranslatedBidContent(bidContent, 'description')}
								</p>
							</div>

							<!-- Payment info row: FIXED info on left, price on right (same row for all screen sizes) -->
							<div class="flex flex-row items-center justify-between gap-2">
								<!-- Payment type info - left aligned with max-width -->
								<!-- <div class="text-base-content/50 max-w-[50%] flex-1 text-xs wrap-break-word">
									{bidContent.paymentType} ? {bidContent.estimatedDuration}
								</div> -->

								<!-- Estimated date for FIXED bids -->
								{#if bidContent.paymentType === 'FIXED' && bidContent.startDateTime && bidContent.endDateTime}
									<div class="flex max-w-[60%] items-start gap-2">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-base-content/60 mt-0.5 h-4 w-4 shrink-0"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
										<div class="flex min-w-0 flex-1 flex-col">
											<small class="text-base-content/60 text-xs">
												{$t('bids.estimated_date')}
											</small>
											<span class="text-sm font-medium">
												{(() => {
													const startDate = parseDateWithLocalTime(bidContent.startDateTime);
													const endDate = parseDateWithLocalTime(bidContent.endDateTime);
													return startDate && endDate
														? `${formatStandardDateTime(startDate, $locale || 'en')} - ${formatStandardDateTime(endDate, $locale || 'en')}`
														: 'N/A';
												})()}
											</span>
											<span class="text-base-content/60 text-xs">
												({bidContent.estimatedDuration})
											</span>
										</div>
									</div>
								{/if}
								<!-- Payment info column (aligned right) -->
								<div class="shrink-0 text-right">
									<div class="text-xl font-bold sm:text-2xl">
										${formatNumberWithTwoDecimals(bidContent.amount)}
									</div>
									<div class="sm:text-md text-base-content/60 text-sm font-bold">
										{satsFromUsd(bidContent.amount, btcPrice.price)}
									</div>
								</div>
							</div>
						</div>

						<!-- Action buttons - always visible -->
						{#snippet expandedDetails()}
							<!-- Description -->
							{#if bidContent.description}
								<div>
									<p class="text-base-content/60 wrap-break-words mb-2 text-xs font-medium">
										{$t('bids.your_description')}
									</p>
									<div class="bg-base-200 rounded-lg p-3">
										<p class="text-base-content/80 text-sm leading-relaxed">
											{getTranslatedBidContent(bidContent, 'description')}
										</p>
									</div>
								</div>
							{/if}
							<!-- Approach -->
							{#if bidContent.proposedApproach && bidContent.proposedApproach.trim() !== ''}
								<div>
									<p class="text-base-content/60 wrap-break-words mb-2 text-xs font-medium">
										{$t('bids.your_approach')}
									</p>
									<div class="bg-base-200 rounded-lg p-3">
										<p class="text-base-content/80 text-sm leading-relaxed">
											{getTranslatedBidContent(bidContent, 'proposedApproach')}
										</p>
									</div>
								</div>
							{/if}
							<!-- Cover Letter -->
							{#if bidContent.coverLetter}
								<div>
									<p class="text-base-content/60 wrap-break-words mb-2 text-xs font-medium">
										{$t('bids.your_cover_letter')}
									</p>
									<div class="bg-base-200 rounded-lg p-3">
										<p class="text-base-content/80 text-sm leading-relaxed">
											{getTranslatedBidContent(bidContent, 'coverLetter')}
										</p>
									</div>
								</div>
							{/if}
						{/snippet}

						<div
							class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<!-- Left: Show Details + mobile-only expanded (drops down directly below, pushes buttons) -->
							<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
								<button
									class="btn btn-ghost btn-sm w-full sm:w-auto"
									onclick={() => toggleBidDetails(bidContent.bidId)}
								>
									{expandedBidId === bidContent.bidId
										? $t('dashboard.bids.bid_acceptance.hide_details')
										: $t('dashboard.bids.bid_acceptance.show_details')}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="ml-1 h-4 w-4 transition-transform duration-200 {expandedBidId ===
										bidContent.bidId
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
								{#if expandedBidId === bidContent.bidId}
									<div
										class="border-base-200 space-y-4 border-t pt-4 sm:hidden"
										aria-label={$t('dashboard.bids.bid_acceptance.show_details')}
									>
										{@render expandedDetails()}
									</div>
								{/if}
							</div>

							<div class="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
								<!-- Reject Button -->
								<button
									class="btn btn-error btn-outline btn-sm flex-1 py-1 sm:flex-none"
									onclick={() => handleRejectBid(bid)}
									disabled={false}
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
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
									{#if bidContent.status === 'REJECTED'}
										{$t('dashboard.bids.bid_acceptance.rejected')}
									{:else}
										{$t('dashboard.bids.bid_acceptance.decline')}
									{/if}
								</button>

								<!-- Send Message Button -->
								{#if bidContent.bidderId}
									<button
										class="btn btn-primary btn-outline btn-sm flex-1 py-1 sm:flex-none"
										onclick={() =>
											openMessageModal(bidContent.bidderId || '', bidContent.bidderName ?? '')}
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
												d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
											/>
										</svg>
										{$t('common.profile.send_message')}
									</button>
								{/if}
								<!-- <button
                                    class="btn btn-info btn-outline btn-sm flex-1 py-1 sm:flex-none"
                                    onclick={() => handleCounterOffer(bid)}
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
                                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                        />
                                    </svg>
                                    {$t('dashboard.bids.bid_acceptance.counter')}
                                </button> -->

								<!-- Accept Button -->
								{#if bid.id === task?.acceptedBid}
									<button class="btn btn-success btn-sm flex-1 py-1 sm:flex-none" disabled={true}>
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
												d="M5 13l4 4L19 7"
											/>
										</svg>
										{$t('dashboard.bids.bid_acceptance.accepted')}
									</button>
								{:else}
									<button
										class="btn btn-success btn-sm flex-1 py-1 sm:flex-none"
										onclick={() => handleAcceptBid(bid)}
										disabled={false}
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
												d="M5 13l4 4L19 7"
											/>
										</svg>
										{$t('dashboard.bids.bid_acceptance.accept')}
									</button>
								{/if}
							</div>
						</div>

						<!-- Expanded details: tablet/desktop only (below action row); mobile uses inline block above -->
						{#if expandedBidId === bidContent.bidId}
							<div
								class="border-base-200 mt-4 hidden space-y-4 border-t pt-4 sm:mt-6 sm:block sm:space-y-6 sm:pt-6"
								aria-label={$t('dashboard.bids.bid_acceptance.show_details')}
							>
								{@render expandedDetails()}
							</div>
						{/if}
					</div>
				</div>
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
