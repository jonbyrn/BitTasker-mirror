<script lang="ts">
	import Gallery from '$lib/components/Gallery.svelte';
	import type { ReviewAttachment } from '$lib/reviews';

	let {
		attachments = [],
		galleryID = 'review-attachments-gallery',
		thumbnailSize = 'h-28 w-28'
	} = $props<{
		attachments?: ReviewAttachment[];
		galleryID?: string;
		thumbnailSize?: string;
	}>();

	const imageAttachments = $derived(
		attachments.filter((attachment) => attachment.type === 'image')
	);
	const videoAttachments = $derived(
		attachments.filter((attachment) => attachment.type === 'video')
	);

	const galleryImages = $derived(
		imageAttachments.map((attachment, index) => ({
			url: attachment.url,
			largeURL: attachment.url,
			thumbnailURL: attachment.url,
			alt: attachment.alt,
			width: attachment.width ?? 1200,
			height: attachment.height ?? 900,
			size: attachment.size,
			index
		}))
	);
</script>

<div class="space-y-3">
	{#if galleryImages.length > 0}
		<Gallery images={galleryImages} {galleryID} {thumbnailSize} />
	{/if}

	{#if videoAttachments.length > 0}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each videoAttachments as attachment, index (attachment.url)}
				<figure class="bg-base-200 overflow-hidden rounded-2xl">
					<video src={attachment.url} class="h-44 w-full object-cover" controls playsinline />
					<figcaption class="text-base-content/70 px-3 py-2 text-xs">
						Video {index + 1}
					</figcaption>
				</figure>
			{/each}
		</div>
	{/if}
</div>
