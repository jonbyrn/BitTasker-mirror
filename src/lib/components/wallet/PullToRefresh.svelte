<script lang="ts">
	import type { Snippet } from 'svelte';
	import { pullShouldRefresh } from './pull-refresh';

	let {
		onRefresh,
		label,
		class: className = '',
		children
	}: {
		onRefresh: () => void | Promise<void>;
		label: string;
		class?: string;
		children: Snippet;
	} = $props();

	let startY = 0;
	let tracking = false;

	function onTouchStart(event: TouchEvent): void {
		const touch = event.touches[0];
		if (!touch) return;
		tracking = true;
		startY = touch.clientY;
	}

	function onTouchEnd(event: TouchEvent): void {
		if (!tracking) return;
		tracking = false;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const scrollY = typeof window === 'undefined' ? 0 : window.scrollY;
		if (pullShouldRefresh({ startY, currentY: touch.clientY, scrollY })) {
			void onRefresh();
		}
	}
</script>

<div
	class={className}
	role="group"
	data-testid="pull-to-refresh"
	aria-label={label}
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
>
	{@render children()}
</div>
