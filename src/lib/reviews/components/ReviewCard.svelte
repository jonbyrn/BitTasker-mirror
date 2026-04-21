<script lang="ts">
	import type { ReviewEventRecord } from '$lib/reviews';
	import { selectReviewLocaleContent } from '$lib/reviews';
	import { locale, t } from 'svelte-i18n';
	import {
		getReviewSettlementLabel,
		getReviewSubjectLabel
	} from '$lib/components/reviews/reviewDisplay';
	import ReviewAttachmentGallery from './ReviewAttachmentGallery.svelte';
	import ReviewReplyThread from './ReviewReplyThread.svelte';
	import ReviewStatusBadge from './ReviewStatusBadge.svelte';

	let {
		review,
		isHighlighted = false,
		onReply = () => {},
		showReplyAction = true
	} = $props<{
		review: ReviewEventRecord;
		isHighlighted?: boolean;
		onReply?: (reviewEventId: string) => void;
		showReplyAction?: boolean;
	}>();

	const localizedContent = $derived.by(() =>
		selectReviewLocaleContent(review.content, $locale || 'en')
	);
</script>

<article
	id={`review-${review.reviewEventId}`}
	class={`card bg-base-100 border-base-300 shadow-sm ${isHighlighted ? 'border-primary border-2' : 'border'}`}
>
	<div class="card-body gap-4 p-5">
		<div class="flex items-start justify-between gap-4">
			<div class="space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					<ReviewStatusBadge
						outcome={review.contractOutcome}
						state={review.attestation ? 'submitted' : 'available'}
					/>
					<div class="badge badge-outline badge-sm">
						{getReviewSubjectLabel(review.subjectType, $t)}
					</div>
					<div class="badge badge-outline badge-sm">
						{getReviewSettlementLabel(review.settlementType, $t)}
					</div>
				</div>
				<div class="text-base-content/60 text-xs">
					{review.reviewerPubkey.slice(0, 12)}… -> {review.revieweePubkey.slice(0, 12)}…
				</div>
			</div>
			<div class="text-right">
				<div class="text-xl font-bold">{review.rating.toFixed(1)}</div>
				<div class="text-base-content/60 text-xs">
					{new Date(review.createdAt * 1000).toLocaleString()}
				</div>
			</div>
		</div>

		{#if review.sourcePresentation?.label || review.sourceVisibility}
			<div class="bg-base-200/60 rounded-2xl px-3 py-2 text-sm">
				<div class="text-base-content/60 text-xs tracking-wide uppercase">
					{$t('reviews.source.label')}
				</div>
				{#if review.sourcePresentation?.href && review.sourceVisibility !== 'public_deleted'}
					<a href={review.sourcePresentation.href} class="link link-primary font-medium">
						{review.sourcePresentation.label ?? $t('reviews.source.open')}
					</a>
				{:else if review.sourcePresentation?.label}
					<div class="font-medium">{review.sourcePresentation.label}</div>
				{/if}
				{#if review.sourceVisibility === 'public_deleted'}
					<div class="text-base-content/60 mt-1 text-xs">
						{$t('reviews.source.removed')}
					</div>
				{:else if review.sourceVisibility === 'public_unknown'}
					<div class="text-base-content/60 mt-1 text-xs">{$t('reviews.source.unavailable')}</div>
				{/if}
			</div>
		{/if}

		<div class="space-y-2">
			{#if localizedContent.title}
				<h3 class="text-lg font-semibold">{localizedContent.title}</h3>
			{/if}
			<p class="text-base-content/90 whitespace-pre-wrap">{localizedContent.comment}</p>
		</div>

		{#if review.attachments.length > 0}
			<ReviewAttachmentGallery
				attachments={review.attachments}
				galleryID={`review-gallery-${review.reviewEventId}`}
			/>
		{/if}

		<ReviewReplyThread {review} reply={review.reply} {onReply} {showReplyAction} />
	</div>
</article>
