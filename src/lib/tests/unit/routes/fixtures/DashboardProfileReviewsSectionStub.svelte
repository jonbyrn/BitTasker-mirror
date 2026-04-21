<script lang="ts">
	let {
		stats,
		receivedReviews = [],
		givenReviews = [],
		pendingReviews = [],
		activeTab = 'received',
		isLoading = false,
		error = null,
		onTabChange,
		onReviewClick,
		onPendingReviewClick,
		onViewAll
	} = $props<{
		stats: { totalReviews: number; averageRating: number };
		receivedReviews?: Array<{ id: string }>;
		givenReviews?: Array<{ id: string }>;
		pendingReviews?: Array<{ id: string }>;
		activeTab?: string;
		isLoading?: boolean;
		error?: string | null;
		onTabChange?: (tab: 'received' | 'given' | 'pending') => void;
		onReviewClick?: (review: { id: string }) => void;
		onPendingReviewClick?: (pendingReview: { id: string }) => void;
		onViewAll?: () => void;
	}>();
</script>

<div
	data-testid="profile-reviews-stub"
	data-active-tab={activeTab}
	data-received-count={receivedReviews.length}
	data-given-count={givenReviews.length}
	data-pending-count={pendingReviews.length}
	data-loading={String(isLoading)}
	data-error={error ?? ''}
	data-total-reviews={stats.totalReviews}
>
	<p>profile reviews stub</p>
	<button type="button" onclick={() => onViewAll?.()}>view-all</button>
	<button type="button" onclick={() => onTabChange?.('pending')}>tab-pending</button>
	<button type="button" onclick={() => onReviewClick?.(receivedReviews[0])}>received-click</button>
	<button type="button" onclick={() => onPendingReviewClick?.(pendingReviews[0])}>pending-click</button>
</div>
