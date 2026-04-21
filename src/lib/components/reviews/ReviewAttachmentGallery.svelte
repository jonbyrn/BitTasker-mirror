<script lang="ts">
	import { t } from 'svelte-i18n';
	import Gallery from '$lib/components/Gallery.svelte';
	import { attachmentImages, attachmentVideos } from './reviewDisplay';
	import type { ReviewAttachment } from './reviewTypes';

	let {
		attachments = [],
		galleryID = 'review-attachments',
		thumbnailSize = 'h-24 w-24',
		context = 'review'
	} = $props<{
		attachments?: ReviewAttachment[];
		galleryID?: string;
		thumbnailSize?: string;
		context?: 'review' | 'reply';
	}>();

	function getAttachmentAltKey(type: ReviewAttachment['type']) {
		if (context === 'reply') {
			return type === 'video'
				? 'reviews.attachments.reply_video_alt'
				: 'reviews.attachments.reply_image_alt';
		}

		return type === 'video'
			? 'reviews.attachments.review_video_alt'
			: 'reviews.attachments.review_image_alt';
	}

	const images = $derived(
		attachmentImages(attachments).map((attachment) => ({
			url: attachment.largeURL || attachment.url,
			thumbnailURL: attachment.thumbnailURL || attachment.url,
			width: attachment.width || 960,
			height: attachment.height || 720,
			alt: attachment.alt || $t(getAttachmentAltKey('image'))
		}))
	);
	const videos = $derived(attachmentVideos(attachments));
</script>

{#if images.length > 0 || videos.length > 0}
	<div class="space-y-3">
		{#if images.length > 0}
			<Gallery {galleryID} {images} {thumbnailSize} />
		{/if}

		{#if videos.length > 0}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each videos as video (video.url)}
					<div class="card bg-base-200 border-base-300 border shadow-sm">
						<div class="card-body p-3">
							<video
								class="max-h-56 w-full rounded-xl object-cover"
								src={video.url}
								controls
								playsinline
								preload="metadata"
							>
								<track
									kind="captions"
									label={video.alt || $t(getAttachmentAltKey('video'))}
									srclang="en"
								/>
							</video>
							<p class="text-base-content/60 truncate text-xs">
								{video.alt || $t(getAttachmentAltKey('video'))}
							</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
