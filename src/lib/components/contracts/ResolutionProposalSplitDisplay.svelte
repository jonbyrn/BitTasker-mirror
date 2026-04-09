<script lang="ts">
	import { ethers } from 'ethers';
	import { t } from 'svelte-i18n';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import { displayPercentOfPool } from '$lib/utils/contract/resolutionProposalDisplay';

	const {
		taskerShareWei,
		taskeeShareWei,
		currency,
		btcPrice = 0,
		isTasker,
		variant = 'default',
		proposerIsTasker = undefined,
		class: className = ''
	} = $props<{
		taskerShareWei: bigint;
		taskeeShareWei: bigint;
		currency: string;
		btcPrice?: number;
		/** Highlights "You" on the tasker (left) or taskee (right) column. */
		isTasker: boolean;
		variant?: 'default' | 'compact';
		/** When set, shows who authored this proposal (read-only views). */
		proposerIsTasker?: boolean;
		class?: string;
	}>();

	const splitPoolWei = $derived(taskerShareWei + taskeeShareWei);

	function displayUsdApproxLine(shareWei: bigint): string {
		const eth = ethers.formatEther(shareWei);
		if (btcPrice > 0) {
			const usd = formatConvertedAmount(eth, currency, { btcPrice, toCurrency: 'USD' });
			return `~${usd}`;
		}
		const n = Number(eth);
		if (!Number.isFinite(n)) return '';
		return `~${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${currency}`;
	}

	const isCompact = $derived(variant === 'compact');
	const titleClass = $derived(
		isCompact ? 'text-xs font-medium' : 'text-base-content/80 text-xs font-medium'
	);
	const pctClass = $derived(
		isCompact ? 'text-lg font-bold tracking-tight' : 'text-2xl font-bold tracking-tight'
	);
	const subClass = $derived(
		isCompact ? 'text-base-content/60 text-xs' : 'text-base-content/60 text-sm'
	);
	const padClass = $derived(isCompact ? 'gap-1 rounded-lg p-3' : 'gap-1 rounded-lg p-4');
</script>

<div class="flex flex-col gap-2 {className}">
	{#if proposerIsTasker !== undefined}
		<p class="text-base-content/70 text-center text-xs font-medium">
			{proposerIsTasker
				? $t('dashboard.contracts.actions.resolution_proposed_by_tasker')
				: $t('dashboard.contracts.actions.resolution_proposed_by_taskee')}
		</p>
	{/if}

	<div class="flex flex-row gap-3 sm:flex-row sm:items-stretch sm:justify-between">
		<div
			class="flex flex-1 flex-col {padClass} text-center {isTasker
				? 'border-primary bg-primary/10 border-2'
				: 'bg-base-200'}"
		>
			<span class={titleClass}>
				{isTasker
					? $t('dashboard.contracts.actions.propose_resolution_label_you')
					: $t('dashboard.contracts.actions.propose_resolution_label_tasker')}
			</span>
			<span class={pctClass}>
				{displayPercentOfPool(taskerShareWei, splitPoolWei)}
			</span>
			<span class={subClass}>
				{displayUsdApproxLine(taskerShareWei)}
			</span>
		</div>
		<div
			class="flex flex-1 flex-col {padClass} text-center {!isTasker
				? 'border-primary bg-primary/10 border-2'
				: 'bg-base-200'}"
		>
			<span class={titleClass}>
				{isTasker
					? $t('dashboard.contracts.actions.propose_resolution_label_taskee')
					: $t('dashboard.contracts.actions.propose_resolution_label_you')}
			</span>
			<span class={pctClass}>
				{displayPercentOfPool(taskeeShareWei, splitPoolWei)}
			</span>
			<span class={subClass}>
				{displayUsdApproxLine(taskeeShareWei)}
			</span>
		</div>
	</div>
</div>
