<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ReviewStats } from '$lib/types/review';
	import { getRatingPercentage } from '$lib/utils/review-aggregation';

	type CategoryDescriptor = {
		id: string;
		labelKey: string;
		value: number;
	};

	type CategoryGroup = {
		id: string;
		headingKey?: string;
		categories: CategoryDescriptor[];
	};

	let { stats, revieweeRole } = $props<{
		stats: ReviewStats;
		revieweeRole?: 'tasker' | 'taskee' | null;
	}>();

	function getRatingTone(rating: number): 'success' | 'warning' | 'error' | 'neutral' {
		if (!Number.isFinite(rating) || rating <= 0) return 'neutral';
		if (rating >= 4.5) return 'success';
		if (rating >= 3.5) return 'warning';
		return 'error';
	}

	function getRatingColor(rating: number): string {
		switch (getRatingTone(rating)) {
			case 'success':
				return 'text-success';
			case 'warning':
				return 'text-warning';
			case 'error':
				return 'text-error';
			default:
				return 'text-base-content/60';
		}
	}

	function getBarColor(rating: number): string {
		switch (getRatingTone(rating)) {
			case 'success':
				return 'bg-success';
			case 'warning':
				return 'bg-warning';
			case 'error':
				return 'bg-error';
			default:
				return 'bg-base-300';
		}
	}

	const ratingSteps = [0, 1, 2, 3, 4] as const;

	const hasReviews = $derived(stats.totalReviews > 0);

	const hasTaskeeStats = $derived(
		stats.averageWorkQuality !== undefined &&
			stats.averageExperience !== undefined &&
			stats.averageDeliverySpeed !== undefined
	);

	const hasTaskerStats = $derived(
		stats.averageCommunication !== undefined &&
			stats.averageClarity !== undefined &&
			stats.averagePaymentTimeliness !== undefined
	);

	const showTaskeeStats = $derived(
		hasTaskeeStats && (revieweeRole === 'taskee' || (!revieweeRole && !hasTaskerStats))
	);

	const showTaskerStats = $derived(
		hasTaskerStats && (revieweeRole === 'tasker' || (!revieweeRole && !hasTaskeeStats))
	);

	const showMixedRoleStats = $derived(!revieweeRole && hasTaskeeStats && hasTaskerStats);

	const taskeeCategories = $derived.by<CategoryDescriptor[]>(() => {
		if (!hasTaskeeStats) {
			return [];
		}

		return [
			{
				id: 'work-quality',
				labelKey: 'reviews.form.work_quality',
				value: stats.averageWorkQuality!
			},
			{
				id: 'experience',
				labelKey: 'reviews.form.experience',
				value: stats.averageExperience!
			},
			{
				id: 'delivery-speed',
				labelKey: 'reviews.form.delivery_speed',
				value: stats.averageDeliverySpeed!
			}
		];
	});

	const taskerCategories = $derived.by<CategoryDescriptor[]>(() => {
		if (!hasTaskerStats) {
			return [];
		}

		return [
			{
				id: 'communication',
				labelKey: 'reviews.form.communication',
				value: stats.averageCommunication!
			},
			{
				id: 'clarity',
				labelKey: 'reviews.form.clarity',
				value: stats.averageClarity!
			},
			{
				id: 'payment-timeliness',
				labelKey: 'reviews.form.payment_timeliness',
				value: stats.averagePaymentTimeliness!
			}
		];
	});

	const categoryGroups = $derived.by<CategoryGroup[]>(() => {
		if (showMixedRoleStats) {
			return [
				{
					id: 'taskee',
					headingKey: 'reviews.summary.taskee_categories',
					categories: taskeeCategories
				},
				{
					id: 'tasker',
					headingKey: 'reviews.summary.tasker_categories',
					categories: taskerCategories
				}
			];
		}

		if (showTaskeeStats) {
			return [{ id: 'taskee', categories: taskeeCategories }];
		}

		if (showTaskerStats) {
			return [{ id: 'tasker', categories: taskerCategories }];
		}

		return [];
	});
</script>

