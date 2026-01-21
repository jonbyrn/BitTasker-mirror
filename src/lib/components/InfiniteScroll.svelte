<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { scroll } from '$lib/stores/infiniteScroll.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';

	let isLoadingMore = $state(false);
	let component: HTMLDivElement = $state() as HTMLDivElement;

	let unsubscribeScrollContainer: (() => void) | undefined;
	let scrollEl: HTMLElement | null = $state(null);
	let observer: IntersectionObserver | null = null;
	let sentinel: HTMLDivElement | null = null;
	let fallbackCleanup: (() => void) | null = null;

	function cleanupObserverAndSentinel() {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		if (sentinel && sentinel.parentElement) {
			sentinel.parentElement.removeChild(sentinel);
		}
		sentinel = null;
		if (fallbackCleanup) {
			fallbackCleanup();
			fallbackCleanup = null;
		}
	}

	function ensureSentinel(target: HTMLElement) {
		if (sentinel && sentinel.parentElement === target) return;

		// Remove from any previous parent first.
		if (sentinel && sentinel.parentElement) {
			sentinel.parentElement.removeChild(sentinel);
		}

		sentinel = document.createElement('div');
		sentinel.setAttribute('data-infinite-scroll-sentinel', 'true');
		sentinel.setAttribute('aria-hidden', 'true');
		sentinel.style.width = '1px';
		sentinel.style.height = '1px';
		sentinel.style.pointerEvents = 'none';

		target.appendChild(sentinel);
	}

	function tryLoadMore() {
		if (!$scroll.hasMore) {
			isLoadingMore = false;
			return;
		}
		if (isLoadingMore) return;

		isLoadingMore = true;
		$scroll.loadMore();

		// Re-arm after a short delay to allow content to append.
		setTimeout(() => {
			isLoadingMore = false;
		}, 300);
	}

	function setupIntersectionObserver(target: HTMLElement) {
		cleanupObserverAndSentinel();
		ensureSentinel(target);

		// Horizontal infinite scroll is better handled by scroll math.
		if ($scroll.horizontal) {
			setupScrollFallback(target);
			return;
		}

		const thresholdPx = Math.max(0, Number($scroll.threshold) || 0);
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						tryLoadMore();
					}
				}
			},
			{
				root: target,
				// Trigger before reaching the bottom by `threshold` pixels.
				rootMargin: `0px 0px ${thresholdPx}px 0px`,
				threshold: 0
			}
		);

		observer.observe(sentinel!);

		// Also keep a fallback scroll listener to update isLoadingMore based on distance.
		setupScrollFallback(target);
	}

	function setupScrollFallback(target: HTMLElement) {
		if (fallbackCleanup) {
			fallbackCleanup();
			fallbackCleanup = null;
		}

		const onScroll = () => {
			if (!$scroll.hasMore) {
				isLoadingMore = false;
				return;
			}

			const offset = $scroll.horizontal
				? target.scrollWidth - target.clientWidth - target.scrollLeft
				: target.scrollHeight - target.clientHeight - target.scrollTop;

			if (offset <= $scroll.threshold) {
				tryLoadMore();
			} else {
				isLoadingMore = false;
			}
		};

		target.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		fallbackCleanup = () => {
			target.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		};

		// Initial check
		onScroll();
	}

	onMount(() => {
		unsubscribeScrollContainer = appScrollContainer.subscribe((el) => {
			scrollEl = el;
			if (scrollEl) {
				setupIntersectionObserver(scrollEl);
			} else {
				cleanupObserverAndSentinel();
			}
		});

		return () => {
			if (unsubscribeScrollContainer) unsubscribeScrollContainer();
			cleanupObserverAndSentinel();
		};
	});

	onDestroy(() => {
		if (unsubscribeScrollContainer) unsubscribeScrollContainer();
		cleanupObserverAndSentinel();
	});
</script>

<div bind:this={component} style="width:0px"></div>
