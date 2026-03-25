<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { contractStore } from '$lib/stores/contract.store';
	import { buildContractContextPresentation } from '$lib/utils/service-contract/context-presentation';
	import { t } from 'svelte-i18n';

	const { contract, variant = 'detail' } = $props<{
		contract: ContractWithEvents;
		variant?: 'card' | 'detail';
	}>();

	const presentation = $derived(
		buildContractContextPresentation(contract, contractStore.getContractKey)
	);
	const serviceListingHref = $derived.by(() => {
		if (!presentation.isServiceContract) {
			return null;
		}

		const rawServiceId =
			typeof contract.contractEvent.content.serviceId === 'string' &&
			contract.contractEvent.content.serviceId.trim().length > 0
				? contract.contractEvent.content.serviceId
				: typeof contract.contractEvent.content.contextId === 'string' &&
					  contract.contractEvent.content.contextId.trim().length > 0
					? contract.contractEvent.content.contextId
					: null;

		return rawServiceId ? `/services/${encodeURIComponent(rawServiceId)}` : null;
	});

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}
</script>

{#if variant === 'card'}
	<div class="space-y-1">
		<span class="card-title line-clamp-2 text-lg font-semibold">
			{presentation.title}
		</span>
		{#if presentation.description}
			<p class="text-base-content/80 line-clamp-2 text-sm whitespace-pre-line">
				{presentation.description}
			</p>
		{/if}
	</div>
{:else}
	<div class="space-y-2">
		<div class="flex items-center gap-2">
			{#if !presentation.isServiceContract}
				<span class="badge badge-outline badge-sm">
					{tr('dashboard.contracts.context_summary.task_contract', 'Task Contract')}
				</span>
			{/if}
			{#if presentation.selectedTierLabel}
				<span class="badge badge-outline badge-sm">
					{presentation.selectedTierLabel}
				</span>
			{/if}
		</div>

		<div class="space-y-2">
			{#if serviceListingHref}
				<a
					href={serviceListingHref}
					class="hover:text-primary card-title line-clamp-2 text-lg font-semibold transition-colors"
				>
					{presentation.title}
				</a>
			{:else}
				<span class="card-title line-clamp-2 text-lg font-semibold">
					{presentation.title}
				</span>
			{/if}
			{#if presentation.description}
				<p class="text-base-content/70 text-sm whitespace-pre-line">{presentation.description}</p>
			{/if}
		</div>
	</div>
{/if}
