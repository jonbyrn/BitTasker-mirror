<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { contractStore } from '$lib/stores/contract.store';
	import { buildContractContextPresentation } from '$lib/utils/service-contract/context-presentation';

	const { contract, variant = 'detail' } = $props<{
		contract: ContractWithEvents;
		variant?: 'card' | 'detail';
	}>();

	const presentation = $derived(
		buildContractContextPresentation(contract, contractStore.getContractKey)
	);
</script>

<div class="space-y-2">
	<div class="flex items-center gap-2">
		{#if presentation.isServiceContract}
			<span class="badge badge-info badge-sm">{presentation.summaryLabel}</span>
		{:else}
			<span class="badge badge-outline badge-sm">Task Contract</span>
		{/if}
		{#if presentation.selectedTierId}
			<span class="badge badge-outline badge-sm">Tier: {presentation.selectedTierId}</span>
		{/if}
	</div>

	<div class={variant === 'card' ? 'space-y-1' : 'space-y-2'}>
		<h4 class={variant === 'card' ? 'text-base font-semibold' : 'text-lg font-semibold'}>
			{presentation.title}
		</h4>
		{#if presentation.description}
			<p class="text-base-content/70 text-sm whitespace-pre-line">{presentation.description}</p>
		{/if}
	</div>
</div>
