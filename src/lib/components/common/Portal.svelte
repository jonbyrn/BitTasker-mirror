<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	let { target = null, children }: { target?: HTMLElement | null; children?: Snippet } = $props();

	let container: HTMLDivElement | null = null;
	let appended = false;
	let portalTarget: HTMLElement | null = null;

	onMount(() => {
		if (typeof document === 'undefined') return;

		portalTarget = target ?? document.body;
		if (portalTarget && container && !appended) {
			portalTarget.appendChild(container);
			appended = true;
		}

		return () => {
			if (portalTarget && container && appended) {
				portalTarget.removeChild(container);
				appended = false;
			}
		};
	});
</script>

<div bind:this={container} class="portal-root">
	{#if children}
		{@render children()}
	{/if}
</div>

