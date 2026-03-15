<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { escrow } from '$lib/utils/escrow';
	import ContractActions from './ContractActions.svelte';

	const {
		contract,
		containerClass = 'space-y-3',
		isInline = false,
		compactButtons = false
	} = $props<{
		contract: ContractWithEvents;
		containerClass?: string;
		isInline?: boolean;
		compactButtons?: boolean;
	}>();

	const version = $derived(escrow.getVersionFromContract(contract));
</script>

{#if version === 'v1'}
	<ContractActions {contract} {containerClass} {isInline} {compactButtons} />
{:else if version === 'v2'}
	<!-- TODO: ContractActionsV2 when v2 actions are implemented -->
	<ContractActions {contract} {containerClass} {isInline} {compactButtons} />
{:else}
	<!-- Fallback to v1 for unknown versions -->
	<ContractActions {contract} {containerClass} {isInline} {compactButtons} />
{/if}
