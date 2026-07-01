<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import type { AttestedReview } from '$lib/types/review';
	import { fetchContractProfile } from '$lib/nostr/profile';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconStar from '~icons/mdi/star';
	import IconReply from '~icons/mdi/reply';
	import { createDebug } from '$lib/utils/debug';

	const d = createDebug('reviews:card');

	type ReviewWithContext = AttestedReview & {
		escrowId?: string | null;
		contractTitle?: string | null;
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

	// Profile name fetching for reviewee
	let revieweeName = $state<string | null>(null);
	let isLoadingProfile = $state(false);

	onMount(async () => {
		if (showRevieweeContext && review.revieweePubkey) {
			isLoadingProfile = true;
			try {
				const profile = await fetchContractProfile(review.revieweePubkey);
				revieweeName = profile.name || null;
			} catch (error) {
				d.error('Failed to fetch reviewee profile:', error);
			} finally {
				isLoadingProfile = false;
			}
		}
	});

	// Display name: prefer fetched name, fall back to formatted pubkey
	const displayName = $derived.by(() => {
		if (revieweeName) return revieweeName;
		return formatPubkey(review.revieweePubkey);
	});

	function formatDate(timestamp: number): string {
		try {
			const diffMs = timestamp - Date.now();
			const absSeconds = Math.abs(diffMs) / 1000;
			const formatter = new Intl.RelativeTimeFormat($locale || undefined, { numeric: 'auto' });

			if (absSeconds < 60) return formatter.format(Math.round(diffMs / 1000), 'second');
			const absMinutes = absSeconds / 60;
			if (absMinutes < 60) return formatter.format(Math.round(diffMs / (60 * 1000)), 'minute');
			const absHours = absMinutes / 60;
			if (absHours < 24) return formatter.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour');
			const absDays = absHours / 24;
			if (absDays < 30) return formatter.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day');
			const absMonths = absDays / 30;
			if (absMonths < 12)
				return formatter.format(Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)), 'month');
			return formatter.format(Math.round(diffMs / (365 * 24 * 60 * 60 * 1000)), 'year');
		} catch {
			return '';
		}
	}

	function getRatingColor(rating: number): string {
		if (rating >= 4.5) return 'text-success';
		if (rating >= 3.5) return 'text-primary';
		return 'text-error';
	}

	function formatPubkey(pubkey: string): string {
		if (pubkey.length <= 18) {
			return pubkey;
		}

		return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
	}

	const roleLabel = $derived.by(() => {
		if (effectiveRole === 'taskee') return $t('notifications.roles.taskee');
		if (effectiveRole === 'tasker') return $t('notifications.roles.tasker');
		return '';
	});
</script>

