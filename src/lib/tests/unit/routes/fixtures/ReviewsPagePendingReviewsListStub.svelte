<script lang="ts">
	let { pendingReviews = [], onReviewClick = () => {} } = $props<{
		pendingReviews?: {
			id: string;
			revieweePubkey: string;
			subjectType: string;
			settlementType: string;
		}[];
		onReviewClick?: (pendingReview: { id: string }) => void;
	}>();
</script>

<div data-testid="reviews-pending-list">
	{#if pendingReviews.length === 0}
		<div>no-pending</div>
	{:else}
		{#each pendingReviews as pendingReview (pendingReview.id)}
			<div data-testid={`pending-${pendingReview.id}`}>
				<span>{pendingReview.id}</span>
				<button type="button" onclick={() => onReviewClick(pendingReview)}>review-now</button>
			</div>
		{/each}
	{/if}
</div>
