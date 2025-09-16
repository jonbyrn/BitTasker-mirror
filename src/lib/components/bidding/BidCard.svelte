<script lang="ts">
	import type { Bid, TaskBid } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { timeAgo } from '$lib/utils/helpers/dateFormatter';
	import { t } from 'svelte-i18n';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		bid: TaskBid;
		onViewDetails: (bid: Bid) => void;
		onAcceptBid: (bid: Bid) => void;
		onRejectBid: (bid: Bid) => void;
		onCounterOffer: (bid: Bid) => void;
	}>();

	// Derived values
	const getBidStatusClass = $derived(() => {
		switch (props.bid.status) {
			case 'accepted':
				return 'badge-success';
			case 'rejected':
				return 'badge-error';
			case 'withdrawn':
				return 'badge-warning';
			case 'countered':
				return 'badge-info';
			default:
				return 'badge-primary';
		}
	});

	const getFormattedPrice = $derived(() => {
		return formatCurrency(props.bid.amount, props.bid.currency);
	});

	const getFormattedTime = $derived(() => {
		return props.bid.createdAt ? timeAgo(new Date(props.bid.createdAt)) : '';
	});
</script>

<div class="card bg-base-100 mb-4 shadow-md transition-shadow duration-200 hover:shadow-lg">
	<div class="card-body p-4">
		<div class="flex items-start justify-between">
			<!-- Bidder Info -->
			<div class="flex-1">
				<h3 class="text-lg font-semibold">{props.bid.bidderName || $t('dashboard.bids.bid_card.anonymous')}</h3>
				<div class="text-sm opacity-70">{getFormattedTime()}</div>
			</div>

			<!-- Price Info -->
			<div class="text-right">
				<div class="text-xl font-bold">{getFormattedPrice()}</div>
				<div class="text-sm">
					{#if props.bid.paymentType === 'HOURLY'}
						{formatCurrency(props.bid.hourlyRate || 0, props.bid.currency)}{$t('dashboard.bids.bid_card.per_hour')} · {$t('dashboard.bids.bid_card.estimated')} {props.bid
							.estimatedHours || 0} {$t('dashboard.bids.bid_card.hours')}
					{:else}
						{$t('dashboard.bids.bid_card.fixed_price')}
					{/if}
				</div>
			</div>
		</div>

		<!-- Status Badge -->
		{#if props.bid.status}
			<div class="mt-2">
				<span class="badge {getBidStatusClass} text-xs uppercase">{props.bid.status}</span>
			</div>
		{/if}

		<!-- Bid Description Preview -->
		<p class="mt-3 line-clamp-2 text-sm">{props.bid.description}</p>

		<!-- Action Buttons -->
		<div class="card-actions mt-4 justify-end">
			<button class="btn btn-xs btn-outline" onclick={() => props.onViewDetails(props.bid)}>
				{$t('dashboard.bids.bid_card.view_details')}
			</button>

			{#if props.bid.status === 'PENDING'}
				<button class="btn btn-xs btn-primary" onclick={() => props.onAcceptBid(props.bid)}>
					{$t('dashboard.bids.bid_card.accept')}
				</button>
				<button
					class="btn btn-xs btn-outline btn-error"
					onclick={() => props.onRejectBid(props.bid)}
				>
					{$t('dashboard.bids.bid_card.decline')}
				</button>
				<button
					class="btn btn-xs btn-outline btn-info"
					onclick={() => props.onCounterOffer(props.bid)}
				>
					{$t('dashboard.bids.bid_card.counter')}
				</button>
			{/if}
		</div>
	</div>
</div>
