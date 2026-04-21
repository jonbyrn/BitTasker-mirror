<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { locale, t } from 'svelte-i18n';
	import type { PendingReviewRecord } from './reviewTypes';
	import {
		formatPubkey,
		formatRelativeTime,
		getReviewSubjectLabel,
		getReviewOutcomeLabel,
		getReviewSettlementLabel
	} from './reviewDisplay';

	let {
		pendingReviews = [],
		loading = false,
		error = null,
		isCurrentUser = true,
		showCreateTaskCta = false,
		createTaskHref = resolve('/dashboard/create-task'),
		onReviewClick
	} = $props<{
		pendingReviews?: PendingReviewRecord[];
		loading?: boolean;
		error?: string | null;
		isCurrentUser?: boolean;
		showCreateTaskCta?: boolean;
		createTaskHref?: string;
		onReviewClick?: (pendingReview: PendingReviewRecord) => void;
	}>();
</script>

<div class="pending-reviews-list space-y-4">
	{#if loading}
		<div class="flex items-center justify-center py-12" role="status" aria-live="polite">
			<span class="loading loading-spinner loading-lg"></span>
			<span class="sr-only">{$t('reviews.pending.loading')}</span>
		</div>
	{:else if error}
		<div class="alert alert-outline alert-error">
			<span>{error}</span>
		</div>
	{:else if pendingReviews.length === 0}
		<div class="py-4 text-center md:py-12">
			<p class="text-base-content/70 mb-2 text-lg">{$t('reviews.pending.no_pending')}</p>
			<p class="text-base-content/50 text-sm">{$t('reviews.pending.all_caught_up')}</p>
			{#if showCreateTaskCta}
				<div class="mt-4">
					<button class="btn btn-primary btn-sm" type="button" onclick={() => goto(createTaskHref)}>
						{$t('reviews.cta.create_task')}
					</button>
				</div>
			{/if}
			{#if !isCurrentUser}
				<p class="text-base-content/40 mt-2 text-xs">{$t('reviews.pending.only_current_user')}</p>
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			{#each pendingReviews as pendingReview (pendingReview.id)}
				<div
					class="card bg-base-100 border-base-300 border shadow-sm transition-shadow hover:shadow-md"
				>
					<div class="card-body p-4">
						<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
							<button
								type="button"
								class="group hover:bg-base-200/40 focus-visible:outline-primary flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
								onclick={() => onReviewClick?.(pendingReview)}
							>
								<div
									class="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
									aria-hidden="true"
								>
									{(pendingReview.revieweeLabel || formatPubkey(pendingReview.revieweePubkey))
										.charAt(0)
										.toUpperCase()}
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-base-content/50 text-xs font-semibold tracking-[0.18em] uppercase">
										{$t('reviews.pending.review_for')}
									</p>
									<h4 class="truncate text-lg font-semibold">
										{pendingReview.revieweeLabel?.trim() ||
											formatPubkey(pendingReview.revieweePubkey)}
									</h4>
									{#if pendingReview.subjectLabel}
										<p class="text-base-content/60 mt-1 truncate text-sm">
											{pendingReview.subjectLabel}
										</p>
									{/if}
									<p class="text-base-content/60 mt-1 text-xs">
										{getReviewSubjectLabel(pendingReview.subjectType, $t)}
										<span class="mx-1">•</span>
										{getReviewOutcomeLabel(pendingReview.contractOutcome, $t)}
									</p>
									<p class="text-primary mt-2 text-sm font-semibold group-hover:underline">
										{$t('reviews.pending.review_now')}
									</p>
								</div>
							</button>

							<div
								class="text-base-content/70 flex shrink-0 flex-col items-start gap-2 text-sm md:items-end"
							>
								<div class="flex flex-wrap items-center gap-2">
									<span class="badge badge-outline badge-sm">{$t('reviews.pending.completed')}</span
									>
									<span class="font-medium">
										{getReviewSettlementLabel(pendingReview.settlementType, $t)}
									</span>
								</div>
								<p class="text-xs">
									{$t('reviews.pending.completed_on')}
									{formatRelativeTime(
										pendingReview.completedAt ?? pendingReview.createdAt,
										$locale
									)}
								</p>
							</div>
						</div>
						<div
							class="border-base-300/70 bg-base-200/25 card-actions mt-4 flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<p class="text-base-content/60 text-sm font-medium">
								{$t('reviews.pending.review_now')}
							</p>
							<button
								class="btn btn-primary btn-lg sm:btn-md w-full sm:w-auto"
								onclick={() => onReviewClick?.(pendingReview)}
							>
								{$t('reviews.pending.review_now')}
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