<div class="card bg-base-100 border-base-300 border shadow-md">
	<div class="card-body p-5">
		<!-- Header -->
		<div class="mb-2 flex items-start justify-between">
			<div class="flex-1">
				<div class="mb-1">
					<span class="text-base-content/70 text-sm">{formatDate(review.createdAt)}</span>
					{#if showVerificationBadge}
						<div class="mt-1">
							{#if isVerifying}
								<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
								<span class="sr-only">Verifying review</span>
							{:else if isVerified}
								<div class="badge badge-success badge-sm gap-1">
									<IconCheckCircle class="h-3 w-3" />
									{$t('reviews.verified')}
								</div>
							{:else}
								<div class="badge badge-error badge-sm">
									{$t('reviews.unverified')}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Overall Rating -->
			<div class="text-right">
				<div class="text-xl font-bold {getRatingColor(review.content.overallRating)}">
					{review.content.overallRating.toFixed(1)}
				</div>
				<div class="mt-1 flex items-center justify-end gap-0.5">
					{#each [0, 1, 2, 3, 4] as i (i)}
						<IconStar
							class="h-3.5 w-3.5 {i < Math.round(review.content.overallRating)
								? 'text-primary'
								: 'text-base-content/20'}"
						/>
					{/each}
				</div>
			</div>
		</div>

		{#if showRevieweeContext}
			<div class="border-base-300 mb-4 border-b pb-3">
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span class="text-base-content/70">{$t('reviews.pending.review_for')}</span>
					{#if isLoadingProfile}
						<span class="loading loading-dots loading-xs"></span>
					{:else}
						<span class="font-semibold">{displayName}</span>
					{/if}
					{#if roleLabel}
						<span class="badge badge-sm badge-ghost">{roleLabel}</span>
					{/if}
				</div>
				{#if review.contractTitle}
					<div class="text-base-content/70 mt-1 text-sm">
						<span class="text-base-content font-medium">{review.contractTitle}</span>
					</div>
				{:else if reviewContractId}
					<div class="text-base-content/60 mt-1 text-xs">
						{$t('reviews.pending.contract')}: {reviewContractId}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Category Ratings - Role-Specific -->
		<div class="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
			{#if effectiveRole === 'taskee' && 'workQuality' in review.content.categoryRatings}
				<!-- Taskee Categories -->
				{@const taskeeRatings = review.content.categoryRatings as {
					workQuality: number;
					experience: number;
					deliverySpeed: number;
				}}
				{@const categories = [
					{ label: $t('reviews.form.work_quality'), value: taskeeRatings.workQuality },
					{ label: $t('reviews.form.experience'), value: taskeeRatings.experience },
					{ label: $t('reviews.form.delivery_speed'), value: taskeeRatings.deliverySpeed }
				]}
				{#each categories as category (category.label)}
					<div class="bg-base-200/50 flex items-center justify-between rounded-lg px-3 py-2">
						<span class="text-base-content/70 text-xs">{category.label}</span>
						<div class="flex items-center gap-1">
							{#each [1, 2, 3, 4, 5] as star (star)}
								<IconStar
									class="h-3 w-3 {star <= Math.round(category.value)
										? 'text-primary'
										: 'text-base-content/20'}"
								/>
							{/each}
						</div>
					</div>
				{/each}
			{:else if effectiveRole === 'tasker' && 'communication' in review.content.categoryRatings}
				<!-- Tasker Categories -->
				{@const taskerRatings = review.content.categoryRatings as {
					communication: number;
					clarity: number;
					paymentTimeliness: number;
				}}
				{@const categories = [
					{ label: $t('reviews.form.communication'), value: taskerRatings.communication },
					{ label: $t('reviews.form.clarity'), value: taskerRatings.clarity },
					{ label: $t('reviews.form.payment_timeliness'), value: taskerRatings.paymentTimeliness }
				]}
				{#each categories as category (category.label)}
					<div class="bg-base-200/50 flex items-center justify-between rounded-lg px-3 py-2">
						<span class="text-base-content/70 text-xs">{category.label}</span>
						<div class="flex items-center gap-1">
							{#each [1, 2, 3, 4, 5] as star (star)}
								<IconStar
									class="h-3 w-3 {star <= Math.round(category.value)
										? 'text-primary'
										: 'text-base-content/20'}"
								/>
							{/each}
						</div>
					</div>
				{/each}
			{:else}
				<!-- Legacy Categories -->
				{@const legacyRatings = review.content.categoryRatings as {
					quality: number;
					professionalism: number;
					timeliness: number;
				}}
				{@const categories = [
					{ label: $t('reviews.form.quality'), value: legacyRatings.quality },
					{ label: $t('reviews.form.professionalism'), value: legacyRatings.professionalism },
					{ label: $t('reviews.form.timeliness'), value: legacyRatings.timeliness }
				]}
				{#each categories as category (category.label)}
					<div class="bg-base-200/50 flex items-center justify-between rounded-lg px-3 py-2">
						<span class="text-base-content/70 text-xs">{category.label}</span>
						<div class="flex items-center gap-1">
							{#each [1, 2, 3, 4, 5] as star (star)}
								<IconStar
									class="h-3 w-3 {star <= Math.round(category.value)
										? 'text-primary'
										: 'text-base-content/20'}"
								/>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Comment -->
		{#if displayComment}
			<div class="bg-base-200/30 mb-4 rounded-lg p-3">
				<p class="text-base-content text-sm leading-relaxed whitespace-pre-wrap">
					{displayComment}
				</p>
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
					<IconReply class="mr-1 h-4 w-4" />
					{$t('reviews.reply')}
				</button>
			</div>
		{/if}
	</div>
</div>
