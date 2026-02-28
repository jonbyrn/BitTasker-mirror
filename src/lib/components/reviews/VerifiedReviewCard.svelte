<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatDistanceToNow } from 'date-fns';
	import type { NostrVerifiedReview } from '$lib/types/review';
	import { TranslationStore } from '$lib/stores/translation.store';
	import { getRatingColor } from '$lib/utils/review-display';
	import StarRating from '$lib/components/reviews/StarRating.svelte';

	let {
		review,
		showVerificationBadge = false,
		revieweeRole,
		onReply
	} = $props<{
		review: NostrVerifiedReview;
		showVerificationBadge?: boolean;
		revieweeRole?: 'tasker' | 'taskee' | null;
		onReply?: (reviewId: string) => void;
	}>();

	const effectiveRole = $derived(revieweeRole || review.content.revieweeRole || null);

	let translatedComment = $state<string | null>(null);
	const displayComment = $derived(
		translatedComment !== null ? translatedComment : (review.content.comment || '')
	);

	// Load translation for comment when review has comment and event id
	$effect(() => {
		const eventId = review.nostrEventId;
		const comment = review.content.comment;
		translatedComment = null;
		if (comment && eventId) {
			translatedComment = TranslationStore.getDisplayText(eventId, comment);
		}
	});

	function formatDate(timestamp: number): string {
		try {
			return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
		} catch {
			return '';
		}
	}

</script>

<div class="card bg-base-100 shadow-md border border-base-300">
	<div class="card-body p-5">
		<!-- Header -->
		<div class="flex items-start justify-between mb-2">
			<div class="flex-1">
				<div class="flex items-center gap-2 mb-1">
					<span class="text-sm text-base-content/70">{formatDate(review.createdAt)}</span>
				</div>
			</div>

			<!-- Overall Rating -->
			<div class="text-right flex flex-col items-end">
				<div class="text-xl font-bold {getRatingColor(review.content.overallRating)}">
					{review.content.overallRating.toFixed(1)}
				</div>
				<div class="mt-1">
					<StarRating
						value={review.content.overallRating}
						size="sm"
						unfilledClass="text-base-content/20"
						class="justify-end"
					/>
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


