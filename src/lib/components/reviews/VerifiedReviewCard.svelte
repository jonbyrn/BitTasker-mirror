<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import ReviewAttachmentGallery from './ReviewAttachmentGallery.svelte';
	import ReviewReplyThread from './ReviewReplyThread.svelte';
	import {
		formatPubkey,
		formatRelativeTime,
		getReviewOutcomeLabel,
		getReviewSettlementLabel,
		getReviewSubjectLabel,
		getRatingToneClasses,
		getRoundedRating,
		pickLocalizedText
	} from './reviewDisplay';
	import type { VerifiedReviewRecord } from './reviewTypes';

	let {
		review,
		showVerificationBadge = true,
		showRevieweeContext = false,
		showReviewerContext = false,
		replyHighlighted = false,
		isHighlighted = false,
		onReply,
		onOpen
	} = $props<{
		review: VerifiedReviewRecord;
		showVerificationBadge?: boolean;
		showRevieweeContext?: boolean;
		showReviewerContext?: boolean;
		replyHighlighted?: boolean;
		isHighlighted?: boolean;
		onReply?: (reviewId: string) => void;
		onOpen?: (reviewId: string) => void;
	}>();

	const reviewText = $derived(pickLocalizedText(review.content, $locale));
	const ratingTone = $derived(getRatingToneClasses(review.overallRating));
	const roundedRating = $derived(getRoundedRating(review.overallRating));
	const verificationLabel = $derived(
		review.verificationState === 'verified'
			? $t('reviews.verified')
			: review.verificationState === 'invalid'
				? $t('reviews.unverified')
				: review.verificationState === 'pending'
					? $t('reviews.pending_verification')
					: $t('reviews.unverified')
	);
</script>

<div
	class={`card bg-base-100 scroll-mt-24 overflow-hidden border shadow-md transition-all ${
		isHighlighted
			? 'border-primary/70 ring-primary/20 shadow-lg ring-4'
			: replyHighlighted
				? 'border-secondary/70 bg-secondary/5 shadow-secondary/10 ring-secondary/15 shadow-lg ring-4'
				: 'border-base-300'
	}`}
	data-highlighted={isHighlighted}
	data-highlighted-reply={replyHighlighted}
