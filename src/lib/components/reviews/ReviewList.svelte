<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getReviewsForUser } from '$lib/utils/review-source';
	import { filterReviews, sortReviews } from '$lib/utils/review-aggregation';
	import VerifiedReviewCard from './VerifiedReviewCard.svelte';
	import type { NostrVerifiedReview, ReviewFilter, ReviewSort } from '$lib/types/review';

	let {
		revieweePubkey,
		filter,
		sort = 'newest',
		limit = 50,
		onReviewClick,
		onReply
	} = $props<{
		revieweePubkey: string;
		filter?: ReviewFilter;
		sort?: ReviewSort;
		limit?: number;
		onReviewClick?: (review: NostrVerifiedReview) => void;
		onReply?: (reviewId: string) => void;
	}>();

	let reviews = $state<NostrVerifiedReview[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasMore = $state(true);

	// Load reviews
	async function loadReviews() {
		if (isLoading || !hasMore) return;

		isLoading = true;
		error = null;

		try {
			const fetchedReviews = await getReviewsForUser(revieweePubkey, limit);
			const filtered = filter ? filterReviews(fetchedReviews, filter) : fetchedReviews;
			reviews = sortReviews(filtered, sort);
			hasMore = false; // For now, we load all at once
		} catch (err) {
			console.error('Failed to load reviews:', err);
			error = err instanceof Error ? err.message : $t('reviews.list.load_error');
		} finally {
			isLoading = false;
		}
	}

	// Load reviews when revieweePubkey or deps change
	$effect(() => {
		loadReviews();
	});
</script>

<div class="reviews-list">
	{#if isLoading}
		<div class="flex justify-center items-center py-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-outline alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{:else if reviews.length === 0}
		<div class="text-center py-8 text-base-content/70">
			<p>{$t('reviews.list.no_reviews')}</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each reviews as review (review.nostrEventId)}
			<button
				type="button"
				class="w-full text-left cursor-pointer transition-opacity hover:opacity-80"
				onclick={() => onReviewClick?.(review)}
			>
				<VerifiedReviewCard {review} {onReply} />
			</button>
			{/each}
		</div>
	{/if}
</div>


