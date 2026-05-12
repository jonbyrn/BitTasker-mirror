<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		isOpen = false,
		title = '',
		children
	}: {
		isOpen?: boolean;
		title?: string;
		children?: Snippet;
	} = $props();
</script>

{#if isOpen}
	<section data-testid="mock-drawer">
		<h1>{title}</h1>
		{@render children?.()}
	</section>
{/if}
