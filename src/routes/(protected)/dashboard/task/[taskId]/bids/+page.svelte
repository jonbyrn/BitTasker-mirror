<script lang="ts">
	import type { NostrEvent } from 'nostr-tools';
	import type { CounterOffer, NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
	import { t, locale } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { bidStore } from '$lib/stores/bid.store';
	import { sendBidStatusUpdate, cachedSatsFromUsd } from '$lib/utils/nostr-bid';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTime, parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import BidCardSkeleton from '$lib/components/bidding/BidCardSkeleton.svelte';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { ndk } from '$lib/nostr/ndk';
	import { createDebug } from '$lib/utils/debug';

	// State
	let task = $state<NostrEvent | null>(null);
	let btcPrice = $state(0);
	let expandedBidId = $state<string | null>(null);
	let showAcceptanceForm = $state(false);
	let showCounterOfferForm = $state(false);
	let bidToAccept = $state<NostrEventWithFollowup | null>(null);
	let selectedBid = $state<NostrBidContent | null>(null);

	const d = createDebug('BidsPage');

	// Create a reactive subscription - note the callback function () => ({ ... })
	const bidsSubscription = ndk.$subscribe(() => ({
		filters: ndk.$currentPubkey
			? [{ kinds: [KINDS.BIDS], limit: 50, '#p': [ndk.$currentPubkey], '#t': [page.params.taskId] }]
			: [],
		onEvent(event) {
			d.log('onEvent', event);
			console.log('onEvent', event);
		},
		wrap: true
	}));

	$effect(() => {
		d.log('bidsSubscription', bidsSubscription);
	});

	// Derived state from bid store
	let bids = $derived($bidStore.bids[page.params.taskId] || []);

	// Check if any bid has been accepted - disable all accept/decline buttons if true
	let hasAcceptedBid = $derived(
		bids.some(
			(bid) =>
				bid?.latestStatus?.content?.status?.toLowerCase() === BidStatusEnum.ACCEPTED.toLowerCase()
		)
	);

	// Check if any bid is currently being processed - prevents race condition during acceptance
	let hasProcessingBid = $derived(bids.some((bid) => $bidStore.processingBidIds.has(bid.id)));

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

	async function loadTaskDetails() {
		try {
			$bidStore.error = '';

			// Event ID (64 hex) → find by id; otherwise id is d-tag (readable or legacy task-uuid)
			const id = page.params.taskId;
			const isEventId = /^[0-9a-fA-F]{64}$/.test(id);

			if (isEventId) {
				try {
					const result = await nostrEventsService.findEventById(id);
					task = result.data;
				} catch {
					$bidStore.error = $t('task.drawer.error.load');
					return;
				}
			} else {
				const filter = {
					kinds: [KINDS.TASK_CREATION],
					'#d': [id],
					limit: 1
				};
				const response = await nostrEventsService.requestEvents({
					filters: [filter]
				});
				if (response.data && response.data.length > 0) {
					task = response.data[0];
				}
			}

			if (!task) {
				$bidStore.error = $t('task.drawer.error.load');
				return;
			}
		} catch (error) {
			console.error('Failed to load task details:', error);
			$bidStore.error = $t('task.drawer.error.load');
		}
	}

	async function loadBids() {
		const taskId = page.params.taskId;
		const legacyTaskId = task?.id ?? taskId;
		await bidStore.loadBidsForTask(taskId);
		// Subscribe to real-time updates
		await bidStore.subscribeToUpdates(taskId, legacyTaskId);
	}

	function toggleBidDetails(bidId: string) {
		expandedBidId = expandedBidId === bidId ? null : bidId;
	}

	function handleAcceptBid(bid: NostrEventWithFollowup) {
		// Check if any bid has already been accepted
		if (hasAcceptedBid) {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		// Check if any bid is currently being processed (prevents race condition)
		if (hasProcessingBid) {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		// Check if this specific bid is already accepted
		if (
			bid?.latestStatus?.content?.status?.toLowerCase() === BidStatusEnum.ACCEPTED.toLowerCase()
		) {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	async function submitCounterOffer(
		_bidId: string,
		_counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
	) {
		// TODO: Implement counter offer with nostr
		// Params are reserved for future implementation
		void bidId;
		void counterOffer;
	}

	async function handleRejectBid(eventId: string, bidContent: NostrBidContent) {
		// Prevent rejecting bids if any bid has been accepted
		if (hasAcceptedBid) {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		// Prevent rejecting bids if any bid is currently being processed (prevents race condition)
		if (hasProcessingBid) {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		// Prevent rejecting bids that are already accepted or rejected
		if (bidContent.status === 'ACCEPTED' || bidContent.status === 'REJECTED') {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_rejected'));
			return;
		}

		try {
			// Send bid rejection status via encrypted DM to the bidder
			await sendBidStatusUpdate(
				eventId, // bidEventId
				bidContent.taskId,
				bidContent.bidderId || '', // bidder's pubkey
				BidStatusEnum.REJECTED,
				$t('dashboard.bids.bid_acceptance.bid_rejected_message') // Optional rejection message
			);
		} catch (error) {
			console.error('Error rejecting bid:', error);
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.bid_rejected_error'));
		}
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
	}

	async function retryLoadingData() {
		await loadTaskDetails();
		await Promise.all([loadBids(), fetchBtcPrice()]);
	}

	onMount(async () => {
		await Promise.all([loadTaskDetails(), loadBids(), fetchBtcPrice()]);
	});

	onDestroy(() => {
		// Clean up subscriptions when leaving the page
		bidStore.unsubscribeFromUpdates();
	});

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

			<button
				class="btn btn-secondary btn-sm gap-2"
				onclick={retryLoadingData}
				disabled={$bidStore.isLoading}
				aria-label={$t('dashboard.tasks.refresh')}
			>
				{#if $bidStore.isLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span class="hidden sm:inline">{$t('dashboard.tasks.refreshing')}</span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					<span>{$t('dashboard.tasks.refresh')}</span>
				{/if}
			</button>
		</div>
	</div>
	{#if $bidStore.isLoading}
		<div class="space-y-4">
			<BidCardSkeleton />
		</div>
	{:else if $bidStore.error}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-error mx-auto h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
				/>
			</svg>
			<h3 class="text-error mt-4 text-xl font-semibold">
				{$t('dashboard.bids.bid_acceptance.error_loading_bids')}
			</h3>
			<p class="text-base-content/60 mt-2 mb-4">
				{$bidStore.error}
			</p>
			<div class="text-base-content/60 text-sm">
				{$t('dashboard.bids.bid_acceptance.retry')}
			</div>
		</div>
	{:else if bids.length === 0}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-xl font-semibold">{$t('task.drawer.no_bids')}</h3>
			<button class="btn btn-primary mt-4" onclick={retryLoadingData}>
				{$t('dashboard.bids.bid_acceptance.retry')}
			</button>
		</div>
	{:else}
		<div class="space-y-4">
			{#each bids as bid (bid.id)}
				{@const bidContent = bid.content as unknown as NostrBidContent}
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
								{#if bidContent.status === 'ACCEPTED'}
									<div class="badge badge-success badge-sm text-primary-content">
										{$t('dashboard.bids.bid_acceptance.accepted')}
									</div>
								{:else if bidContent.status === 'REJECTED'}
									<div class="badge badge-error badge-sm text-primary-content">
										{$t('dashboard.bids.bid_acceptance.rejected')}
									</div>
								{:else if bidContent.status === 'PENDING'}
									<div class="badge badge-warning badge-sm text-primary-content">
										{$t('dashboard.bids.bid_acceptance.pending')}
									</div>
								{/if}

								<!-- See Profile link + actions menu (right-aligned) -->
								<div class="flex items-end gap-1">
									{#if bidContent.bidderId}
										<button
											class="btn btn-ghost btn-xs text-primary hover:bg-primary/10 cursor-pointer"
											onclick={() => goto(`/npub/${bidContent.bidderId}`)}
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
										{cachedSatsFromUsd(bidContent.amount, btcPrice)} Sats
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
									onclick={() => handleRejectBid(bid.id, bidContent)}
									disabled={hasAcceptedBid ||
										hasProcessingBid ||
										bid?.latestStatus?.content?.status?.toLowerCase() ===
											BidStatusEnum.ACCEPTED.toLowerCase() ||
										bid?.latestStatus?.content?.status?.toLowerCase() ===
											BidStatusEnum.REJECTED.toLowerCase() ||
										$bidStore.processingBidIds.has(bid.id)}
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
								{#if bid?.latestStatus?.content?.status?.toLowerCase() === BidStatusEnum.ACCEPTED.toLowerCase()}
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
										disabled={hasAcceptedBid ||
											hasProcessingBid ||
											bid?.latestStatus?.content?.status?.toLowerCase() ===
												BidStatusEnum.REJECTED.toLowerCase() ||
											$bidStore.processingBidIds.has(bid.id)}
									>
										{#if $bidStore.processingBidIds.has(bid.id)}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
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
										{/if}
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
<Modal
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
</Modal>

<Drawer
	isOpen={showAcceptanceForm}
	title={$t('dashboard.bids.bid_acceptance.accept_bid_fund_contract')}
	onClose={handleCloseBid}
	position="right"
	isScrollable={true}
>
	{#if showAcceptanceForm && bidToAccept && task}
		<BidAcceptanceForm bid={bidToAccept} {task} {btcPrice} onCancel={handleCloseBid} />
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
