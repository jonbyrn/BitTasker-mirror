<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ReviewStats } from '$lib/types/review';
	import { getRatingPercentage } from '$lib/utils/review-aggregation';
	import { getRatingColor } from '$lib/utils/review-display';
	import StarRating from '$lib/components/reviews/StarRating.svelte';

	let { stats } = $props<{
		stats: ReviewStats;
	}>();
</script>

<div class="card bg-base-100 shadow-xl border border-base-300">
	<div class="card-body">
		<!-- Quick Stats -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
			<div class="stat bg-base-200 rounded-lg p-4">
				<div class="stat-title text-sm">{$t('reviews.summary.average_rating')}</div>
				<div class="stat-value text-3xl {getRatingColor(stats.averageRating, stats.totalReviews)}">
					{stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '0.0'}
				</div>
				<div class="stat-desc flex items-center gap-0.5 mt-1">
					<StarRating value={stats.averageRating} size="sm" unfilledClass="text-base-content/20" />
				</div>
			</div>

			<div class="stat bg-base-200 rounded-lg p-4">
				<div class="stat-title text-sm">{$t('reviews.summary.total_reviews')}</div>
				<div class="stat-value text-3xl">{stats.totalReviews}</div>
				<div class="stat-desc text-base-content/70">
					{$t('reviews.summary.reviews_received')}
				</div>
			</div>

			<div class="stat bg-base-200 rounded-lg p-4">
				<div class="stat-title text-sm">{$t('reviews.summary.recent_reviews')}</div>
				<div class="stat-value text-3xl">{stats.totalReviews}</div>
				<div class="stat-desc text-base-content/70">
					{$t('reviews.summary.last_30_days')}
				</div>
			</div>
		</div>

		<!-- Rating Distribution -->
		<div class="mb-6">
			<h3 class="text-lg font-semibold mb-3">{$t('reviews.summary.rating_distribution')}</h3>
			<div class="space-y-2">
				{#each [5, 4, 3, 2, 1] as rating}
					{@const percentage = getRatingPercentage(stats, rating as 1 | 2 | 3 | 4 | 5)}
					<div class="flex items-center gap-3">
						<div class="w-12 text-sm font-medium">{rating}★</div>
						<div class="flex-1">
							<div class="w-full bg-base-200 rounded-full h-4 overflow-hidden">
								<div
									class="h-full bg-primary transition-all duration-300"
									style="width: {percentage}%"
								></div>
							</div>
						</div>
						<div class="w-16 text-right text-sm text-base-content/70">
							{percentage.toFixed(0)}%
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Category Averages - Role-Specific (show As Taskee and/or As Tasker when present) -->
		<div>
			<h3 class="text-lg font-semibold mb-3">{$t('reviews.summary.category_averages')}</h3>
			<div class="space-y-6">
				<!-- As Taskee: show when user has reviews as Taskee (freelancer) -->
				{#if stats.averageWorkQuality !== undefined}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-base font-medium text-base-content">{$t('reviews.summary.as_taskee')}</span>
							{#if stats.taskeeReviewCount !== undefined && stats.taskeeReviewCount > 0}
								<span class="text-sm text-base-content/60">
									{$t('reviews.summary.reviews_count', { values: { count: stats.taskeeReviewCount } })}
								</span>
							{/if}
						</div>
						<div class="space-y-3">
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm font-medium">{$t('reviews.form.work_quality')}</span>
									<span class="text-sm font-semibold">{stats.averageWorkQuality.toFixed(1)}/5</span>
								</div>
								<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										style="width: {(stats.averageWorkQuality / 5) * 100}%"
									></div>
								</div>
							</div>
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm font-medium">{$t('reviews.form.experience')}</span>
									<span class="text-sm font-semibold">{stats.averageExperience!.toFixed(1)}/5</span>
								</div>
								<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										style="width: {(stats.averageExperience! / 5) * 100}%"
									></div>
								</div>
							</div>
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm font-medium">{$t('reviews.form.delivery_speed')}</span>
									<span class="text-sm font-semibold">{stats.averageDeliverySpeed!.toFixed(1)}/5</span>
								</div>
								<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										style="width: {(stats.averageDeliverySpeed! / 5) * 100}%"
									></div>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- As Tasker: show when user has reviews as Tasker (client) -->
				{#if stats.averageCommunication !== undefined}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-base font-medium text-base-content">{$t('reviews.summary.as_tasker')}</span>
							{#if stats.taskerReviewCount !== undefined && stats.taskerReviewCount > 0}
								<span class="text-sm text-base-content/60">
									{$t('reviews.summary.reviews_count', { values: { count: stats.taskerReviewCount } })}
								</span>
							{/if}
						</div>
						<div class="space-y-3">
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm font-medium">{$t('reviews.form.communication')}</span>
									<span class="text-sm font-semibold">{stats.averageCommunication.toFixed(1)}/5</span>
								</div>
								<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										style="width: {(stats.averageCommunication / 5) * 100}%"
									></div>
								</div>
							</div>
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm font-medium">{$t('reviews.form.clarity')}</span>
									<span class="text-sm font-semibold">{stats.averageClarity!.toFixed(1)}/5</span>
								</div>
								<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										style="width: {(stats.averageClarity! / 5) * 100}%"
									></div>
								</div>
							</div>
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm font-medium">{$t('reviews.form.payment_timeliness')}</span>
									<span class="text-sm font-semibold">{stats.averagePaymentTimeliness!.toFixed(1)}/5</span>
								</div>
								<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										style="width: {(stats.averagePaymentTimeliness! / 5) * 100}%"
									></div>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Legacy: only when no role-specific data (old reviews without revieweeRole) -->
				{#if stats.averageWorkQuality === undefined && stats.averageCommunication === undefined}
					<div class="space-y-3">
						<div>
							<div class="flex justify-between items-center mb-1">
								<span class="text-sm font-medium">{$t('reviews.form.quality')}</span>
								<span class="text-sm font-semibold">{stats.averageQuality.toFixed(1)}/5</span>
							</div>
							<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
								<div
									class="h-full bg-primary transition-all duration-300"
									style="width: {(stats.averageQuality / 5) * 100}%"
								></div>
							</div>
						</div>
						<div>
							<div class="flex justify-between items-center mb-1">
								<span class="text-sm font-medium">{$t('reviews.form.professionalism')}</span>
								<span class="text-sm font-semibold">{stats.averageProfessionalism.toFixed(1)}/5</span>
							</div>
							<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
								<div
									class="h-full bg-primary transition-all duration-300"
									style="width: {(stats.averageProfessionalism / 5) * 100}%"
								></div>
							</div>
						</div>
						<div>
							<div class="flex justify-between items-center mb-1">
								<span class="text-sm font-medium">{$t('reviews.form.timeliness')}</span>
								<span class="text-sm font-semibold">{stats.averageTimeliness.toFixed(1)}/5</span>
							</div>
							<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
								<div
									class="h-full bg-success transition-all duration-300"
									style="width: {(stats.averageTimeliness / 5) * 100}%"
								></div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>


