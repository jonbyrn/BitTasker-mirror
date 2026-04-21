<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import ReviewAttachmentGallery from '$lib/components/reviews/ReviewAttachmentGallery.svelte';
	import { formatRelativeTime, formatPubkey, pickLocalizedText } from './reviewDisplay';
	import type { ReviewReplyRecord } from './reviewTypes';

	let {
		reply,
		showAuthor = true,
		highlight = false
	} = $props<{
		reply: ReviewReplyRecord;
		showAuthor?: boolean;
		highlight?: boolean;
	}>();

	const replyText = $derived(pickLocalizedText(reply.content, $locale));
</script>

<div
	class={`rounded-2xl border ${
		highlight
			? 'border-secondary/70 bg-secondary/15 ring-secondary/20 shadow-sm ring-4'
			: 'border-base-300 bg-base-200/40'
	}`}
>
	<div class="space-y-3 p-4">
		{#if highlight}
			<div
				class="text-secondary border-secondary/20 bg-base-100/70 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-semibold tracking-[0.18em] uppercase"
			>
				<span>{$t('reviews.reply.focused')}</span>
				<span>{$t('reviews.reply.label')}</span>
			</div>
		{/if}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="min-w-0">
				<p class="text-base-content/60 text-xs tracking-[0.18em] uppercase">
					{$t('reviews.reply.label')}
				</p>
				{#if showAuthor}
					<p class="truncate text-sm font-medium">
						{reply.revieweeLabel?.trim() || formatPubkey(reply.revieweePubkey)}
					</p>
				{/if}
			</div>
			<span class="text-base-content/50 text-xs">
				{formatRelativeTime(reply.createdAt, $locale)}
			</span>
		</div>

		{#if replyText}
			<p class="text-sm leading-6 whitespace-pre-wrap">{replyText}</p>
		{/if}

		{#if reply.attachments && reply.attachments.length > 0}
			<ReviewAttachmentGallery
				attachments={reply.attachments}
				galleryID={`reply-${reply.id}`}
				thumbnailSize="h-20 w-20"
				context="reply"
			/>
		{/if}
	</div>
</div>
