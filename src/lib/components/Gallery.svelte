<script lang="ts">
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import 'photoswipe/style.css';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';

	export interface GalleryItem {
		url?: string;
		largeURL?: string;
		thumbnailURL?: string;
		alt?: string;
		width?: number;
		height?: number;
		/** MIME type, e.g. "video/mp4" or "image/jpeg" */
		type?: string;
		/** Cloudflare Stream video UID – presence implies a stream video */
		cloudflareId?: string;
	}

	const {
		galleryID = 'my-gallery',
		// Legacy prop – kept for backward compatibility with existing callers.
		// Typed as unknown[] so pre-existing callers that pass untyped arrays
		// continue to compile without changes.  New callers should prefer `items`.
		images = [],
		// New mixed prop: pass an ordered array of images AND/OR videos.
		items,
		thumbnailSize = 'h-full w-full'
	} = $props<{
		galleryID?: string;
		images?: unknown[];
		items?: GalleryItem[];
		thumbnailSize?: string;
	}>();

	// Merge legacy + new props; `items` takes precedence when provided.
	const allItems = $derived<GalleryItem[]>((items ?? (images as GalleryItem[])) as GalleryItem[]);

	function isVideoItem(item: GalleryItem): boolean {
		if (item.cloudflareId) return true;
		if (item.type && item.type.toLowerCase().startsWith('video/')) return true;
		if (item.url) {
			const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.m3u8'];
			return videoExtensions.some((ext) => (item.url ?? '').toLowerCase().endsWith(ext));
		}
		return false;
	}

	const hasImages = $derived(allItems.some((i) => !isVideoItem(i)));

	let lightboxInstance: PhotoSwipeLightbox | null = $state(null);
	let initializationPending = $state(false);

	$effect(() => {
		const currentGalleryID = galleryID;
		// Track all items so the effect re-runs when they change.
		const _items = allItems;

		if (hasImages) {
			initializationPending = true;

			tick().then(() => {
				if (!initializationPending) return;

				const galleryElement = document.getElementById(currentGalleryID);
				// Only pick up image anchors (not video divs).
				const imageLinks = galleryElement
					? galleryElement.querySelectorAll('a[data-pswp-width]')
					: null;

				if (galleryElement && imageLinks && imageLinks.length > 0) {
					if (lightboxInstance) {
						try {
							lightboxInstance.destroy();
						} catch {
							// ignore
						}
						lightboxInstance = null;
					}

					try {
						const lightbox = new PhotoSwipeLightbox({
							gallery: '#' + currentGalleryID,
							// Only treat image anchor elements as gallery items;
							// video <div>s are ignored.
							children: 'a[data-pswp-width]',
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

		return () => {
			initializationPending = false;
			if (lightboxInstance) {
				try {
					lightboxInstance.destroy();
				} catch {
					// ignore
				}
				lightboxInstance = null;
			}
		};
	});
</script>

{#if allItems.length > 0}
	<!--
		The outer div carries the pswp-gallery id so PhotoSwipe can discover the
		image anchors inside.  Video items are rendered as <div>s so PhotoSwipe's
		`children: 'a[data-pswp-width]'` selector ignores them automatically.
	-->
	<div class="pswp-gallery grid grid-cols-2 gap-3" id={galleryID}>
		{#each allItems as item, index}
			{#if isVideoItem(item)}
				<!-- Video item – rendered inline, never opened in PhotoSwipe -->
				<div class="bg-base-300 aspect-square w-full overflow-hidden rounded-2xl shadow">
					{#if item.cloudflareId}
						<StreamPlayer
							videoUid={item.cloudflareId}
							private={false}
							className="h-full w-full"
						/>
					{:else}
						<video
							src={item.url}
							class="h-full w-full object-cover"
							controls
							preload="metadata"
						>
							<track kind="captions" />
						</video>
					{/if}
				</div>
			{:else}
				<!-- Image item – opened in PhotoSwipe lightbox on click -->
				<a
					href={item.url || item.largeURL}
					data-pswp-width={item.width ?? 1200}
					data-pswp-height={item.height ?? 900}
					target="_blank"
					rel="noreferrer"
					class="block"
				>
					<img
						src={item.url || item.thumbnailURL}
						alt={item.alt ||
							$t('common.components.gallery.image_alt', { values: { index: index + 1 } })}
						class="aspect-square w-full cursor-pointer rounded-2xl object-cover shadow transition-transform hover:scale-105 {thumbnailSize}"
					/>
				</a>
			{/if}
		{/each}
	</div>
{/if}
