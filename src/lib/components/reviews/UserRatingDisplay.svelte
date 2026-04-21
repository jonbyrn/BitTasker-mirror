<script lang="ts">
	import { calculateAverageRating, getRoundedRating } from './reviewDisplay';
	import type { ReviewStatsSummary } from './reviewTypes';

	let {
		stats,
		size = 'sm' as 'xs' | 'sm' | 'md' | 'lg',
		showCount = true,
		showStars = true
	} = $props<{
		stats: Pick<ReviewStatsSummary, 'averageRating' | 'totalReviews'>;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		showCount?: boolean;
		showStars?: boolean;
	}>();

	const sizeClasses = {
		xs: { star: 'h-2 w-2', text: 'text-xs' },
		sm: { star: 'h-3 w-3', text: 'text-xs' },
		md: { star: 'h-4 w-4', text: 'text-sm' },
		lg: { star: 'h-5 w-5', text: 'text-base' }
	} as const;
	const currentSizeClasses = $derived(sizeClasses[size]);
	const roundedRating = $derived(getRoundedRating(stats.averageRating));
	const ratingText = $derived(
		calculateAverageRating({
			averageRating: stats.averageRating,
			totalReviews: stats.totalReviews,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
		})
	);
</script>

{#if showStars}
	<div class="flex items-center gap-1">
		{#each [0, 1, 2, 3, 4] as i (i)}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="{currentSizeClasses.star} {i < roundedRating
					? 'text-warning fill-warning'
					: 'text-base-content/30'}"
				fill="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
				/>
			</svg>
		{/each}
		{#if showCount}
			<span class="text-base-content/60 ml-1 {currentSizeClasses.text}">
				{ratingText}
				{#if stats.totalReviews > 0}
					<span class="text-base-content/40">({stats.totalReviews})</span>
				{/if}
			</span>
		{/if}
	</div>
{:else}
	<span class="text-base-content/60 {currentSizeClasses.text}">
		{ratingText}
		{#if showCount && stats.totalReviews > 0}
			<span class="text-base-content/40">({stats.totalReviews})</span>
		{/if}
	</span>
{/if}
