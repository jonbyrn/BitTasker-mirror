<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatSats, formatUsd } from '$lib/stores/wallet.store';

	let {
		totalReceived,
		totalReceivedUSD,
		receiveTab,
		isBelowSwapMinimum,
		swapLimitsMinimal,
		hasFeeEstimate,
		amountInSats // eslint-disable-line @typescript-eslint/no-unused-vars -- prop consumed by parent
	}: {
		totalReceived: number;
		totalReceivedUSD: number;
		receiveTab: string;
		isBelowSwapMinimum: boolean;
		swapLimitsMinimal: number;
		hasFeeEstimate: boolean;
		amountInSats: number;
	} = $props();
</script>

<div
	class="bg-base-200 flex flex-row items-center justify-between gap-1.5 rounded-lg border-2 p-1.5"
	class:border-primary={!isBelowSwapMinimum}
	class:border-error={isBelowSwapMinimum}
>
	<span class="text-xs opacity-70">{$t('wallet.swap.total_received_est')}</span>
	{#if isBelowSwapMinimum && swapLimitsMinimal > 0}
		<span class="text-error text-xs">
			{$t('wallet.receive.below_swap_minimum', {
				values: { minAmount: formatSats(swapLimitsMinimal) }
			})}
		</span>
	{:else if totalReceived > 0 && hasFeeEstimate}
		<div class="flex items-center gap-1.5">
			{#if receiveTab === 'usdt0-arb'}
				<span class="text-primary text-xl font-bold">
					{formatUsd(totalReceivedUSD)}
				</span>
			{:else}
				<span class="text-primary text-xl font-bold">
					{formatSats(totalReceived)}
					{$t('wallet.sats')}
				</span>
				<span class="text-xs opacity-60">|</span>
				<span class="text-xs opacity-60">
					≈ {formatUsd(totalReceivedUSD)}
				</span>
			{/if}
		</div>
	{:else}
		<span class="text-xs opacity-60">{$t('wallet.receive.enter_amount_to_estimate')}</span>
	{/if}
</div>
