<script lang="ts">
	let {
		value = null,
		onChange
	}: {
		value?: Date | null;
		onChange?: ((date: Date | null) => void) | undefined;
	} = $props();
</script>

<div data-testid="date-input-stub"></div>
