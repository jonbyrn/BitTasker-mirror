<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import type { Bids$result } from '$houdini';

	const props = $props<{
		bid: Bids$result['bids']['received']['data'][0] | Bids$result['bids']['submitted']['data'][0];
		isProvider: boolean;
	}>();

	// Calculate time ago string
	const timeAgo = $derived(() => {
		try {
			const timestamp = props.bid.createdAt || new Date().toISOString();
			const date = new Date(timestamp);
			const now = new Date();
			const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

			if (diffInSeconds < 60) return 'just now';
			if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
			if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
			return `${Math.floor(diffInSeconds / 86400)}d ago`;
		} catch (e) {
			return 'unknown';
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
						? `Bid on: ${props.bid.taskTitle || 'Untitled Task'}`
						: `From: ${props.bid.freelancer.name || 'Anonymous'}`}
				</h3>
				<p class="text-base-content/70 text-sm">{timeAgo()}</p>
			</div>

			<div class="flex flex-col items-end">
				<span class="text-lg font-bold">
					{formatCurrency(props.bid.amount, props.bid.currency)}
				</span>
				<span class="badge badge-sm {statusClasses} capitalize">
					{props.bid.status || 'pending'}
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
				aria-label={`View details for bid on ${props.bid.taskTitle || 'this task'}`}
			>
				View Details
			</button>
		</div>
	</div>
</div>