<div class="card border-base-300 bg-base-100 border shadow-xl">
	<div class="card-body">
		<h2 class="card-title mb-4">{$t('reviews.summary.title')}</h2>

		{#if !hasReviews}
			<div
				class="border-base-300 bg-base-200/60 rounded-2xl border border-dashed px-6 py-10 text-center"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mx-auto mb-4 h-14 w-14"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.75"
						d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.364 1.118l1.519 4.674c.3.921-.755 1.688-1.54 1.118L12 17.77l-3.962 2.88c-.784.57-1.838-.197-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118L3.677 10.1c-.784-.57-.38-1.81.588-1.81H9.18a1 1 0 00.951-.69l.918-2.826z"
					/>
				</svg>
				<p class="text-lg font-semibold">{$t('reviews.summary.empty_title')}</p>
				<p class="text-base-content/70 mx-auto mt-2 max-w-md text-sm">
					{$t('reviews.summary.empty_description')}
				</p>
			</div>
		{:else}
			<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="stat bg-base-200 rounded-lg p-4">
					<div class="stat-title text-sm">{$t('reviews.summary.average_rating')}</div>
					<div class={`stat-value text-3xl ${getRatingColor(stats.averageRating)}`}>
						{stats.averageRating.toFixed(1)}
					</div>
					<div class="stat-desc mt-1 flex items-center gap-0.5">
						{#each ratingSteps as i (i)}
							<svg
								class={`h-3 w-3 ${
									i < Math.round(stats.averageRating)
										? 'fill-warning text-warning'
										: 'text-base-content/20'
								}`}
								fill="currentColor"
								viewBox="0 0 20 20"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
								/>
							</svg>
						{/each}
					</div>
				</div>

				<div class="stat bg-base-200 rounded-lg p-4">
					<div class="stat-title text-sm">{$t('reviews.summary.total_reviews')}</div>
					<div class="stat-value text-3xl">{stats.totalReviews}</div>
					<div class="stat-desc text-base-content/70">
						{$t('reviews.summary.reviews_received')}
					</div>
				</div>
			</div>

			<div class="mb-6">
				<h3 class="mb-3 text-lg font-semibold">{$t('reviews.summary.rating_distribution')}</h3>
				<div class="space-y-2">
					{#each [5, 4, 3, 2, 1] as rating (rating)}
						{@const percentage = getRatingPercentage(stats, rating as 1 | 2 | 3 | 4 | 5)}
						<div class="flex items-center gap-3">
							<div class="w-12 text-sm font-medium">{rating}★</div>
							<div class="flex-1">
								<div class="bg-base-200 h-4 w-full overflow-hidden rounded-full">
									<div
										class={`h-full transition-all duration-300 ${getBarColor(rating)}`}
										data-testid={`distribution-bar-${rating}`}
										data-tone={getRatingTone(rating)}
										style={`width: ${percentage}%`}
									></div>
								</div>
							</div>
							<div class="text-base-content/70 w-16 text-right text-sm">
								{percentage.toFixed(0)}%
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div>
				<h3 class="mb-3 text-lg font-semibold">{$t('reviews.summary.category_averages')}</h3>
				{#if categoryGroups.length === 0}
					<div
						class="border-base-300 bg-base-200/60 text-base-content/70 rounded-xl border px-4 py-4 text-sm"
					>
						{$t('reviews.summary.category_unavailable')}
					</div>
				{:else}
					<div class="space-y-4">
						{#each categoryGroups as group (group.id)}
							<div class="space-y-3">
								{#if group.headingKey}
									<p class="text-base-content/70 text-sm font-semibold">
										{$t(group.headingKey)}
									</p>
								{/if}

								{#each group.categories as category (category.id)}
									<div>
										<div class="mb-1 flex items-center justify-between gap-3">
											<span class="text-sm font-medium">{$t(category.labelKey)}</span>
											<span class={`text-sm font-semibold ${getRatingColor(category.value)}`}>
												{category.value.toFixed(1)}/5
											</span>
										</div>
										<div class="bg-base-200 h-3 w-full overflow-hidden rounded-full">
											<div
												class={`h-full transition-all duration-300 ${getBarColor(category.value)}`}
												data-testid={`category-bar-${category.id}`}
												data-tone={getRatingTone(category.value)}
												style={`width: ${(category.value / 5) * 100}%`}
											></div>
										</div>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
