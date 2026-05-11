<script lang="ts">
	import type { CounterOffer } from '$lib/types/bid';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';
	import { t } from 'svelte-i18n';

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
</script>

<div class="bg-base-200 rounded-lg p-3">
	<div class="mb-2 flex items-start justify-between">
		<div>
			<span class="text-sm font-medium"
				>{$t('common.components.bidding.counter_offer_item.counter_from', {
					values: { user: props.offer.proposedBy.slice(0, 6) }
				})}</span
			>
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
		<span class="text-sm">{$t('common.components.bidding.counter_offer_item.offered_price')}</span>
		<span class="font-semibold">{getFormattedPrice}</span>
	</div>

	{#if props.offer.startDateTime != null && props.offer.endDateTime != null}
		<div class="mb-2">
			<TaskDeadlineDisplay
				dateRangeStart={props.offer.startDateTime}
				dateRangeEnd={props.offer.endDateTime}
				showTime={true}
				showDuration={true}
			/>
		</div>
	{:else if props.offer.timeFrame?.estimatedCompletion}
		<div class="mb-2 flex items-center justify-between text-sm">
			<span>{$t('common.components.bidding.counter_offer_item.delivery')}</span>
			<span>{props.offer.timeFrame.estimatedCompletion}</span>
		</div>
	{/if}

	{#if props.offer.message}
		<div class="mt-2">
			<p class="text-sm whitespace-pre-line">{props.offer.message}</p>
		</div>
	{/if}
</div>
