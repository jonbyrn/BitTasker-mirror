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
	let displayComment = $state('');

	// Verify review on mount
	$effect(() => {
		if (!showVerificationBadge) {
			isVerifying = false;
			isVerified = false;
			return;
		}

		let cancelled = false;

		(async () => {
			isVerifying = true;
			try {
				const verified = await verifyNostrReview(review);
				if (!cancelled) {
					isVerified = verified;
				}
			} catch (error) {
				console.error('Failed to verify review:', error);
				if (!cancelled) {
					isVerified = false;
				}
			} finally {
				if (!cancelled) {
					isVerifying = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// Load translation for comment if available
	$effect(() => {
		const sourceComment = review.content.comment || '';
		displayComment = sourceComment;

		if (!sourceComment || !review.nostrEventId) {
			return;
		}

		let cancelled = false;
		const eventId = review.nostrEventId;

		(async () => {
			const translated = await TranslationStore.getDisplayText(eventId, sourceComment);
			if (!cancelled) {
				displayComment = translated;
			}
		})();

		return () => {
			cancelled = true;
		};
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

<div class="card bg-base-100 border-base-300 border shadow-md">
	<div class="card-body p-5">
		<!-- Header -->
		<div class="mb-2 flex items-start justify-between">
			<div class="flex-1">
				<div class="mb-1 flex items-center gap-2">
					{#if showVerificationBadge}
						{#if isVerifying}
							<span class="loading loading-spinner loading-xs"></span>
						{:else if isVerified}
							<div class="badge badge-success badge-sm gap-1">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3 w-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								{$t('reviews.verified')}
							</div>
						{:else}
							<div class="badge badge-error badge-sm">
								{$t('reviews.unverified')}
							</div>
						{/if}
					{/if}
					<span class="text-base-content/70 text-sm">{formatDate(review.createdAt)}</span>
				</div>
			</div>

			<!-- Overall Rating -->
			<div class="text-right">
				<div class="text-xl font-bold {getRatingColor(review.content.overallRating)}">
					{review.content.overallRating.toFixed(1)}
				</div>
				<div class="mt-1 flex items-center justify-end gap-0.5">
					{#each [0, 1, 2, 3, 4] as i (i)}
						<svg
							class="h-3.5 w-3.5 {i < Math.round(review.content.overallRating)
								? 'text-warning fill-warning'
								: 'text-base-content/20'}"
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
		</div>

		<!-- Category Ratings - Role-Specific -->
		<div class="mb-3 grid grid-cols-3 gap-2 text-sm">
			{#if effectiveRole === 'taskee' && 'workQuality' in review.content.categoryRatings}
				<!-- Taskee Categories -->
				{@const taskeeRatings = review.content.categoryRatings as {
					workQuality: number;
					experience: number;
					deliverySpeed: number;
				}}
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
				{@const taskerRatings = review.content.categoryRatings as {
					communication: number;
					clarity: number;
					paymentTimeliness: number;
				}}
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
				{@const legacyRatings = review.content.categoryRatings as {
					quality: number;
					professionalism: number;
					timeliness: number;
				}}
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
			<div class="mb-3 grid grid-cols-3 gap-2">
				{#each review.content.photos as photo (photo)}
					<img
						src={photo}
						alt=""
						class="h-24 w-full cursor-pointer rounded-lg object-cover"
						loading="lazy"
					/>
				{/each}
			</div>
		{/if}

		<!-- Actions -->
		{#if onReply}
			<div class="card-actions border-base-300 mt-4 justify-end border-t pt-3">
				<button
					class="btn btn-ghost btn-sm btn-outline"
					onclick={() => onReply(review.nostrEventId)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
						/>
					</svg>
					{$t('reviews.reply')}
				</button>
			</div>
		{/if}
	</div>
</div>
