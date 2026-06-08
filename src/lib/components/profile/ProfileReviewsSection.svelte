<script lang="ts">
	import type { AttestedReview } from '$lib/types/review';
	import { t } from 'svelte-i18n';
	import { getReviewsForUser } from '$lib/utils/reviews/queries';
	import { calculateReviewStats } from '$lib/utils/reviews/aggregation';
	import type { ReviewStats } from '$lib/types/review';
	import ReviewCard from '$lib/components/profile/ReviewCard.svelte';

	const INITIAL_PAGE_SIZE = 3;
	const LOAD_MORE_PAGE_SIZE = 5;
	const STATS_BATCH_SIZE = 50;

	let {
		pubkey,
		isActive = false,
		id = 'reviews'
	}: {
		pubkey: string;
		isActive?: boolean;
		id?: string;
	} = $props();

	let reviews = $state<AttestedReview[]>([]);
	let stats = $state<ReviewStats | null>(null);
	let isLoading = $state(false);
	let isLoadingMore = $state(false);
	let error = $state<string | null>(null);
	let hasLoaded = false;
	let cursor = $state<number | null>(null);
	const hasMore = $derived(cursor !== null);

	function getDistributionBars(): {
		stars: number;
		count: number;
		percent: number;
		percentOfTotal: number;
	}[] {
		if (!reviews.length) return [];
		const counts = [0, 0, 0, 0, 0];
		for (const r of reviews) {
			const rating = Math.round(r.content.overallRating);
			if (rating >= 1 && rating <= 5) counts[rating - 1]++;
		}
		const max = Math.max(...counts, 1);
		const total = reviews.length;
		return [5, 4, 3, 2, 1].map((stars) => ({
			stars,
			count: counts[stars - 1],
			percent: Math.round((counts[stars - 1] / max) * 100),
			percentOfTotal: total > 0 ? Math.round((counts[stars - 1] / total) * 100) : 0
		}));
	}

	async function fetchReviews(before?: number) {
		if (!pubkey) return;
		if (before) {
			isLoadingMore = true;
		} else {
			isLoading = true;
		}
		error = null;
		try {
			const pageSize = before ? LOAD_MORE_PAGE_SIZE : STATS_BATCH_SIZE;
			const queryBefore = before !== undefined ? before - 1 : undefined;
			const result = await getReviewsForUser(pubkey, pageSize, queryBefore);
			if (before) {
				const existingIds = new Set(reviews.map((r) => r.attestationEventId));
				const uniqueNewReviews = result.reviews.filter(
					(r) => !existingIds.has(r.attestationEventId)
				);
				reviews = [...reviews, ...uniqueNewReviews];
			} else {
				// First page: use full batch for stats, trim to INITIAL_PAGE_SIZE for display
				if (!hasLoaded) {
					stats = calculateReviewStats(result.reviews);
				}
				reviews = result.reviews.slice(0, INITIAL_PAGE_SIZE);
			}
			cursor = result.cursor;
			hasLoaded = true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
			isLoadingMore = false;
		}
	}

	$effect(() => {
		if (isActive && !hasLoaded && !isLoading && pubkey) {
			fetchReviews();
		}
	});

	function handleLoadMore() {
		if (cursor && !isLoadingMore) {
			fetchReviews(cursor);
		}
	}
</script>

<section
	{id}
	class="mb-8 scroll-mt-20"
	data-testid="profile-reviews-section"
	aria-labelledby="{id}-heading"
>
	<div class="mb-4">
		<h2 id="{id}-heading" class="text-xl font-bold">{$t('profile.reviews.title')}</h2>
	</div>

	{#if isLoading}
		<div role="status" aria-busy="true" aria-label={$t('common.loading')}>
			<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{#each Array.from({ length: 3 }) as _, key (key)}
					<div class="skeleton h-48 rounded-2xl"></div>
				{/each}
			</div>
		</div>
	{:else if error}
		<div class="alert alert-error" role="alert">
			<span>{error}</span>
			<button
				class="btn btn-ghost btn-sm"
				onclick={() => fetchReviews()}
				aria-label={$t('common.buttons.retry')}
			>
				{$t('common.buttons.retry')}
			</button>
		</div>
	{:else if hasLoaded && (reviews?.length ?? 0) === 0}
		<div class="text-base-content/60 py-8 text-center">
			<p>{$t('profile.reviews.empty')}</p>
		</div>
	{:else if hasLoaded}
		<!-- Stats summary -->
		{#if stats}
			<div class="bg-base-100 mb-6 rounded-2xl p-4 shadow-sm">
				<div class="flex flex-row items-start gap-4">
					<!-- Average rating -->
					<div class="flex w-24 shrink-0 flex-col items-center gap-1">
						<span class="text-4xl font-bold">{stats.averageRating.toFixed(1)}</span>
						<div class="flex items-center gap-0.5">
							{#each Array.from({ length: 5 }) as _, i (i)}
								{@const fill = Math.min(1, Math.max(0, stats.averageRating - i))}
								{@const clipRight = (1 - fill) * 100}
								<span class="relative inline-block text-sm">
									<span class="text-base-content/30">★</span>
									{#if fill > 0}
										<span
											class="text-primary absolute inset-0 overflow-hidden"
											style="clip-path: inset(0 {clipRight}% 0 0)"
											aria-hidden="true">★</span
										>
									{/if}
								</span>
							{/each}
						</div>
						<span class="text-base-content/60 text-sm">
							{$t('profile.reviews.total_reviews', { values: { count: stats.totalReviews } })}
						</span>
					</div>

					<!-- Distribution bars -->
					<div class="min-w-0 flex-1 space-y-1">
						{#each getDistributionBars() as bar (bar.stars)}
							<div class="flex items-center gap-1.5">
								<span class="w-4 text-right text-xs font-medium">{bar.stars}</span>
								<span class="text-primary text-xs">★</span>
								<div
									class="bg-base-200 h-2 min-w-0 flex-1 overflow-hidden rounded-full"
									role="meter"
									aria-label="{bar.stars} {$t('profile.reviews.stars')}: {bar.count} {$t(
										'profile.reviews.reviews_count'
									)}"
									aria-valuenow={bar.count}
									aria-valuemin={0}
									aria-valuemax={reviews.length}
								>
									<div
										class="bg-primary h-full rounded-full transition-all duration-300"
										style="width: {bar.percent}%"
									></div>
								</div>
								<span class="text-base-content/60 w-14 shrink-0 text-right text-xs"
									>{bar.percentOfTotal}% ({bar.count})</span
								>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Review cards grid -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-live="polite">
			{#each reviews as review (review.attestationEventId)}
				<ReviewCard {review} />
			{/each}
		</div>

		<!-- Load more -->
		{#if hasMore}
			<div class="mt-4 flex justify-center">
				<button class="btn btn-outline btn-sm" onclick={handleLoadMore} disabled={isLoadingMore}>
					{#if isLoadingMore}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						{$t('common.load_more')}
					{/if}
				</button>
			</div>
		{/if}
	{/if}
</section>
