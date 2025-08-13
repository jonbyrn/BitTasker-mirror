<script lang="ts">
	import type { CounterOffer, TaskBid } from '$lib/types/bid';
	import { t, locale } from 'svelte-i18n';
	import { formatDistanceToNow } from 'date-fns';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import bidService from '$lib/api/services/bid.service';

	let { bids, isOwner, showCounterOfferForm = $bindable() } = $props<{
		bids: TaskBid[];
		isOwner: boolean;
		showCounterOfferForm: boolean;
	}>();

	let loadingBids = $state(false);

	// Bid withdrawal state
	let withdrawalReason = $state('');
	let bidToWithdraw = $state<string | null>(null); // Now storing just the bid ID
	let withdrawingBid = $state(false);
	let withdrawalError = $state('');
	let selectedBid = $state<TaskBid | null>(null);
	let expandedBidId = $state<string | null>(null);

	// Format helpers
	const formatTimeAgo = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return formatDistanceToNow(dateObj, { addSuffix: true });
	};

	// Bid actions
	async function handleAcceptBid(bid: TaskBid) {
		try {
			await bidService.acceptBid(bid.id);
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
</script>

<div class="space-y-6">
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
		<div class="space-y-4">
			{#each bids as bid}
				<!-- Bid card -->
				<div class="card bg-base-200 shadow-sm transition-shadow hover:shadow-md">
					<div class="card-body p-4">
						<!-- Bid header with status and amount -->
						<div class="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
							<div>
								<div class="flex items-center justify-between gap-4">
									<h3 class="text-lg font-semibold">
										{bid?.userProfile?.user?.displayName || 'Anonymous'}
									</h3>
									<button class="border-gray text-primary border-b-1 text-sm">
										View user details
									</button>
								</div>

								<p class="text-base-content/60 text-xs">
									Submitted {formatTimeAgo(bid.createdAt)}
								</p>
							</div>
							<div class="flex flex-col sm:items-end">
								<div
									class="badge badge-lg mb-1 {bid.status === 'ACCEPTED'
										? 'badge-success'
										: bid.status === 'REJECTED'
											? 'badge-error'
											: bid.status === 'WITHDRAWN'
												? 'badge-warning'
												: bid.status === 'COUNTERED'
													? 'badge-info'
													: 'badge-primary'}"
								>
									{bid.status}
								</div>
								<p class="text-primary font-bold">
									{formatCurrency(bid.amount, bid.currency || 'USD')}
								</p>
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
									<h4 class="text-base-content/60 mb-1 text-sm font-medium">Payment Details</h4>
									<div class="bg-base-300 rounded-box p-3">
										<div class="grid grid-cols-2 gap-2">
											<div>
												<span class="text-base-content/60 text-xs">Payment Type:</span>
												<p>{bid.paymentType}</p>
											</div>
											{#if bid.paymentType === 'HOURLY'}
												<div>
													<span class="text-base-content/60 text-xs">Hourly Rate:</span>
													<p>
														{formatCurrency(bid.hourlyRate || 0, bid.currency || 'USD')}/hr
													</p>
												</div>
												<div>
													<span class="text-base-content/60 text-xs">Estimated Hours:</span>
													<p>{bid.estimatedHours || 0} hours</p>
												</div>
											{/if}
											<div>
												<span class="text-base-content/60 text-xs">Total Amount:</span>
												<p class="font-semibold">
													{formatCurrency(bid.amount, bid.currency || 'USD')}
												</p>
											</div>
										</div>
									</div>
								</div>

								<!-- Full description -->
								<div>
									<h4 class="text-base-content/60 mb-1 text-sm font-medium">Proposal</h4>
									<div class="bg-base-300 rounded-box p-3 whitespace-pre-wrap">
										{bid.description}
									</div>
								</div>

								<!-- Approach -->
								{#if bid.proposedApproach}
									<div>
										<h4 class="text-base-content/60 mb-1 text-sm font-medium">Proposed Approach</h4>
										<div class="bg-base-300 rounded-box p-3 whitespace-pre-wrap">
											{bid.proposedApproach}
										</div>
									</div>
								{/if}

								<!-- Timeline -->
								{#if bid.estimatedDuration}
									<div>
										<h4 class="text-base-content/60 mb-1 text-sm font-medium">
											Estimated Timeline
										</h4>
										<div class="bg-base-300 rounded-box p-3">
											{bid.estimatedDuration}
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
										<div class="bg-base-300 rounded-box p-3">
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
						<div class="card-actions mt-4 justify-end">
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
