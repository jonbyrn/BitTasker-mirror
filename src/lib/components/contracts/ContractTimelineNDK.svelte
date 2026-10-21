<script lang="ts">
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { get } from 'svelte/store';
	import { locale, t } from 'svelte-i18n';
	import {
		buildContractTimelineRows,
		type ContractTimelineEntry
	} from '$lib/utils/contract/buildContractTimelineRows';
	import ContractTimelineInitiationItem from './ContractTimelineInitiationItem.svelte';
	import ContractTimelineStatusItem from './ContractTimelineStatusItem.svelte';

	const { contractRune, btcPrice } = $props<{
		contractRune: PaymentContractRune;
		btcPrice: number;
	}>();

	const entries = $derived.by(() => {
		// `timelineRevision` changes when a local complete, fund, or release row is added.
		void contractRune.timelineRevision;
		return buildContractTimelineRows({
			contract: contractRune.contract,
			statusEvents: contractRune.statusEvents
		});
	});

	const emptyStateLabel = $derived.by(() => {
		get(locale);
		get(t);
		return get(t)('dashboard.contracts.timeline.no_updates');
	});

	function entryKey(item: ContractTimelineEntry, index: number): string {
		if (item.kind === 'initiation') {
			return `init-${item.contract.id ?? item.contract.created_at ?? index}`;
		}
		return `st-${item.event.id ?? index}-${item.event.created_at ?? ''}`;
	}
</script>

{#if entries.length === 0}
	<div class="text-base-content/60 py-6 text-center">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="mx-auto mb-2 h-8 w-8 opacity-50"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<p class="text-sm">{emptyStateLabel}</p>
	</div>
{:else}
	<ul class="timeline timeline-vertical timeline-snap-icon max-md:timeline-compact gap-0">
		{#each entries as item, i (entryKey(item, i))}
			{#if item.kind === 'initiation'}
				<ContractTimelineInitiationItem
					contract={item.contract}
					isLast={i === entries.length - 1}
				/>
			{:else}
				<ContractTimelineStatusItem
					event={item.event}
					paymentContract={contractRune.contract}
					{btcPrice}
					viewerIsTasker={contractRune.isTasker}
					isLast={i === entries.length - 1}
				/>
			{/if}
		{/each}
	</ul>
{/if}
