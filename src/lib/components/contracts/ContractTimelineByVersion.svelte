<script lang="ts">
	import type { ContractWithEvents, ContractStatusEvent } from '$lib/types/contract';
	import { escrow } from '$lib/utils/escrow';
	import ContractTimeline from './ContractTimeline.svelte';

	const {
		contract,
		statusEvents,
		contractPubkey,
		contractCreatedAt,
		contractCreatorPubkey,
		contractFundingTransactionHash,
		onDisplayCountChange
	} = $props<{
		contract: ContractWithEvents;
		statusEvents: ContractStatusEvent[];
		contractPubkey: string;
		contractCreatedAt?: number;
		contractCreatorPubkey?: string;
		contractFundingTransactionHash?: string;
		onDisplayCountChange?: (count: number) => void;
	}>();

	const version = $derived(escrow.getVersionFromContract(contract));
</script>

{#if version === 'v1'}
	<ContractTimeline
		{statusEvents}
		{contractPubkey}
		{contractCreatedAt}
		{contractCreatorPubkey}
		{contractFundingTransactionHash}
		{onDisplayCountChange}
	/>
{:else if version === 'v2'}
	<!-- TODO: ContractTimelineV2 when v2 timeline is implemented -->
	<ContractTimeline
		{statusEvents}
		{contractPubkey}
		{contractCreatedAt}
		{contractCreatorPubkey}
		{contractFundingTransactionHash}
		{onDisplayCountChange}
	/>
{:else}
	<ContractTimeline
		{statusEvents}
		{contractPubkey}
		{contractCreatedAt}
		{contractCreatorPubkey}
		{contractFundingTransactionHash}
		{onDisplayCountChange}
	/>
{/if}
