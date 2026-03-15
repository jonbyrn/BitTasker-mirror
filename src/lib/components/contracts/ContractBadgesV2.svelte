<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { t } from 'svelte-i18n';
	import {
		getStatusTranslationKeyV2,
		getStatusColorClassV2
	} from '$lib/utils/helpers/contractStatusFormatterV2';

	const { contract, showDevBadge = false } = $props<{
		contract: ContractWithEvents;
		showDevBadge?: boolean;
	}>();

	// V2: use escrowData.status (blockchain state 0–11) so badge matches chain, not v1 determineContractState
	const statusForDisplay = $derived(contract.escrowData?.status as number | undefined);
	const statusTranslationKey = $derived(getStatusTranslationKeyV2(statusForDisplay));
	const statusColorClass = $derived(getStatusColorClassV2(statusForDisplay));

	function getRoleBadgeClass(isClient: boolean): string {
		return isClient ? 'badge-primary' : 'badge-secondary';
	}
</script>

<div class="flex shrink-0 flex-col items-end gap-2 self-stretch">
	<div class="flex flex-wrap justify-end gap-1">
		<div
			class="badge {getRoleBadgeClass(contract.isClient)} badge-sm"
			class:shrink-0={showDevBadge}
		>
			{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
		</div>
		<div class="badge badge-outline badge-sm">V2</div>
		{#if showDevBadge && contract.escrowData?.id}
			<div class="badge badge-error badge-sm">{contract.escrowData.id}</div>
		{/if}
	</div>
	<div class="badge {statusColorClass} badge-sm mt-2">
		{#if contract?.isPending}
			<span class="loading loading-spinner loading-xs mr-1"></span>
		{/if}
		{$t(statusTranslationKey)}
	</div>
</div>
