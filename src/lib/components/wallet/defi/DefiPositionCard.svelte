<script lang="ts">
	import { t } from 'svelte-i18n';

	// For v1: show empty state since no real positions exist yet
	// In production, query getUserAccountData from aave.service.ts
	let hasPositions = $derived(false);
</script>

{#if !hasPositions}
	<div class="bg-base-200 rounded-box mt-4 p-4 text-center">
		<p class="text-base-content/60 text-sm font-medium">
			{$t('wallet.defi.shared.no_positions')}
		</p>
		<p class="text-base-content/40 mt-1 text-xs">
			{$t('wallet.defi.shared.no_positions_desc')}
		</p>
	</div>
{:else}
	<!-- Position cards will go here in v2 -->
	<div class="bg-base-200 rounded-box mt-4 p-4">
		<p class="text-sm">Active positions placeholder</p>
	</div>
{/if}
