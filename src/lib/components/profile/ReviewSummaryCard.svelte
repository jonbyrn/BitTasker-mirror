<script lang="ts">
	import { t } from 'svelte-i18n';
	import UserRatingDisplay from '$lib/components/reviews/UserRatingDisplay.svelte';
	import type { ReviewStatsSummary } from '$lib/components/reviews/reviewTypes';

	let {
		stats,
		onViewAll,
		showTitle = true
	} = $props<{
		stats: ReviewStatsSummary;
		onViewAll?: () => void;
		showTitle?: boolean;
	}>();

	function getPercentage(rating: 1 | 2 | 3 | 4 | 5): number {
		if (stats.totalReviews <= 0) return 0;
		return (stats.ratingDistribution[rating] / stats.totalReviews) * 100;
	}
</script>

<div class="card border-base-300 bg-base-100 border shadow-xl">
	<div class="card-body">
		{#if showTitle || onViewAll}
			<div class="flex items-center justify-between gap-3">
				{#if showTitle}
					<h2 class="card-title">{$t('reviews.summary.title')}</h2>
				{/if}
				{#if onViewAll}
					<button class="btn btn-ghost btn-sm" type="button" onclick={onViewAll}>
						{$t('reviews.view_all')}
					</button>
				{/if}
			</div>
		{/if}

		<div class="mb-6 grid grid-cols-2 gap-4">
			<div class="stat bg-base-200 rounded-lg border-0 p-4 before:hidden after:hidden">
				<div class="stat-title text-sm">{$t('reviews.summary.average_rating')}</div>
				<div class="stat-value text-3xl">{stats.averageRating.toFixed(1)}</div>
				<div class="stat-desc text-base-content/70 mt-1">
					<UserRatingDisplay {stats} size="sm" showCount={false} />
				</div>
			</div>

			<div class="stat bg-base-200 rounded-lg border-0 p-4 before:hidden after:hidden">
				<div class="stat-title text-sm">{$t('reviews.summary.total_reviews')}</div>
				<div class="stat-value text-3xl">{stats.totalReviews}</div>
				<div class="stat-desc text-base-content/70">{$t('reviews.summary.reviews_received')}</div>
			</div>
		</div>

		<div class={stats.categoryGroups && stats.categoryGroups.length > 0 ? 'mb-6' : ''}>
			<span class="mb-3 block text-base font-semibold">
				{$t('reviews.summary.rating_distribution')}
			</span>
			<div class="space-y-2" role="list" aria-label={$t('reviews.summary.rating_distribution')}>
				{#each [5, 4, 3, 2, 1] as rating (rating)}
					{@const percentage = getPercentage(rating as 1 | 2 | 3 | 4 | 5)}
					<div
						class="flex items-center gap-3"
						role="listitem"
						aria-label={$t('reviews.summary.rating_aria_label', {
							values: {
								rating,
								count: stats.ratingDistribution[rating as 1 | 2 | 3 | 4 | 5],
								percentage: percentage.toFixed(0)
							}
						})}
					>
						<div class="w-12 text-sm font-medium" aria-hidden="true">{rating}★</div>
						<div class="flex-1" aria-hidden="true">
							<div
								class="bg-base-200 h-4 w-full overflow-hidden rounded-full"
								title={`${percentage.toFixed(1)}%`}
							>
								<div
									class="bg-primary h-full transition-all duration-300"
									style={`width: ${percentage}%`}
								></div>
							</div>
						</div>
						<div class="text-base-content/70 w-16 text-right text-sm" aria-hidden="true">
							{percentage.toFixed(0)}%
						</div>
					</div>
				{/each}
			</div>
		</div>

		{#if stats.categoryGroups && stats.categoryGroups.length > 0}
			<div class="space-y-4">
				<h3 class="text-lg font-semibold">{$t('reviews.summary.category_averages')}</h3>
				{#each stats.categoryGroups as group (group.id)}
					<div class="space-y-3">
						{#if group.heading}
							<p class="text-base-content/70 text-sm font-semibold">{group.heading}</p>
						{/if}
						<div class="grid gap-3 md:grid-cols-2">
							{#each group.categories as category (category.id)}
								<div class="bg-base-200/60 rounded-xl p-3">
									<div class="mb-2 flex items-center justify-between gap-2">
										<div>
											<p class="font-medium">{category.label}</p>
											{#if category.description}
												<p class="text-base-content/60 text-xs">{category.description}</p>
											{/if}
										</div>
										<span class="font-semibold">{category.value.toFixed(1)}</span>
									</div>
									<div class="bg-base-300 h-2 overflow-hidden rounded-full">
										<div
											class="bg-primary h-full rounded-full"
											style={`width: ${(category.value / 5) * 100}%`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
