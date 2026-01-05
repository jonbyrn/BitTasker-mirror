<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatDistanceToNow } from 'date-fns';
	import type { NostrVerifiedReview } from '$lib/types/review';
	import { verifyNostrReview } from '$lib/utils/nostr-review';
	import { TranslationStore } from '$lib/stores/translation.store';

	let {
		review,
		showVerificationBadge = true,
		revieweeRole,
		onReply
	} = $props<{
		review: NostrVerifiedReview;
		showVerificationBadge?: boolean;
		revieweeRole?: 'tasker' | 'taskee' | null;
		onReply?: (reviewId: string) => void;
	}>();

	// Determine role from review if not provided
	const effectiveRole = $derived(revieweeRole || review.content.revieweeRole || null);

	let isVerified = $state(false);
	let isVerifying = $state(false);
	let displayComment = $state(review.content.comment || '');

	// Verify review on mount
	$effect(() => {
		(async () => {
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
		})();
	});

	// Load translation for comment if available
	$effect(() => {
		(async () => {
			if (review.content.comment && review.nostrEventId) {
				const translated = await TranslationStore.getDisplayText(
					review.nostrEventId,
					review.content.comment
				);
				displayComment = translated;
			}
		})();
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

</script>

<div class="card bg-base-100 shadow-md border border-base-300">
	<div class="card-body p-5">
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
				<div class="text-xl font-bold {getRatingColor(review.content.overallRating)}">
					{review.content.overallRating.toFixed(1)}
				</div>
				<div class="flex items-center justify-end gap-0.5 mt-1">
					{#each Array(5) as _, i}
						<svg
							class="w-3.5 h-3.5 {i < Math.round(review.content.overallRating)
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
		</div>

		<!-- Category Ratings - Role-Specific -->
		<div class="grid grid-cols-3 gap-2 mb-3 text-sm">
			{#if effectiveRole === 'taskee' && 'workQuality' in review.content.categoryRatings}
				<!-- Taskee Categories -->
				{@const taskeeRatings = review.content.categoryRatings as { workQuality: number; experience: number; deliverySpeed: number }}
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.work_quality')}</span>
					<span class="font-semibold">{taskeeRatings.workQuality}/5</span>
				</div>
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.experience')}</span>
					<span class="font-semibold">{taskeeRatings.experience}/5</span>
				</div>
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.delivery_speed')}</span>
					<span class="font-semibold">{taskeeRatings.deliverySpeed}/5</span>
				</div>
			{:else if effectiveRole === 'tasker' && 'communication' in review.content.categoryRatings}
				<!-- Tasker Categories -->
				{@const taskerRatings = review.content.categoryRatings as { communication: number; clarity: number; paymentTimeliness: number }}
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.communication')}</span>
					<span class="font-semibold">{taskerRatings.communication}/5</span>
				</div>
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.clarity')}</span>
					<span class="font-semibold">{taskerRatings.clarity}/5</span>
				</div>
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.payment_timeliness')}</span>
					<span class="font-semibold">{taskerRatings.paymentTimeliness}/5</span>
				</div>
			{:else}
				<!-- Legacy Categories -->
				{@const legacyRatings = review.content.categoryRatings as { quality: number; professionalism: number; timeliness: number }}
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.quality')}</span>
					<span class="font-semibold">{legacyRatings.quality}/5</span>
				</div>
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.professionalism')}</span>
					<span class="font-semibold">{legacyRatings.professionalism}/5</span>
				</div>
				<div class="flex flex-col">
					<span class="text-base-content/70">{$t('reviews.form.timeliness')}</span>
					<span class="font-semibold">{legacyRatings.timeliness}/5</span>
				</div>
			{/if}
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
						alt=""
						class="w-full h-24 object-cover rounded-lg cursor-pointer"
						loading="lazy"
					/>
				{/each}
			</div>
		{/if}

		<!-- Actions -->
		{#if onReply}
			<div class="card-actions justify-end mt-4 pt-3 border-t border-base-300">
				<button
					class="btn btn-ghost btn-sm btn-outline"
					onclick={() => onReply(review.nostrEventId)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
					</svg>
					{$t('reviews.reply')}
				</button>
			</div>
		{/if}
	</div>
</div>


