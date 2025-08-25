<script lang="ts">
	import type { CounterOffer, TaskBid } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { format, formatDistanceToNow } from 'date-fns';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import bidService from '$lib/api/services/bid.service';
	import { calculateUsdtEstimate, formatSatsAmount } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount } from 'svelte';
	let {
		bids,
		isOwner,
		showCounterOfferForm = $bindable(), taskTitle = $bindable('')
	} = $props<{
		bids: TaskBid[];
		isOwner: boolean;
		showCounterOfferForm: boolean;
		taskTitle: string;
	}>();

	let loadingBids = $state(false);

	// Bid withdrawal state
	let withdrawalReason = $state('');
	let bidToWithdraw = $state<string | null>(null); // Now storing just the bid ID
	let withdrawingBid = $state(false);
	let withdrawalError = $state('');
	let selectedBid = $state<TaskBid | null>(null);
	let expandedBidId = $state<string | null>(null);
	
	// Bid acceptance state
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<TaskBid | null>(null);

	// Format helpers
	const formatTimeAgo = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return formatDistanceToNow(dateObj, { addSuffix: true });
	};

	const formatDateString = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'MMM yyyy');
	};

	// Bid actions
	function handleAcceptBid(bid: TaskBid) {
		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	async function submitBidAcceptance(bidId: string, escrowMethod: string, escrowDetails: any) {
		try {
			// First accept the bid
			await bidService.acceptBid(bidId);
			
			// Then handle escrow funding based on the method
			if (escrowMethod === 'bittasker') {
				// Handle BitTasker wallet funding
				console.log('Funding escrow from BitTasker wallet:', escrowDetails);
				// TODO: Implement BitTasker wallet funding
			} else if (escrowMethod === 'external') {
				// Handle external wallet funding
				console.log('External wallet funding details:', escrowDetails);
				// TODO: Implement external wallet funding tracking
			}
			
			// Close the form
			showAcceptanceForm = false;
			bidToAccept = null;
			
			// Refresh task to update status and bids
			// await loadTaskDetails(props.taskId!);
		} catch (error) {
			console.error('Error accepting bid:', error);
		}
	}

	async function handleRejectBid(bid: TaskBid) {
		try {
			await bidService.rejectBid(bid.id);
			// Refresh task to update status and bids
			// await loadTaskDetails(props.taskId!);
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
			// await loadTaskDetails(props.taskId!);
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
			// if (props.taskId) {
			// 	await loadTaskDetails(props.taskId);
			// }
		} catch (error) {
			console.error($t('task.drawer.error.counter_offer'), error);
		}
	}

	async function handleRespondToCounterOffer(counterId: string, action: 'accept' | 'reject') {
		try {
			// API call to respond to counter offer
			await bidService.respondToCounterOffer(counterId, action);
			// Reload task to update counter offer status
			// if (props.taskId) {
			// 	await loadTaskDetails(props.taskId);
			// }
		} catch (error) {
			console.error(`Error ${action}ing counter offer:`, error);
		}
	}

	let btcPrice = $state(0);

	async function fetchBtcPrice(): Promise<void> {
		btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
	}

	onMount(async () => {
		await fetchBtcPrice();
	});
</script>

<div class="space-y-6 mb-10">
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
				{isOwner
					? 'Your task has not received any bids yet.'
					: 'You have not bid on this task yet.'}
			</p>
		</div>
	{:else}
		<!-- Bids list -->
		<div class="space-y-4 mb-10 pb-10">
			{#each bids as bid}
				<!-- Bid card -->
				<div class="bg-base-200 rounded-2xl shadow-sm transition-shadow hover:shadow-md">
					<div class="card-body p-4">
						<!-- Bid header with status and amount -->
						<div class="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
							<div class="flex items-center gap-3">
								<!-- Avatar -->
								<div class="avatar">
									<div class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full">
										{#if bid.userProfile?.user?.avatar}
											<img
												src={bid.userProfile.user.avatar}
												alt="Avatar"
												class="h-12 w-12 rounded-full object-cover"
											/>
										{:else}
											<!-- Placeholder with initials -->
											<div
												class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-center"
											>
												{#if bid.userProfile?.user?.displayName}
													<span class="text-xl font-semibold">
														{bid.userProfile.user.displayName.charAt(0).toUpperCase()}
													</span>
												{:else}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="text-base-content/60 h-8 w-8"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
														/>
													</svg>
												{/if}
											</div>
										{/if}
									</div>
								</div>

								<!-- Username and submission time -->
								<div class="flex flex-col">
									<h3 class="text-lg font-semibold">
										{bid.userProfile?.user?.displayName || 'Anonymous User'}
									</h3>

									<p class="text-base-content/60 text-sm">
										Member since
										{new Date(bid.createdAt).toLocaleDateString('en-US', {
											month: '2-digit',
											year: 'numeric'
										})}
									</p>
									<!-- Review Stars (if available) -->
									<div class="mt-1 flex items-center">
										{#each Array(5) as _, i}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3 {i < 4 ? 'text-yellow-400' : 'text-base-content/30'}"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
												/>
											</svg>
										{/each}
										<span class="text-base-content/60 ml-1 text-xs">
											<!-- {(bid.userProfile.user.rating || 0).toFixed(1)} -->
											4.0
										</span>
									</div>
								</div>
							</div>

							<div class="mb-1">
								{#if bid.paymentType === 'HOURLY'}
									<div class="text-lg font-bold">
										${calculateUsdtEstimate(bid.hourlyRate, btcPrice)} /hr
									</div>
									<div class="">
										<span class="text-base-content/60 text-sm font-semibold">
											{formatSatsAmount(bid.hourlyRate)}
										</span>
									</div>
								{:else}
									<div class="text-lg font-bold">
										${calculateUsdtEstimate(bid.amount, btcPrice)}
									</div>
									<div class="">
										<span class="text-base-content/60 text-sm font-semibold">
											{formatSatsAmount(bid.amount)}
										</span>
									</div>
								{/if}
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
									<h4 class="text-base-content/80 mb-3 text-sm font-medium">Withdraw Your Bid</h4>
									<p class="mb-2 text-sm">Please provide a reason for withdrawing your bid:</p>

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
									<div class=" rounded-box">
										<div class="grid grid-cols-2 gap-2">
											<div>
												<span class="text-base-content/60 text-xs">Payment Type:</span>
												<div class="text-lg font-bold">{bid.paymentType}</div>
											</div>
											{#if bid.paymentType === 'HOURLY'}
												<div>
													<span class="text-base-content/60 text-xs">Hourly Rate:</span>
													<div class="text-lg font-bold">
														${calculateUsdtEstimate(bid.hourlyRate, btcPrice)} /hr
													</div>
													<span class="text-base-content/60 text-sm font-semibold">
														{formatSatsAmount(bid.hourlyRate)}
													</span>
												</div>

												<div>
													<span class="text-base-content/60 text-xs">Estimated Hours:</span>
													<div class="text-lg font-bold">{bid.estimatedHours || 0} hours</div>
												</div>
											{/if}
											<div>
												<span class="text-base-content/60 text-xs">Total Amount:</span>
												<div class="text-lg font-bold">
													${calculateUsdtEstimate(bid.amount, btcPrice)}
												</div>
												<span class="text-base-content/60 text-sm font-semibold">
													{formatSatsAmount(bid.amount)}
												</span>
											</div>

											<div>
												<span class="text-base-content/60 text-xs">Estimated Timeline:</span>
												<div class="text-lg font-bold">{bid.estimatedDuration}</div>
											</div>
										</div>
									</div>
								</div>

								<!-- Full description -->
								<div>
									<small class="text-base-content/60 mb-1 text-sm font-medium">Proposal</small>
									<div class="rounded-box whitespace-pre-wrap">
										{bid.description}
									</div>
								</div>

								<!-- Approach -->
								{#if bid.proposedApproach}
									<div class="mt-2">
										<small class="text-base-content/60 mb-1 text-sm font-medium"
											>Proposed Approach</small
										>
										<div class=" rounded-box whitespace-pre-wrap">
											{bid.proposedApproach}
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
										<h4 class="text-base-content/60 mb-1 text-sm font-medium">Milestones</h4>
										<div class="bg-base-300 rounded-box">
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
						<div class="card-actions mt-4 mb-3 pb-1 justify-end">
							<button
								class="btn btn-ghost btn-outline btn-sm border"
								onclick={() => toggleBidDetails(bid.id)}
							>
								{expandedBidId === bid.id ? 'Hide details' : 'Show details'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="ml-1 h-4 w-4 transition-transform duration-300 {expandedBidId === bid.id
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
							{#if isOwner && bid.status && bid.status === 'PENDING'}
								<button class="btn btn-error btn-sm" onclick={() => handleRejectBid(bid)}>
									Decline
								</button>
								<button class="btn btn-outline btn-sm" onclick={() => handleCounterOffer(bid)}>
									Counter
								</button>
								<button class="btn btn-primary btn-sm" onclick={() => handleAcceptBid(bid)}>
									Accept
								</button>
							{:else if !isOwner && bid.status && bid.status === 'PENDING'}
								<button
									class="btn {bidToWithdraw === bid.id ? 'btn-error' : 'btn-warning'} btn-sm"
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

{#if showAcceptanceForm && bidToAccept}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="w-full max-w-3xl p-4">
			<BidAcceptanceForm
				bid={bidToAccept}
				taskTitle={taskTitle}
				onSubmit={submitBidAcceptance}
				onCancel={() => {
					showAcceptanceForm = false;
					bidToAccept = null;
				}}
			/>
		</div>
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
