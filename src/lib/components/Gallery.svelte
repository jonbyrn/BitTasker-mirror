<script>
  import { onMount } from 'svelte';
  import PhotoSwipeLightbox from 'photoswipe/lightbox';
  import 'photoswipe/style.css';

  const { galleryID = 'my-gallery', images = [], thumbnailSize = 'h-40 w-40' } = $props();

  onMount(() => {
    const lightbox = new PhotoSwipeLightbox({
      gallery: '#' + galleryID,
      children: 'a',
      mouseMovePan: true,
      initialZoomLevel: 'fit',
      secondaryZoomLevel: 1.5,
      maxZoomLevel: 1,
      pswpModule: () => import('photoswipe')
    });
    lightbox.init();

    return () => lightbox.destroy(); // cleanup
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
          alt={image.alt || `Image ${index + 1}`}
          class="cursor-pointer rounded-2xl px-2 shadow transition-transform hover:scale-105 {thumbnailSize} object-cover"
        />
      </a>
    {/each}
  </div>
{/if}