>
	{#if isHighlighted || replyHighlighted}
		<div
			class={`flex items-center justify-between gap-3 px-5 py-3 text-sm font-medium ${
				isHighlighted
					? 'bg-primary/12 text-primary border-primary/20 border-b'
					: 'bg-secondary/12 text-secondary border-secondary/20 border-b'
			}`}
		>
			<span>
				{#if isHighlighted}
					{$t('reviews.management.highlighted')}
				{:else}
					{$t('reviews.reply.focused')}
				{/if}
			</span>
			<span class="text-xs tracking-[0.18em] uppercase">
				{#if isHighlighted}
					{$t('reviews.actions.open_review')}
				{:else}
					{$t('reviews.reply.label')}
				{/if}
			</span>
		</div>
	{/if}
	<div class="card-body gap-4 p-5">
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1 space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					{#if showVerificationBadge}
						{#if review.verificationState === 'verified'}
							<div class="badge badge-success badge-sm gap-1">{verificationLabel}</div>
						{:else if review.verificationState === 'pending'}
							<div class="badge badge-warning badge-sm gap-1">{verificationLabel}</div>
						{:else}
							<div class="badge badge-error badge-sm">{verificationLabel}</div>
						{/if}
					{/if}
					<span class="text-base-content/60 text-sm">
						{formatRelativeTime(review.createdAt, $locale)}
					</span>
				</div>

				<div class="flex flex-wrap items-center gap-2 text-xs">
					<span class="badge badge-outline">{getReviewSubjectLabel(review.subjectType, $t)}</span>
					<span class="badge badge-outline"
						>{getReviewSettlementLabel(review.settlementType, $t)}</span
					>
					<span class="badge badge-outline"
						>{getReviewOutcomeLabel(review.contractOutcome, $t)}</span
					>
				</div>
			</div>

			<div class="text-right">
				<div class={`text-xl font-bold ${ratingTone.text}`}>{review.overallRating.toFixed(1)}</div>
				<div class="mt-1 flex items-center justify-end gap-0.5">
					{#each [0, 1, 2, 3, 4] as i (i)}
						<svg
							class="h-3.5 w-3.5 {i < roundedRating
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

		{#if showReviewerContext || showRevieweeContext}
			<div class="grid gap-2 text-sm sm:grid-cols-2">
				{#if showReviewerContext}
					<div class="bg-base-200/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
						<span class="badge badge-outline">{$t('reviews.context.reviewer')}</span>
						<span class="truncate font-medium"
							>{review.reviewerLabel?.trim() || formatPubkey(review.reviewerPubkey)}</span
						>
					</div>
				{/if}
				{#if showRevieweeContext}
					<div class="bg-base-200/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
						<span class="badge badge-outline">{$t('reviews.context.reviewee')}</span>
						<span class="truncate font-medium"
							>{review.revieweeLabel?.trim() || formatPubkey(review.revieweePubkey)}</span
						>
					</div>
				{/if}
			</div>
		{/if}

		{#if review.subjectLabel}
			{#if onOpen}
				<button
					type="button"
					class={`bg-base-200/40 hover:bg-base-200/70 focus-visible:outline-primary w-full rounded-xl px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
						isHighlighted ? 'ring-primary/20 ring-2' : ''
					}`}
					onclick={() => onOpen(review.id)}
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<span class="text-base-content/60 mr-2 font-semibold"
								>{$t('reviews.context.subject')}</span
							>
							<span class="truncate">{review.subjectLabel}</span>
						</div>
						<span class="badge badge-primary badge-sm shrink-0"
							>{$t('reviews.actions.open_review')}</span
						>
					</div>
				</button>
			{:else}
				<div class="bg-base-200/40 rounded-xl px-3 py-2 text-sm">
					<span class="text-base-content/60 mr-2 font-semibold"
						>{$t('reviews.context.subject')}</span
					>
					<span>{review.subjectLabel}</span>
				</div>
			{/if}
		{/if}

		{#if reviewText}
			<p class="text-base leading-7 whitespace-pre-wrap">{reviewText}</p>
		{/if}

		{#if review.categoryScores && review.categoryScores.length > 0}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each review.categoryScores as category (category.id)}
					<div class="bg-base-200/50 rounded-xl p-3">
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="font-medium">{category.label}</p>
								{#if category.description}
									<p class="text-base-content/60 text-xs">{category.description}</p>
								{/if}
							</div>
							<span class="font-semibold">{category.value.toFixed(1)}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if review.attachments && review.attachments.length > 0}
			<ReviewAttachmentGallery
				attachments={review.attachments}
				galleryID={`review-${review.id}`}
				context="review"
			/>
		{/if}

		{#if review.reply}
			<div class="border-base-300 border-t pt-4">
				<ReviewReplyThread reply={review.reply} highlight={replyHighlighted} />
			</div>
		{/if}

		{#if onOpen || onReply}
			<div
				class="border-base-300/70 bg-base-200/25 card-actions grid grid-cols-1 gap-2 border-t px-5 py-4 sm:flex sm:justify-end"
			>
				{#if onOpen}
					<button
						class={`btn btn-md min-h-12 w-full sm:min-h-0 sm:w-auto ${isHighlighted ? 'btn-primary' : 'btn-outline'}`}
						type="button"
						onclick={() => onOpen(review.id)}
					>
						{$t('reviews.actions.open_review')}
					</button>
				{/if}
				{#if onReply}
					<button
						class={`btn btn-md min-h-12 w-full sm:min-h-0 sm:w-auto ${replyHighlighted ? 'btn-secondary' : 'btn-outline'}`}
						type="button"
						onclick={() => onReply(review.id)}
					>
						{$t('reviews.reply')}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
