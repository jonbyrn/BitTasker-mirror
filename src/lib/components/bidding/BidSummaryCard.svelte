<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import type { MyBids$result } from '$houdini';
	import { t } from 'svelte-i18n';

	const props = $props<{
		bid:
			| MyBids$result['bids']['received']['data'][0]
			| MyBids$result['bids']['submitted']['data'][0];
		isProvider: boolean;
	}>();

	// Calculate time ago string
	const timeAgo = $derived(() => {
		try {
			const timestamp = props.bid.createdAt || new Date().toISOString();
			const date = new Date(timestamp);
			const now = new Date();
			const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

			if (diffInSeconds < 60) return $t('dashboard.bids.bid_summary.just_now');
			if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}${$t('dashboard.bids.bid_summary.minutes_ago')}`;
			if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}${$t('dashboard.bids.bid_summary.hours_ago')}`;
			return `${Math.floor(diffInSeconds / 86400)}${$t('dashboard.bids.bid_summary.days_ago')}`;
		} catch (e) {
			return $t('dashboard.bids.bid_summary.unknown');
		}
	});

	const statusClasses = $derived(() => {
		switch (props.bid.status) {
			case 'accepted':
				return 'bg-success text-success-content';
			case 'rejected':
				return 'bg-error text-error-content';
			case 'countered':
				return 'bg-warning text-warning-content';
			case 'pending':
			default:
				return 'bg-info text-info-content';
		}
	});

	function handleViewDetails() {
		if (props.bid.taskId) {
			goto(`/dashboard/task/${props.bid.taskId}?tab=bids&bid=${props.bid.id}`);
		}
	}
</script>

<div
	class="card bg-base-100 shadow transition-shadow duration-200 hover:shadow-md"
	role="article"
	aria-labelledby={`bid-${props.bid.id}-title`}
>
	<div class="card-body p-4">
		<div class="flex items-start justify-between">
			<div>
				<h3 id={`bid-${props.bid.id}-title`} class="card-title text-base">
					{props.isProvider
						? `${$t('dashboard.bids.bid_summary.bid_on')} ${props.bid.taskTitle || $t('dashboard.bids.bid_summary.untitled_task')}`
						: `${$t('dashboard.bids.bid_summary.from')} ${props.bid.freelancer.name || $t('dashboard.bids.bid_summary.anonymous')}`}
				</h3>
				<p class="text-base-content/70 text-sm">{timeAgo()}</p>
			</div>

			<div class="flex flex-col items-end">
				<span class="text-lg font-bold">
					{formatCurrency(props.bid.amount, props.bid.currency)}
				</span>
				<span class="badge badge-sm {statusClasses} capitalize">
					{props.bid.status || $t('dashboard.bids.bid_summary.pending')}
				</span>
			</div>
		</div>

		{#if props.bid.description}
			<p class="mt-2 line-clamp-2 text-sm">{props.bid.description}</p>
		{/if}

		<div class="card-actions mt-3 justify-end">
			<button
				onclick={handleViewDetails}
				class="btn btn-sm btn-primary"
				aria-label={`${$t('dashboard.bids.bid_summary.view_details_for_bid_on')} ${props.bid.taskTitle || $t('dashboard.bids.bid_summary.this_task')}`}
			>
				{$t('dashboard.bids.bid_summary.view_details')}
			</button>
		</div>
	</div>
</div>
