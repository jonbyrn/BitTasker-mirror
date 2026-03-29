<script lang="ts">
	let {
		onHighlightMissing
	}: {
		onHighlightMissing?: () => void;
	} = $props();
</script>

<div data-testid="contracts-panel-stub">
	<button type="button" onclick={() => onHighlightMissing?.()}
		>Report missing contract highlight</button
	>
</div>
