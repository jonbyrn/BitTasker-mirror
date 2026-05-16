<script lang="ts">
	let {
		isOpen = false,
		title,
		children
	}: {
		isOpen?: boolean;
		title?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

{#if isOpen}
	<div data-testid="mock-drawer">
		{#if title}
			<h1>{title}</h1>
		{/if}
		{@render children?.()}
	</div>
{/if}
