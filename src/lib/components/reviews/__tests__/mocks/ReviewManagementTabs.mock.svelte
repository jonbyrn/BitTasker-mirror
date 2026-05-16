<script lang="ts">
	let { pendingCount = 0 }: { pendingCount?: number } = $props();
</script>

<div data-testid="pending-count">{pendingCount}</div>
