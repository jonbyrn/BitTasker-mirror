<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { CounterOffer, SimplifiedTaskBid, NostrBid } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import {
		getBidsForTaskOptimized,
		clearBidCache,
		sendBidStatusUpdate,
		cachedSatsFromUsd
	} from '$lib/utils/nostr-bid';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import bidService from '$lib/api/services/bid.service';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import TranslatableBidContent from '$lib/components/bidding/TranslatableBidContent.svelte';

	// State
	let task = $state<Task | null>(null);
	let bids = $state<SimplifiedTaskBid[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	let isOwner = $state(false);
	let btcPrice = $state(0);
	let expandedBidId = $state<string | null>(null);
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<SimplifiedTaskBid | null>(null);
	let showCounterOfferForm = $state(false);
	let selectedBid = $state<SimplifiedTaskBid | null>(null);
	let showRetryButton = $state(false);

	// Cache for formatted dates to avoid re-computation
	let dateFormatterCache = $state<Map<string, string>>(new Map());

	// Optimized date formatting with caching
	function getCachedFormattedDate(date: Date): string {
		const key = date.getTime().toString();
		if (dateFormatterCache.has(key)) {
			return dateFormatterCache.get(key)!;
		}

		const formatted = new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			year: 'numeric'
		});

		dateFormatterCache.set(key, formatted);
		return formatted;
	}

	async function loadTaskDetails(id: string) {
		if (!id) return;
		try {
			loading = true;
			errorMessage = '';
			showRetryButton = false;

			const { data: event } = await nostrEventsService.findEventById(id);

			if (!event) {
				errorMessage = $t('task.drawer.error.load');
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;
			task = {
				...taskData,
				id: event.id
			};

			// Update task status based on existing bids
			if (task) {
				// Use optimized bid fetching with caching and efficient deduplication
				const dmBids = await getBidsForTaskOptimized(task.id);

				// Transform to SimplifiedTaskBid format (sync mapping)
				bids = dmBids.map(({ bid }) => {
					// Check if bid has a status from bid status messages
					const bidWithStatus = bid as NostrBid & { bidStatus?: string };
					const status = bidWithStatus.bidStatus || 'PENDING';

					return {
						id: bid.bidId,
						taskId: bid.taskId,
						bidderWalletAddress: bid.bidderWalletAddress || '',
						amount: bid.amount,
						currency: bid.currency,
						paymentType: bid.paymentType,
						hourlyRate: bid.hourlyRate ?? undefined,
						estimatedHours: bid.estimatedHours ?? undefined,
						description: bid.description,
						estimatedDuration: bid.estimatedDuration,
						proposedApproach: bid.proposedApproach,
						coverLetter: bid.coverLetter,
						status: status as 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'COUNTERED',
						createdAt: new Date(bid.timestamp).toISOString(),
						startDateTime: bid.startDateTime,
						endDateTime: bid.endDateTime,
						userProfile: {
							user: {
								id: bid.bidderId || 'unknown',
								name: bid.bidderName || 'Anonymous',
								avatar: bid.bidderAvatar || '',
								rating: 0 // Default rating
							}
						}
					} as SimplifiedTaskBid;
				});
			}
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('task.drawer.error.load');
			showRetryButton = true;
		} finally {
			loading = false;
		}
	}

	function toggleBidDetails(bidId: string) {
		expandedBidId = expandedBidId === bidId ? null : bidId;
	}

	function handleCounterOffer(bid: SimplifiedTaskBid) {
		selectedBid = bid;
		showCounterOfferForm = true;
	}

	function handleAcceptBid(bid: SimplifiedTaskBid) {
		// Check if this bid is already accepted or if another bid is already accepted
		if (bid.status === 'ACCEPTED') {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	async function submitCounterOffer(
		bidId: string,
		counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
	) {
		try {
			// API call to create counter offer
			await bidService.createCounterOffer(bidId, counterOffer);
			// Clear bid cache to ensure fresh data
			clearBidCache();
			// Reset state
			showCounterOfferForm = false;
			selectedBid = null;
			// Reload task to update bids with counter offer
			await loadTaskDetails(page.params.taskId as string);
		} catch (error) {
			console.error($t('task.drawer.error.counter_offer'), error);
		}
	}

	async function handleRejectBid(bid: SimplifiedTaskBid) {
		// Prevent rejecting bids that are already accepted or rejected
		if (bid.status === 'ACCEPTED' || bid.status === 'REJECTED') {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_rejected'));
			return;
		}

		try {
			// Send bid rejection status via encrypted DM to the bidder
			await sendBidStatusUpdate(
				bid.id,
				bid.taskId,
				bid.userProfile?.user?.id || '', // bidder's pubkey
				'rejected',
				$t('dashboard.bids.bid_acceptance.bid_rejected_message') // Optional rejection message
			);

			// Clear bid cache and refresh task to update status and bids
			clearBidCache();
			await loadTaskDetails(page.params.taskId as string);
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

	function retryLoadingData() {
		loadTaskDetails(page.params.taskId as string);
		fetchBtcPrice();
	}

	onMount(async () => {
		await loadTaskDetails(page.params.taskId as string);
		await fetchBtcPrice();
	});

	function handleCloseBid() {
		showAcceptanceForm = false;
		bidToAccept = null;
	}
</script>

<div class="mx-auto px-2 md:px-0 py-4">
	<div class="mb-4 sm:mb-6">
		<h3 class="text-xl font-bold sm:text-2xl">{$t('task.drawer.bids_received')}</h3>
		<p class="text-base-content/70 mt-2 text-sm sm:text-base">
			{$t('task.drawer.bids_description')}
		</p>
	</div>
	{#if loading}
		<div class="space-y-4">
			{#each Array(1) as _, i}
				<div class="bg-base-100 border-base-200 rounded-2xl border shadow-sm">
					<div class="p-4 md:p-6">
						<!-- Header skeleton -->
						<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex items-center gap-4">
								<div class="bg-base-300 h-14 w-14 animate-pulse rounded-full"></div>
								<div class="flex-1 space-y-2">
									<div class="bg-base-300 h-5 w-32 animate-pulse rounded"></div>
									<div class="flex items-center gap-4">
										<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
										<div class="flex gap-1">
											{#each Array(5) as _, j}
												<div class="bg-base-300 h-4 w-4 animate-pulse rounded"></div>
											{/each}
										</div>
									</div>
								</div>
							</div>
							<div class="text-right">
								<div class="bg-base-300 mb-1 h-8 w-20 animate-pulse rounded"></div>
								<div class="bg-base-300 mb-1 h-6 w-16 animate-pulse rounded"></div>
								<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
							</div>
						</div>

						<!-- Description skeleton -->
						<div class="mb-4">
							<div class="bg-base-300 mb-2 h-4 w-full animate-pulse rounded"></div>
							<div class="bg-base-300 h-4 w-3/4 animate-pulse rounded"></div>
						</div>

						<!-- Action buttons skeleton -->
						<div
							class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
							<div class="flex gap-2">
								<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
								<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
								<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if errorMessage}
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
				{errorMessage}
			</p>
			{#if showRetryButton}
				<button class="btn btn-primary" onclick={retryLoadingData}>
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
					{$t('dashboard.bids.bid_acceptance.retry')}
				</button>
			{/if}
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
			<!-- <p class="text-base-content/60 mt-2">
				{isOwner ? $t('task.drawer.no_bids_owner') : $t('task.drawer.no_bids_provider')}
			</p> -->
		</div>
	{:else}
		<div class="space-y-4">
			{#each bids as bid}
				<div
					class="bg-base-100 border-base-200 rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md"
				>
					<div class="p-4 md:p-6">
						<!-- Header with user info and bid amount -->
						<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex items-center gap-4">
								<!-- Avatar -->
								<div class="avatar">
									<div
										class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14"
									>
										{#if bid.userProfile?.user?.avatar}
											<img
												src={bid.userProfile.user.avatar}
												alt={$t('task.drawer.avatar_alt')}
												class="h-12 w-12 rounded-full object-cover sm:h-14 sm:w-14"
											/>
										{:else}
											<div
												class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14"
											>
												<span class="text-lg font-semibold sm:text-2xl">
													{(bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
												</span>
											</div>
										{/if}
									</div>
								</div>

								<!-- User info -->
								<div class="min-w-0 flex-1">
									<div class="mb-1 flex items-center gap-2">
										<p class="truncate text-base font-semibold sm:text-lg">
											{bid.userProfile?.user?.name || $t('task.drawer.anonymous')}
										</p>
										<!-- Bid Status Badge -->
										{#if bid.status === 'ACCEPTED'}
											<div class="badge badge-success badge-sm">
												{$t('dashboard.bids.bid_acceptance.accepted')}
											</div>
										{:else if bid.status === 'REJECTED'}
											<div class="badge badge-error badge-sm">
												{$t('dashboard.bids.bid_acceptance.rejected')}
											</div>
										{:else if bid.status === 'PENDING'}
											<div class="badge badge-warning badge-sm">
												{$t('dashboard.bids.bid_acceptance.pending')}
											</div>
										{/if}
										<button
											class="btn btn-ghost btn-xs text-primary hover:bg-primary/10"
											onclick={() =>
												goto(
													`/dashboard/taskees/profile/${bid.userProfile?.user?.id || 'unknown'}`
												)}
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
									</div>
									<div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
										<span class="text-base-content/60 text-xs sm:text-sm">
											{$t('task.drawer.member_since')}
											{getCachedFormattedDate(new Date(bid.createdAt))}
										</span>
										<!-- Rating -->
										<div class="flex items-center gap-1">
											{#each Array(5) as _, i}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3 w-3 sm:h-4 sm:w-4 {i < (bid.userProfile?.user?.rating || 0)
														? 'text-yellow-400'
														: 'text-base-content/30'}"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
													/>
												</svg>
											{/each}
											<span class="text-base-content/60 ml-1 text-xs sm:text-sm"
												>{bid.userProfile?.user?.rating || 0}</span
											>
										</div>
									</div>
								</div>
							</div>

							<!-- Bid amount -->
							<div class="text-left sm:text-right">
								<div class="text-xl font-bold sm:text-2xl">
									${formatNumberWithTwoDecimals(bid.amount)}
								</div>
								<div class="sm:text-md text-base-content/60 text-sm font-bold">
									{cachedSatsFromUsd(bid.amount, btcPrice)} Sats
								</div>
								<div class="text-base-content/50 mt-1 text-xs">
									{bid.paymentType} • {bid.estimatedDuration}
								</div>
							</div>
						</div>

						<!-- Bid description -->
						<div class="mb-4">
							<TranslatableBidContent 
								content={bid.description} 
								contentType="description"
								showToggle={false}
								fallbackClass="text-base-content/80 line-clamp-2"
							/>
						</div>

						<!-- Action buttons - always visible -->
						<div
							class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<button
								class="btn btn-ghost btn-sm w-full sm:w-auto"
								onclick={() => toggleBidDetails(bid.id)}
							>
								{expandedBidId === bid.id
									? $t('dashboard.bids.bid_acceptance.hide_details')
									: $t('dashboard.bids.bid_acceptance.show_details')}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="ml-1 h-4 w-4 transition-transform duration-200 {expandedBidId === bid.id
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

							<div class="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
								<!-- Reject Button -->
								<button
									class="btn btn-error btn-outline btn-sm flex-1 py-1 sm:flex-none"
									onclick={() => handleRejectBid(bid)}
									disabled={bid.status === 'ACCEPTED' || bid.status === 'REJECTED'}
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
									{#if bid.status === 'REJECTED'}
										{$t('dashboard.bids.bid_acceptance.rejected')}
									{:else}
										{$t('dashboard.bids.bid_acceptance.decline')}
									{/if}
								</button>
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
								{#if bid.status === 'ACCEPTED'}
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
										class="btn btn-primary btn-sm flex-1 py-1 sm:flex-none"
										onclick={() => handleAcceptBid(bid)}
										disabled={bid.status === 'REJECTED'}
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

						<!-- Expanded details -->
						{#if expandedBidId === bid.id}
							<div
								class="border-base-200 mt-4 space-y-4 border-t pt-4 sm:mt-6 sm:space-y-6 sm:pt-6"
							>
								<!-- Description -->
								{#if bid.description}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('bids.your_description')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<TranslatableBidContent 
												content={bid.description} 
												contentType="description"
											/>
										</div>
									</div>
								{/if}

								<!-- Approach -->
								{#if bid.proposedApproach}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('bids.your_approach')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<TranslatableBidContent 
												content={bid.proposedApproach} 
												contentType="proposedApproach"
											/>
										</div>
									</div>
								{/if}

								<!-- Cover Letter -->
								{#if bid.coverLetter}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('bids.your_cover_letter')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<TranslatableBidContent 
												content={bid.coverLetter} 
												contentType="coverLetter"
											/>
										</div>
									</div>
								{/if}

								<!-- TODO: Milestones -->
								<!-- {#if bid.milestones && bid.milestones.length > 0}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('dashboard.bids.bid_acceptance.milestones')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<ul class="space-y-2">
												{#each bid.milestones as milestone}
													<li class="flex items-start gap-2 text-sm">
														<div class="bg-primary mt-2 h-2 w-2 flex-shrink-0 rounded-full"></div>
														<span class="text-base-content/80 leading-relaxed"
															>{milestone?.description}</span
														>
													</li>
												{/each}
											</ul>
										</div>
									</div>
								{/if} -->

								<!-- TODO: Location -->
								<!-- {#if bid?.pickupLocation?.displayName || bid?.dropOffLocation?.displayName}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('dashboard.bids.bid_acceptance.location')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<div class="flex items-start gap-2 text-sm">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="text-base-content/60 mt-0.5 h-4 w-4 flex-shrink-0"
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
												<span class="text-base-content/80 leading-relaxed">
													{bid?.pickupLocation?.displayName || bid?.dropOffLocation?.displayName}
												</span>
											</div>
										</div>
									</div>
								{/if} -->
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Modals -->
{#if showCounterOfferForm && selectedBid}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
			<CounterOfferForm
				bid={selectedBid}
				onSubmit={submitCounterOffer as any}
				onCancel={() => {
					showCounterOfferForm = false;
					selectedBid = null;
				}}
			/>
		</div>
	</div>
{/if}

<Drawer
	isOpen={showAcceptanceForm}
	title={$t('dashboard.bids.bid_acceptance.accept_bid_fund_contract')}
	onClose={handleCloseBid}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if showAcceptanceForm && bidToAccept && task}
			<BidAcceptanceForm bid={bidToAccept} {task} {btcPrice} onCancel={handleCloseBid} />
		{/if}
	{/snippet}
</Drawer>
