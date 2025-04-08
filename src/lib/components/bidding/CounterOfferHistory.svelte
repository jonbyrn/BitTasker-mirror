<script lang="ts">
	import type { Bid, CounterOffer } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';

	// Props
	const props = $props<{
		bid: Bid;
		counterOffers: CounterOffer[];
		currentUserId: string;
		onRespondToOffer: (counterId: string, action: 'accept' | 'reject') => Promise<void>;
	}>();

	// State
	let isLoading = $state(false);

	// Handle response to counter offer
	async function handleResponse(counterId: string, action: 'accept' | 'reject') {
		isLoading = true;
		try {
			await props.onRespondToOffer(counterId, action);
		} catch (error) {
			console.error(`Failed to ${action} counter offer:`, error);
		} finally {
			isLoading = false;
		}
	}

	// Helpers
	function getStatusBadgeClasses(status: string) {
		return status === 'accepted'
			? 'badge-success'
			: status === 'rejected'
			? 'badge-error'
			: 'badge-info';
	}

	function wasProposedByCurrentUser(proposedBy: string) {
		return proposedBy === props.currentUserId;
	}
</script>

<div class="space-y-6">
	<h3 class="text-lg font-medium">Negotiation History ({props.counterOffers.length})</h3>

	{#if props.counterOffers.length === 0}
		<div class="bg-base-200 rounded-lg p-4 text-center">
			<p>No counter offers yet</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each props.counterOffers as offer}
				<div 
					class="card bg-base-200 hover:bg-base-300 transition-colors border border-base-300"
				>
					<div class="card-body p-4">
						<div class="flex justify-between items-start">
							<div>
								<div class="badge {getStatusBadgeClasses(offer.status)} mb-2">
									{offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
								</div>
								<h4 class="text-base font-medium">
									{formatCurrency(offer.price.amount, offer.price.currency)}
								</h4>
								{#if offer.timeFrame}
									<p class="text-sm mt-1">
										Estimated completion: {offer.timeFrame.estimatedCompletion}
									</p>
								{/if}
							</div>
							<div class="text-right">
								<p class="text-sm text-base-content/60">
									{wasProposedByCurrentUser(offer.proposedBy) ? 'You' : 'They'} proposed
								</p>
								<p class="text-xs text-base-content/60">
									{formatDate(offer.createdAt)}
								</p>
							</div>
						</div>

						<div class="mt-3">
							<p class="text-sm whitespace-pre-wrap">{offer.message}</p>
						</div>

						{#if offer.status === 'pending' && !wasProposedByCurrentUser(offer.proposedBy)}
							<div class="card-actions justify-end mt-3">
								<button 
									class="btn btn-sm btn-outline btn-error" 
									onclick={() => handleResponse(offer.id, 'reject')}
									disabled={isLoading}
								>
									Decline
								</button>
								<button 
									class="btn btn-sm btn-primary" 
									onclick={() => handleResponse(offer.id, 'accept')}
									disabled={isLoading}
								>
									Accept
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
