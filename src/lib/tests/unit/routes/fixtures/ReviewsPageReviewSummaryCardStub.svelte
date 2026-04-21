<script lang="ts">
	let { stats, onViewAll = undefined } = $props<{
		stats: { totalReviews: number; averageRating: number };
		onViewAll?: () => void;
	}>();
</script>

<div
	data-testid="review-summary-card"
	data-total-reviews={stats.totalReviews}
	data-average-rating={stats.averageRating}
>
	{#if onViewAll}
		<button type="button" onclick={onViewAll}>view-all</button>
	{/if}
</div>
