<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ReviewStats } from '$lib/types/review';
	import { getRatingPercentage } from '$lib/utils/review-aggregation';

	let { 
		stats,
		revieweeRole 
	} = $props<{
		stats: ReviewStats;
		revieweeRole?: 'tasker' | 'taskee' | null;
	}>();

	function getRatingColor(rating: number): string {
		if (rating >= 4.5) return 'text-success';
		if (rating >= 3.5) return 'text-warning';
		return 'text-error';
	}

</script>

<div class="card bg-base-100 shadow-xl border border-base-300">
	<div class="card-body">
		<h2 class="card-title mb-4">{$t('reviews.summary.title')}</h2>

		<!-- Quick Stats -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
			<div class="stat bg-base-200 rounded-lg p-4">
				<div class="stat-title text-sm">{$t('reviews.summary.average_rating')}</div>
				<div class="stat-value text-3xl {getRatingColor(stats.averageRating)}">
					{stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '0.0'}
				</div>
				<div class="stat-desc flex items-center gap-0.5 mt-1">
					{#each Array(5) as _, i}
						<svg
							class="w-3 h-3 {i < Math.round(stats.averageRating)
								? 'text-warning fill-warning'
								: 'text-base-content/20'}"
							fill="currentColor"
							viewBox="0 0 20 20"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
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
									class="h-full bg-warning transition-all duration-300"
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

		<!-- Category Averages - Role-Specific -->
		<div>
			<h3 class="text-lg font-semibold mb-3">{$t('reviews.summary.category_averages')}</h3>
			<div class="space-y-3">
				{#if revieweeRole === 'taskee' && stats.averageWorkQuality !== undefined}
					<!-- Taskee Categories -->
					<div>
						<div class="flex justify-between items-center mb-1">
							<span class="text-sm font-medium">{$t('reviews.form.work_quality')}</span>
							<span class="text-sm font-semibold">{stats.averageWorkQuality.toFixed(1)}/5</span>
						</div>
						<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
							<div
								class="h-full bg-success transition-all duration-300"
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
								class="h-full bg-success transition-all duration-300"
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
								class="h-full bg-success transition-all duration-300"
								style="width: {(stats.averageDeliverySpeed! / 5) * 100}%"
							></div>
						</div>
					</div>
				{:else if revieweeRole === 'tasker' && stats.averageCommunication !== undefined}
					<!-- Tasker Categories -->
					<div>
						<div class="flex justify-between items-center mb-1">
							<span class="text-sm font-medium">{$t('reviews.form.communication')}</span>
							<span class="text-sm font-semibold">{stats.averageCommunication.toFixed(1)}/5</span>
						</div>
						<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
							<div
								class="h-full bg-success transition-all duration-300"
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
								class="h-full bg-success transition-all duration-300"
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
								class="h-full bg-success transition-all duration-300"
								style="width: {(stats.averagePaymentTimeliness! / 5) * 100}%"
							></div>
						</div>
					</div>
				{:else}
					<!-- Legacy Categories -->
					<div>
						<div class="flex justify-between items-center mb-1">
							<span class="text-sm font-medium">{$t('reviews.form.quality')}</span>
							<span class="text-sm font-semibold">{stats.averageQuality.toFixed(1)}/5</span>
						</div>
						<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
							<div
								class="h-full bg-success transition-all duration-300"
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
								class="h-full bg-success transition-all duration-300"
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
				{/if}
			</div>
		</div>
	</div>
</div>


