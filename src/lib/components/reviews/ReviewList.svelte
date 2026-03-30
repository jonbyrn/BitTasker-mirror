<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getReviewsForUser } from '$lib/utils/nostr-review';
	import VerifiedReviewCard from './VerifiedReviewCard.svelte';
	import type { NostrVerifiedReview, ReviewFilter, ReviewSort } from '$lib/types/review';

	let {
		reviews: prefetchedReviews,
		revieweePubkey,
		filter,
		sort = 'newest',
		limit = 50,
		onReviewClick,
		onReply
	} = $props<{
		reviews?: NostrVerifiedReview[];
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
	let activeRequestId = 0;
	const filterKey = $derived(filter ? JSON.stringify(filter) : '');

	function sortReviews(
		sourceReviews: NostrVerifiedReview[],
		sortType: ReviewSort
	): NostrVerifiedReview[] {
		const sorted = [...sourceReviews];

		switch (sortType) {
			case 'newest':
				return sorted.sort((a, b) => b.createdAt - a.createdAt);
			case 'oldest':
				return sorted.sort((a, b) => a.createdAt - b.createdAt);
			case 'highest_rating':
				return sorted.sort((a, b) => b.content.overallRating - a.content.overallRating);
			case 'lowest_rating':
				return sorted.sort((a, b) => a.content.overallRating - b.content.overallRating);
			default:
				return sorted;
		}
	}

	function applyFilterAndSort(sourceReviews: NostrVerifiedReview[]): NostrVerifiedReview[] {
		let filtered = sourceReviews;

		if (filter) {
			if (filter.minRating !== undefined) {
				filtered = filtered.filter((review) => review.content.overallRating >= filter.minRating!);
			}
			if (filter.maxRating !== undefined) {
				filtered = filtered.filter((review) => review.content.overallRating <= filter.maxRating!);
			}
			if (filter.hasComment) {
				filtered = filtered.filter(
					(review) => review.content.comment && review.content.comment.trim().length > 0
				);
			}
			if (filter.hasPhotos) {
				filtered = filtered.filter(
					(review) => review.content.photos && review.content.photos.length > 0
				);
			}
			if (filter.dateFrom) {
				filtered = filtered.filter((review) => review.createdAt >= filter.dateFrom!);
			}
			if (filter.dateTo) {
				filtered = filtered.filter((review) => review.createdAt <= filter.dateTo!);
			}
		}

		return sortReviews(filtered, sort).slice(0, limit);
	}

	function handleReviewKeydown(event: KeyboardEvent, review: NostrVerifiedReview) {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		event.preventDefault();
		onReviewClick?.(review);
	}

	async function loadReviews() {
		const requestId = ++activeRequestId;
		if (prefetchedReviews) {
			reviews = applyFilterAndSort(prefetchedReviews);
			error = null;
			isLoading = false;
			return;
		}

		if (!revieweePubkey) {
			reviews = [];
			error = null;
			isLoading = false;
			return;
		}

		isLoading = true;
		error = null;
		try {
			const fetchedReviews = await getReviewsForUser(revieweePubkey, limit);

			if (requestId === activeRequestId) {
				reviews = applyFilterAndSort(fetchedReviews);
			}
		} catch (err) {
			console.error('Failed to load reviews:', err);
			if (requestId === activeRequestId) {
				error = err instanceof Error ? err.message : $t('reviews.list.load_error');
				reviews = [];
			}
		} finally {
			if (requestId === activeRequestId) {
				isLoading = false;
			}
		}
	}

	$effect(() => {
		void prefetchedReviews;
		void revieweePubkey;
		void limit;
		void sort;
		void filterKey;

		loadReviews();
	});
</script>

<div class="reviews-list">
	{#if isLoading}
		<div class="flex items-center justify-center py-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-outline alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{error}</span>
		</div>
	{:else if reviews.length === 0}
		<div class="text-base-content/70 py-8 text-center">
			<p>{$t('reviews.list.no_reviews')}</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each reviews as review (review.nostrEventId)}
				{#if onReviewClick}
					<div
						role="button"
						tabindex="0"
						class="focus-visible:ring-primary/60 cursor-pointer rounded-xl text-left transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
						onclick={() => onReviewClick(review)}
						onkeydown={(event) => handleReviewKeydown(event, review)}
					>
						<VerifiedReviewCard {review} {onReply} />
					</div>
				{:else}
					<VerifiedReviewCard {review} {onReply} />
				{/if}
			{/each}
		</div>
	{/if}
</div>
