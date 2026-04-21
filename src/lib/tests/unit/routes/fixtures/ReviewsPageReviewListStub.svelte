<script lang="ts">
	let {
		reviews = [],
		highlightedReviewId = null,
		onReviewClick = undefined,
		onReply = undefined
	} = $props<{
		reviews?: { id: string; revieweePubkey: string }[];
		highlightedReviewId?: string | null;
		onReviewClick?: ((review: { id: string; revieweePubkey: string }) => void) | undefined;
		onReply?: ((reviewId: string) => void) | undefined;
	}>();
</script>

<div data-testid="reviews-list" data-highlighted-review-id={highlightedReviewId ?? ''}>
	{#each reviews as review (review.id)}
		<div data-testid={`review-${review.id}`}>
			<span>{review.id}</span>
			{#if onReviewClick}
				<button type="button" onclick={() => onReviewClick(review)}>open</button>
			{/if}
			{#if onReply}
				<button type="button" onclick={() => onReply(review.id)}>reply</button>
			{/if}
		</div>
	{/each}
</div>
