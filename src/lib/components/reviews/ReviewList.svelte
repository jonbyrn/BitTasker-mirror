<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
	import { SvelteMap } from 'svelte/reactivity';
	import VerifiedReviewCard from './VerifiedReviewCard.svelte';
	import { filterReviews, sortReviews } from './reviewDisplay';
	import type { ReviewFilter, ReviewSort, VerifiedReviewRecord } from './reviewTypes';

	let {
		reviews: prefetchedReviews = [],
		highlightedReviewId = null,
		highlightedReplyReviewId = null,
		filter,
		sort = 'newest',
		limit = 50,
		loading = false,
		error = null,
		emptyTitle = $t('reviews.list.no_reviews'),
		emptyDescription = '',
		showCreateTaskCta = false,
		createTaskHref = resolve('/dashboard/create-task'),
		onReviewClick,
		onReply
	} = $props<{
		reviews?: VerifiedReviewRecord[];
		highlightedReviewId?: string | null;
		highlightedReplyReviewId?: string | null;
		filter?: ReviewFilter;
		sort?: ReviewSort;
		limit?: number;
		loading?: boolean;
		error?: string | null;
		emptyTitle?: string;
		emptyDescription?: string;
		showCreateTaskCta?: boolean;
		createTaskHref?: string;
		onReviewClick?: (review: VerifiedReviewRecord) => void;
		onReply?: (reviewId: string) => void;
	}>();

	const visibleReviews = $derived(
		sortReviews(filterReviews(prefetchedReviews, filter), sort).slice(0, limit)
	);
	const focusedReviewId = $derived(highlightedReviewId ?? highlightedReplyReviewId);
	const highlightedReview = $derived(
		visibleReviews.find((review) => review.id === focusedReviewId) ?? null
	);
	const reviewNodes = new SvelteMap<string, HTMLDivElement>();

	function registerReviewNode(reviewId: string, node: HTMLDivElement | null) {
		if (node) {
			reviewNodes.set(reviewId, node);
			return;
		}

		reviewNodes.delete(reviewId);
	}

	$effect(() => {
		if (!highlightedReview) {
			return;
		}

		const node = reviewNodes.get(highlightedReview.id);
		if (!node) {
			return;
		}

		requestAnimationFrame(() => {
			node.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
			if (node.getAttribute('tabindex') !== null) {
				node.focus?.({ preventScroll: true });
			}
		});
	});

	function captureReviewNode(node: HTMLDivElement, reviewId: string) {
		registerReviewNode(reviewId, node);

		return {
			destroy() {
				registerReviewNode(reviewId, null);
			}
		};
	}
</script>

<div class="reviews-list">
	{#if loading}
		<div class="flex items-center justify-center py-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-outline alert-error">
			<span>{error}</span>
		</div>
	{:else if visibleReviews.length === 0}
		<div class="py-4 text-center md:py-12">
			<p class="text-base-content/70 mb-2 text-lg">{emptyTitle}</p>
			{#if emptyDescription}
				<p class="text-base-content/50 text-sm">{emptyDescription}</p>
			{/if}
			{#if showCreateTaskCta}
				<div class="mt-4">
					<button class="btn btn-primary btn-sm" type="button" onclick={() => goto(createTaskHref)}>
						{$t('reviews.cta.create_task')}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="space-y-4">
			{#each visibleReviews as review (review.id)}
				<div
					use:captureReviewNode={review.id}
					class={`rounded-2xl text-left transition-all ${
						review.id === focusedReviewId ? 'bg-primary/5 p-1' : ''
					}`}
					tabindex="-1"
					data-highlighted={review.id === focusedReviewId}
					aria-current={review.id === focusedReviewId ? 'true' : undefined}
				>
					<VerifiedReviewCard
						{review}
						onOpen={onReviewClick ? () => onReviewClick(review) : undefined}
						{onReply}
						isHighlighted={review.id === focusedReviewId}
						replyHighlighted={review.id === highlightedReplyReviewId}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>
