<script lang="ts">
	// In production, query getUserAccountData from aave.service.ts
	let hasPositions = $derived(false);
</script>

{#if hasPositions}
	<!-- Position cards will go here in v2 -->
	<div class="bg-base-200 rounded-box p-4">
		<p class="text-sm">Active positions placeholder</p>
	</div>
{/if}
