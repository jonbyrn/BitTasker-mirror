<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { escrow } from '$lib/utils/escrow';
	import ContractBadgesV1 from './ContractBadgesV1.svelte';
	import ContractBadgesV2 from './ContractBadgesV2.svelte';

	const { contract, showDevBadge = false } = $props<{
		contract: ContractWithEvents;
		/** Show escrow id badge in dev (e.g. import.meta.env.DEV) */
		showDevBadge?: boolean;
	}>();

	const version = $derived(escrow.getVersionFromContract(contract));
</script>

{#if version === 'v1'}
	<ContractBadgesV1 {contract} {showDevBadge} />
{:else if version === 'v2'}
	<ContractBadgesV2 {contract} {showDevBadge} />
{:else}
	<ContractBadgesV1 {contract} {showDevBadge} />
{/if}
