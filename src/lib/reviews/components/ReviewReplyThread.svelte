<script lang="ts">
	import { locale } from 'svelte-i18n';
	import { t } from 'svelte-i18n';
	import type { ReviewEventRecord, ReviewReplyPayload } from '$lib/reviews';
	import { selectReviewLocaleContent } from '$lib/reviews';
	import ReviewAttachmentGallery from './ReviewAttachmentGallery.svelte';

	let {
		review,
		reply = null,
		onReply = () => {},
		showReplyAction = true
	} = $props<{
		review: ReviewEventRecord;
		reply?: ReviewReplyPayload | null;
		onReply?: (reviewEventId: string) => void;
		showReplyAction?: boolean;
	}>();

	const replyContent = $derived.by(() => {
		if (!reply) return null;
		return selectReviewLocaleContent(reply.content, $locale || 'en');
	});
</script>

<div class="border-base-300 mt-4 border-t pt-4">
	{#if reply}
		<div class="bg-base-200 rounded-2xl p-4">
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="text-sm font-semibold">{$t('reviews.reply.label')}</div>
				<div class="text-base-content/60 text-xs">
					{new Date(reply.createdAt * 1000).toLocaleString()}
				</div>
			</div>
			{#if replyContent?.title}
				<div class="mb-1 font-medium">{replyContent.title}</div>
			{/if}
			<p class="text-base-content/90 whitespace-pre-wrap">{replyContent?.comment}</p>
			{#if reply.attachments.length > 0}
				<div class="mt-3">
					<ReviewAttachmentGallery
						attachments={reply.attachments}
						galleryID={`reply-${reply.parentReviewEventId}`}
					/>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex items-center justify-between gap-3">
			<div class="text-base-content/70 text-sm">{$t('reviews.reply.none')}</div>
			{#if showReplyAction}
				<button class="btn btn-outline btn-sm" onclick={() => onReply(review.reviewEventId)}>
					{$t('reviews.reply.action')}
				</button>
			{/if}
		</div>
	{/if}
</div>
