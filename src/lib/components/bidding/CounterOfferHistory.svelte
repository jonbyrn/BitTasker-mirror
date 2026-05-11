<script lang="ts">
	import type { Bid, CounterOffer } from '$lib/types/bid';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';
	import { t } from 'svelte-i18n';

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
	<h3 class="text-lg font-medium">
		{$t('common.components.bidding.counter_offer_history.title', {
			values: { count: props.counterOffers.length }
		})}
	</h3>

	{#if props.counterOffers.length === 0}
		<div class="bg-base-200 rounded-lg p-4 text-center">
			<p>{$t('common.components.bidding.counter_offer_history.no_offers')}</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each props.counterOffers as offer (offer.id)}
				<div class="card bg-base-200 hover:bg-base-300 border-base-300 border transition-colors">
					<div class="card-body p-4">
						<div class="flex items-start justify-between">
							<div>
								<div class="badge {getStatusBadgeClasses(offer.status)} mb-2">
									{offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
								</div>
								<h4 class="text-base font-medium">
									{formatCurrency(offer.price.amount, offer.price.currency)}
								</h4>
								{#if offer.startDateTime != null && offer.endDateTime != null}
									<div class="mt-2 max-w-md">
										<TaskDeadlineDisplay
											dateRangeStart={offer.startDateTime}
											dateRangeEnd={offer.endDateTime}
											showTime={true}
											showDuration={true}
										/>
									</div>
								{:else if offer.timeFrame?.estimatedCompletion}
									<p class="mt-1 text-sm">
										{$t('common.components.bidding.counter_offer_history.estimated_completion')}
										{offer.timeFrame.estimatedCompletion}
									</p>
								{/if}
							</div>
							<div class="text-right">
								<p class="text-base-content/60 text-sm">
									{wasProposedByCurrentUser(offer.proposedBy)
										? $t('common.components.bidding.counter_offer_history.you_proposed')
										: $t('common.components.bidding.counter_offer_history.they_proposed')}
								</p>
								<p class="text-base-content/60 text-xs">
									{formatDate(new Date(offer.createdAt))}
								</p>
							</div>
						</div>

						<div class="mt-3">
							<p class="text-sm whitespace-pre-wrap">{offer.message}</p>
						</div>

						{#if offer.status === 'pending' && !wasProposedByCurrentUser(offer.proposedBy)}
							<div class="card-actions mt-3 justify-end">
								<button
									class="btn btn-sm btn-outline btn-error"
									onclick={() => handleResponse(offer.id, 'reject')}
									disabled={isLoading}
								>
									{$t('common.components.bidding.counter_offer_history.decline')}
								</button>
								<button
									class="btn btn-sm btn-primary"
									onclick={() => handleResponse(offer.id, 'accept')}
									disabled={isLoading}
								>
									{$t('common.components.bidding.counter_offer_history.accept')}
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
