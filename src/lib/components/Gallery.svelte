<script lang="ts">
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import 'photoswipe/style.css';

	const { galleryID = 'my-gallery', images = [], thumbnailSize = 'h-40 w-40' } = $props();

	let lightboxInstance: PhotoSwipeLightbox | null = $state(null);
	let initializationPending = $state(false);

	// Initialize PhotoSwipe when images or galleryID changes
	$effect(() => {
		// Access reactive values to track them - this makes the effect reactive to changes
		const currentGalleryID = galleryID;
		const currentImages = images;
		const imagesCount = currentImages?.length || 0;
		const hasImages = imagesCount > 0;

		// Only initialize if we have images
		if (hasImages && imagesCount > 0) {
			// Mark initialization as pending to prevent race conditions
			initializationPending = true;

			// Use tick to wait for DOM updates, then initialize
			tick().then(() => {
				// Check if initialization is still pending (effect hasn't been cleaned up)
				if (!initializationPending) return;

				const galleryElement = document.getElementById(currentGalleryID);
				if (galleryElement && galleryElement.children.length > 0) {
					// Destroy existing instance if it exists
					if (lightboxInstance) {
						try {
							lightboxInstance.destroy();
						} catch (error) {
							// Ignore errors when destroying
						}
						lightboxInstance = null;
					}

					// Create new PhotoSwipe instance
					try {
						const lightbox = new PhotoSwipeLightbox({
							gallery: '#' + currentGalleryID,
							children: 'a',
							mouseMovePan: true,
							initialZoomLevel: 'fit',
							secondaryZoomLevel: 1.5,
							maxZoomLevel: 1,
							pswpModule: () => import('photoswipe')
						});
						lightbox.init();
						lightboxInstance = lightbox;
						initializationPending = false;
					} catch (error) {
						console.error('Error initializing PhotoSwipe:', error);
						initializationPending = false;
					}
				} else {
					initializationPending = false;
				}
			});
		} else {
			initializationPending = false;
		}

		// Cleanup function - runs when effect re-runs or component unmounts
		return () => {
			initializationPending = false;
			if (lightboxInstance) {
				try {
					lightboxInstance.destroy();
				} catch (error) {
					// Ignore cleanup errors
				}
				lightboxInstance = null;
			}
		};
	});
</script>

{#if images && images.length > 0}
	<div class="pswp-gallery gap-3" id={galleryID}>
		{#each images as image, index}
			<a
				href={image.url || image.largeURL}
				data-pswp-width={image.width}
				data-pswp-height={image.height}
				target="_blank"
				rel="noreferrer"
				class="inline-block"
			>
				<img
					src={image.url || image.thumbnailURL}
					alt={image.alt ||
						$t('common.components.gallery.image_alt', { values: { index: index + 1 } })}
					class="cursor-pointer rounded-2xl px-2 shadow transition-transform hover:scale-105 {thumbnailSize} object-cover"
				/>
			</a>
		{/each}
	</div>
{/if}
