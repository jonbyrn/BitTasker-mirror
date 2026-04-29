<script lang="ts">
	const {
		containerClass = 'flex flex-wrap gap-2',
		children
	} = $props<{
		containerClass?: string;
		children?: import('svelte').Snippet;
	}>();
</script>

<div class={containerClass}>
	{@render children?.()}
</div>
