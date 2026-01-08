<script lang="ts">
	import { scroll } from '$lib/stores/infiniteScroll.store';

	let isLoadingMore = $state(false);
	let component: HTMLDivElement = $state() as HTMLDivElement;

	const onScroll = () => {
		const element = document.documentElement;
		const offset = $scroll.horizontal
			? element.scrollWidth - element.clientWidth - window.scrollX
			: element.scrollHeight - element.clientHeight - window.scrollY;

		if (offset <= $scroll.threshold) {
			if (!isLoadingMore && $scroll.hasMore) {
				$scroll.loadMore();
			}
			isLoadingMore = true;
		} else {
			isLoadingMore = false;
		}
	};
</script>

<svelte:document onscroll={onScroll} onresize={onScroll} />

<div bind:this={component} style="width:0px"></div>
