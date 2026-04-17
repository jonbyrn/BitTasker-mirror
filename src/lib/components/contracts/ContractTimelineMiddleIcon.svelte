<script lang="ts">
	import { ContractStatus } from '$lib/utils/contract/types';
	import IconHandshake from '~icons/mdi/handshake';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconSyncAlert from '~icons/mdi/sync-alert';
	import IconCloseCircle from '~icons/mdi/close-circle';
	import IconCashRefund from '~icons/mdi/cash-refund';
	import IconProgressClock from '~icons/mdi/progress-clock';
	import IconBankOutline from '~icons/mdi/bank-outline';

	const { kind, contractStatus } = $props<{
		kind: 'initiation' | 'status';
		contractStatus?: ContractStatus;
	}>();

	const iconClass = 'h-5 w-5 shrink-0';

	const shellClass = $derived.by(() => {
		if (kind === 'initiation') {
			return 'border-primary/30 bg-primary/10 text-primary';
		}
		const s = contractStatus;
		if (s === undefined) return 'border-base-300 bg-base-200 text-base-content/70';

		switch (s) {
			case ContractStatus.Completed:
			case ContractStatus.FundsReleased:
			case ContractStatus.DisputeResolved:
			case ContractStatus.FundsClaimed:
				return 'border-success/30 bg-success/10 text-success';
			case ContractStatus.InDispute:
			case ContractStatus.InDisputeWorkInProgress:
			case ContractStatus.NoShow:
				return 'border-warning/40 bg-warning/10 text-warning';
			case ContractStatus.Cancelled:
				return 'border-error/30 bg-error/10 text-error';
			case ContractStatus.Refunded:
			case ContractStatus.DisputeUnresolved:
				return 'border-info/40 bg-info/10 text-info';
			case ContractStatus.Funded:
			case ContractStatus.WorkInProgress:
				return 'border-primary/30 bg-primary/10 text-primary';
			default:
				return 'border-base-300 bg-base-200 text-base-content/70';
		}
	});
</script>

<div
	class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border {shellClass}"
	aria-hidden="true"
>
	{#if kind === 'initiation'}
		<IconHandshake class={iconClass} />
	{:else if contractStatus === ContractStatus.Completed || contractStatus === ContractStatus.FundsReleased || contractStatus === ContractStatus.DisputeResolved || contractStatus === ContractStatus.FundsClaimed}
		<IconCheckCircle class={iconClass} />
	{:else if contractStatus === ContractStatus.InDispute || contractStatus === ContractStatus.InDisputeWorkInProgress || contractStatus === ContractStatus.NoShow}
		<IconSyncAlert class={iconClass} />
	{:else if contractStatus === ContractStatus.Cancelled}
		<IconCloseCircle class={iconClass} />
	{:else if contractStatus === ContractStatus.Refunded || contractStatus === ContractStatus.DisputeUnresolved}
		<IconCashRefund class={iconClass} />
	{:else if contractStatus === ContractStatus.Funded}
		<IconBankOutline class={iconClass} />
	{:else if contractStatus === ContractStatus.WorkInProgress}
		<IconProgressClock class={iconClass} />
	{:else}
		<IconProgressClock class={iconClass} />
	{/if}
</div>
