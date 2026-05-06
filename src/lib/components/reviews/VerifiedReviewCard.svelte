<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import type { AttestedReview } from '$lib/types/review';
	type ReviewWithContext = AttestedReview & {
		escrowId?: string | null;
	};

	let {
		review,
		showVerificationBadge = true,
		revieweeRole,
		showRevieweeContext = false,
		onReply
	} = $props<{
		review: ReviewWithContext;
		showVerificationBadge?: boolean;
		revieweeRole?: 'tasker' | 'taskee' | null;
		showRevieweeContext?: boolean;
		onReply?: (reviewId: string) => void;
	}>();

	// Determine role from review if not provided
	const effectiveRole = $derived(revieweeRole || review.content.revieweeRole || null);
	let displayComment = $derived(review.content.comment || '');

	// Attestation reviews are inherently verified — the backend checked on-chain settlement
	const isVerified = $derived(showVerificationBadge);
	const isVerifying = $derived(false);
	const reviewContractId = $derived.by(() => {
		return typeof review.contractId === 'string' && review.contractId.length > 0
			? review.contractId
			: null;
	});

	function formatDate(timestamp: number): string {
		try {
			const diffMs = timestamp - Date.now();
			const absSeconds = Math.abs(diffMs) / 1000;
			const formatter = new Intl.RelativeTimeFormat($locale || undefined, {
				numeric: 'auto'
			});

			if (absSeconds < 60) {
				return formatter.format(Math.round(diffMs / 1000), 'second');
			}

			const absMinutes = absSeconds / 60;
			if (absMinutes < 60) {
				return formatter.format(Math.round(diffMs / (60 * 1000)), 'minute');
			}

			const absHours = absMinutes / 60;
			if (absHours < 24) {
				return formatter.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour');
			}

			const absDays = absHours / 24;
			if (absDays < 30) {
				return formatter.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day');
			}

			const absMonths = absDays / 30;
			if (absMonths < 12) {
				return formatter.format(Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)), 'month');
			}

			return formatter.format(Math.round(diffMs / (365 * 24 * 60 * 60 * 1000)), 'year');
		} catch {
			return '';
		}
	}

	function getRatingColor(rating: number): string {
		if (rating >= 4.5) return 'text-success';
		if (rating >= 3.5) return 'text-warning';
		return 'text-error';
	}

	function formatPubkey(pubkey: string): string {
		if (pubkey.length <= 18) {
			return pubkey;
		}

		return `${pubkey.slice(0, 12)}...${pubkey.slice(-6)}`;
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
							<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
							<span class="sr-only">Verifying review</span>
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
								{$t('reviews.attested')}
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
							aria-hidden="true"
						>
							<path
								d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
							/>
						</svg>
					{/each}
				</div>
			</div>
		</div>

		{#if showRevieweeContext}
			<div class="mb-3 grid gap-2 text-sm sm:grid-cols-2">
				<div class="bg-base-200/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
					<span class="badge badge-outline">{$t('reviews.pending.review_for')}</span>
					<span class="truncate font-medium">{formatPubkey(review.revieweePubkey)}</span>
				</div>
				{#if reviewContractId}
					<div class="bg-base-200/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
						<span class="badge badge-outline">{$t('reviews.pending.contract')}</span>
						<span class="truncate font-medium">{reviewContractId}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Category Ratings - Role-Specific -->
		<div class="mb-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
			{#if effectiveRole === 'taskee' && 'workQuality' in review.content.categoryRatings}
				<!-- Taskee Categories -->
				{@const taskeeRatings = review.content.categoryRatings as {
					workQuality: number;
					experience: number;
					deliverySpeed: number;
				}}
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
					<span class="text-base-content/70">{$t('reviews.form.work_quality')}</span>
					<span class="font-semibold">{taskeeRatings.workQuality}/5</span>
				</div>
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
					<span class="text-base-content/70">{$t('reviews.form.experience')}</span>
					<span class="font-semibold">{taskeeRatings.experience}/5</span>
				</div>
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
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
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
					<span class="text-base-content/70">{$t('reviews.form.communication')}</span>
					<span class="font-semibold">{taskerRatings.communication}/5</span>
				</div>
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
					<span class="text-base-content/70">{$t('reviews.form.clarity')}</span>
					<span class="font-semibold">{taskerRatings.clarity}/5</span>
				</div>
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
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
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
					<span class="text-base-content/70">{$t('reviews.form.quality')}</span>
					<span class="font-semibold">{legacyRatings.quality}/5</span>
				</div>
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
					<span class="text-base-content/70">{$t('reviews.form.professionalism')}</span>
					<span class="font-semibold">{legacyRatings.professionalism}/5</span>
				</div>
				<div class="bg-base-200/50 flex min-w-0 flex-col gap-1 rounded-lg p-3">
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
			<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each review.content.photos as photo, index (photo)}
					<img
						src={photo}
						alt={$t('reviews.photo_alt', { values: { index: index + 1 } })}
						class="h-24 w-full rounded-lg object-cover"
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
					onclick={(event) => {
						event.stopPropagation();
						onReply(review.attestationEventId);
					}}
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
