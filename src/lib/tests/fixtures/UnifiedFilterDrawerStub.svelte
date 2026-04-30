<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		isOpen = false,
		onApply = () => {},
		onClear = () => {},
		children
	} = $props<{
		isOpen?: boolean;
		onApply?: () => void;
		onClear?: () => void;
		children?: Snippet;
	}>();
</script>

{#if isOpen}
	<div data-testid="unified-filter-drawer">
		{@render children?.()}
		<button data-testid="drawer-apply" type="button" onclick={() => onApply()}> Apply </button>
		<button data-testid="drawer-clear" type="button" onclick={() => onClear()}> Clear </button>
	</div>
{/if}
