<script lang="ts">
	import type { CounterOffer } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';

	// Props
	const props = $props<{
		offer: CounterOffer;
		bidCurrency: string;
	}>();

	// Derived state
	const getFormattedPrice = $derived(
		formatCurrency(props.offer.price.amount, props.offer.price.currency || props.bidCurrency)
	);

	const getFormattedDate = $derived(formatDate(new Date(props.offer.createdAt)));

	const getStatusClass = $derived(
		(() => {
			switch (props.offer.status) {
				case 'accepted':
					return 'text-success';
				case 'rejected':
					return 'text-error';
				default:
					return 'text-info';
			}
		})()
	);
</script>

<div class="bg-base-200 rounded-lg p-3">
	<div class="mb-2 flex items-start justify-between">
		<div>
			<span class="text-sm font-medium">Counter from {props.offer.proposedBy.slice(0, 6)}...</span>
			<span class="ml-2 text-xs opacity-70">{getFormattedDate}</span>
		</div>
		<span
			class="badge badge-sm capitalize"
			class:badge-success={props.offer.status === 'accepted'}
			class:badge-error={props.offer.status === 'rejected'}
			class:badge-info={props.offer.status === 'pending'}
		>
			{props.offer.status}
		</span>
	</div>

	<div class="mb-2 flex items-center justify-between">
		<span class="text-sm">Offered price:</span>
		<span class="font-semibold">{getFormattedPrice}</span>
	</div>

	{#if props.offer.timeFrame && props.offer.timeFrame.estimatedCompletion}
		<div class="mb-2 flex items-center justify-between text-sm">
			<span>Delivery:</span>
			<span>{props.offer.timeFrame.estimatedCompletion}</span>
		</div>
	{/if}

	{#if props.offer.message}
		<div class="mt-2">
			<p class="text-sm whitespace-pre-line">{props.offer.message}</p>
		</div>
	{/if}
</div>
