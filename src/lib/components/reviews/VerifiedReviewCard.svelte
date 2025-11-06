<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatDistanceToNow } from 'date-fns';
	import type { NostrVerifiedReview } from '$lib/types/review';
	import { verifyNostrReview } from '$lib/utils/nostr-review';
	import { TranslationStore } from '$lib/stores/translation.store';

	let {
		review,
		showVerificationBadge = true,
		onReply
	} = $props<{
		review: NostrVerifiedReview;
		showVerificationBadge?: boolean;
		onReply?: (reviewId: string) => void;
	}>();

	let isVerified = $state(false);
	let isVerifying = $state(false);
	let displayComment = $state(review.content.comment || '');

	// Verify review on mount
	$effect(async () => {
		if (showVerificationBadge) {
			isVerifying = true;
			try {
				isVerified = await verifyNostrReview(review);
			} catch (error) {
				console.error('Failed to verify review:', error);
				isVerified = false;
			} finally {
				isVerifying = false;
			}
		}
	});

	// Load translation for comment if available
	$effect(async () => {
		if (review.content.comment && review.nostrEventId) {
			const translated = await TranslationStore.getDisplayText(
				review.nostrEventId,
				review.content.comment
			);
			displayComment = translated;
		}
	});

	function formatDate(timestamp: number): string {
		try {
			return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
		} catch {
			return '';
		}
	}

	function getRatingColor(rating: number): string {
		if (rating >= 4.5) return 'text-success';
		if (rating >= 3.5) return 'text-warning';
		return 'text-error';
	}

	function renderStars(rating: number): string {
		const fullStars = Math.floor(rating);
		const hasHalfStar = rating % 1 >= 0.5;
		const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
		
		return '★'.repeat(fullStars) + 
			(hasHalfStar ? '½' : '') + 
			'☆'.repeat(emptyStars);
	}
</script>

<div class="card bg-base-100 shadow-md">
	<div class="card-body p-4">
		<!-- Header -->
		<div class="flex items-start justify-between mb-2">
			<div class="flex-1">
				<div class="flex items-center gap-2 mb-1">
					{#if showVerificationBadge}
						{#if isVerifying}
							<span class="loading loading-spinner loading-xs"></span>
						{:else if isVerified}
							<div class="badge badge-success badge-sm gap-1">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								{$t('reviews.verified')}
							</div>
						{:else}
							<div class="badge badge-error badge-sm">
								{$t('reviews.unverified')}
							</div>
						{/if}
					{/if}
					<span class="text-sm text-base-content/70">{formatDate(review.createdAt)}</span>
				</div>
			</div>

			<!-- Overall Rating -->
			<div class="text-right">
				<div class="text-2xl font-bold {getRatingColor(review.content.overallRating)}">
					{review.content.overallRating.toFixed(1)}
				</div>
				<div class="text-sm text-warning">
					{renderStars(review.content.overallRating)}
				</div>
			</div>
		</div>

		<!-- Category Ratings -->
		<div class="grid grid-cols-3 gap-2 mb-3 text-sm">
			<div class="flex flex-col">
				<span class="text-base-content/70">{$t('reviews.form.quality')}</span>
				<span class="font-semibold">{review.content.categoryRatings.quality}/5</span>
			</div>
			<div class="flex flex-col">
				<span class="text-base-content/70">{$t('reviews.form.professionalism')}</span>
				<span class="font-semibold">{review.content.categoryRatings.professionalism}/5</span>
			</div>
			<div class="flex flex-col">
				<span class="text-base-content/70">{$t('reviews.form.timeliness')}</span>
				<span class="font-semibold">{review.content.categoryRatings.timeliness}/5</span>
			</div>
		</div>

		<!-- Comment -->
		{#if displayComment}
			<div class="mb-3">
				<p class="text-base-content/90 whitespace-pre-wrap">{displayComment}</p>
			</div>
		{/if}

		<!-- Photos -->
		{#if review.content.photos && review.content.photos.length > 0}
			<div class="grid grid-cols-3 gap-2 mb-3">
				{#each review.content.photos as photo}
					<img
						src={photo}
						alt="Review photo"
						class="w-full h-24 object-cover rounded-lg cursor-pointer"
						loading="lazy"
					/>
				{/each}
			</div>
		{/if}

		<!-- Actions -->
		{#if onReply}
			<div class="card-actions justify-end mt-2">
				<button
					class="btn btn-ghost btn-sm"
					onclick={() => onReply(review.nostrEventId)}
				>
					{$t('reviews.reply')}
				</button>
			</div>
		{/if}
	</div>
</div>


