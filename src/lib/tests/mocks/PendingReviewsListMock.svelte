<script lang="ts">
	let { initialPendingReviews = [], onReviewSubmitted } = $props<{
		initialPendingReviews?: Array<unknown>;
		onReviewSubmitted?: (pendingReviews?: unknown[]) => void;
	}>();
</script>

<div data-testid="mock-pending-list-count">{initialPendingReviews.length}</div>

<button type="button" onclick={() => onReviewSubmitted?.([])}> trigger review submit </button>
