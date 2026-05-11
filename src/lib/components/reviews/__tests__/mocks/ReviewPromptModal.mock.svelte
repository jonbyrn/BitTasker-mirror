<script lang="ts">
	let {
		isOpen = false,
		onSubmit
	}: {
		isOpen?: boolean;
		onSubmit?: (eventId: string) => void;
	} = $props();
</script>

{#if isOpen}
	<div data-testid="mock-review-modal">
		<button type="button" onclick={() => onSubmit?.('mock-event-id')}> Mock submit review </button>
	</div>
{/if}
