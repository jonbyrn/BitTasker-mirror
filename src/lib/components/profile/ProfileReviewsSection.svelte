<script lang="ts">
	import { t } from 'svelte-i18n';
	import ReviewSummaryCard from './ReviewSummaryCard.svelte';
	import ReviewManagementTabs from '$lib/components/reviews/ReviewManagementTabs.svelte';
	import ReviewList from '$lib/components/reviews/ReviewList.svelte';
	import PendingReviewsList from '$lib/components/reviews/PendingReviewsList.svelte';
	import type {
		PendingReviewRecord,
		ReviewStatsSummary,
		ReviewViewTab,
		VerifiedReviewRecord
	} from '$lib/components/reviews/reviewTypes';

	let {
		userPubkey,
		isCurrentUser = false,
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
		userPubkey?: string;
		isCurrentUser?: boolean;
		stats?: ReviewStatsSummary | null;
		receivedReviews?: VerifiedReviewRecord[];
		givenReviews?: VerifiedReviewRecord[];
		pendingReviews?: PendingReviewRecord[];
		activeTab?: ReviewViewTab;
		isLoading?: boolean;
		error?: string | null;
		onTabChange?: (tab: ReviewViewTab) => void;
		onReviewClick?: (review: VerifiedReviewRecord) => void;
		onPendingReviewClick?: (pendingReview: PendingReviewRecord) => void;
		onViewAll?: () => void;
	}>();

	const summaryStats = $derived(
		stats ?? {
			averageRating: 0,
			totalReviews: 0,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
			categoryGroups: []
		}
	);
</script>

<section class="space-y-6">
	{#if userPubkey}
		<div class="text-base-content/60 text-xs tracking-[0.18em] uppercase">
			{$t('reviews.profile.user_label')}: {userPubkey}
		</div>
	{/if}

	<ReviewSummaryCard stats={summaryStats} {onViewAll} />

	<div class="card border-base-300 bg-base-100 border shadow-xl">
		<div class="card-body">
			<ReviewManagementTabs
				{activeTab}
				receivedCount={receivedReviews.length}
				givenCount={givenReviews.length}
				pendingCount={pendingReviews.length}
				{isCurrentUser}
				{onTabChange}
			/>

			<div class="mt-4">
				{#if error}
					<div class="alert alert-error alert-outline">{error}</div>
				{:else if isLoading}
					<div class="flex items-center justify-center py-12">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{:else if activeTab === 'pending' && isCurrentUser}
					<PendingReviewsList
						{pendingReviews}
						{isCurrentUser}
						onReviewClick={onPendingReviewClick}
					/>
				{:else if activeTab === 'given'}
					<ReviewList
						reviews={givenReviews}
						emptyTitle={$t('reviews.list.no_given_reviews')}
						emptyDescription={$t('reviews.management.given_empty_description')}
						{onReviewClick}
					/>
				{:else}
					<ReviewList
						reviews={receivedReviews}
						emptyTitle={$t('reviews.list.no_reviews')}
						emptyDescription={$t('reviews.management.received_empty_description')}
						{onReviewClick}
					/>
				{/if}
			</div>
		</div>
	</div>
</section>
