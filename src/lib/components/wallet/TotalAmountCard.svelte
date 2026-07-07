<script lang="ts">
	/**
	 * TotalAmountCard — Reusable total-amount display for Send and Receive forms.
	 * Uses the compact row layout from the ReceivePaymentForm.
	 *
	 * Props:
	 *  - label:   i18n key or raw string for the left-side label
	 *  - amount:  numeric amount in satoshis (or USDT wei-equivalent for USDT)
	 *  - unit:    'sats' | 'usdt' | 'usd' — controls format
	 *  - usdValue: optional USD equivalent (shown as ≈)
	 *  - isError:  when true, the card gets a red border
	 */
	interface Props {
		label: string;
		amount: number;
		unit: 'sats' | 'usdt' | 'usd';
		usdValue?: number;
		isError?: boolean;
	}

	let { label, amount, unit = 'sats', usdValue, isError = false }: Props = $props();

	import { t } from 'svelte-i18n';
	import { formatSats, formatUsd } from '$lib/stores/wallet.store';
</script>

<div
	class="bg-base-200 flex flex-row items-center justify-between gap-1.5 rounded-lg border-2 p-1.5"
	class:border-primary={!isError}
	class:border-error={isError}
>
	<span class="text-xs opacity-70">{label}</span>
	{#if isError && amount > 0}
		<span class="text-error text-sm font-semibold">{$t('wallet.insufficient_balance')}</span>
	{:else if amount > 0}
		<div class="flex items-center gap-1">
			{#if unit === 'usdt'}
				<span class="text-primary text-sm font-bold"
					>${(usdValue ?? amount / 100_000_000).toLocaleString('en-US', {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2
					})}</span
				>
				{#if amount > 0}
					<span class="text-xs opacity-60">{formatSats(amount)} {$t('wallet.sats')}</span>
				{/if}
			{:else}
				<span class="text-primary text-sm font-bold">{formatSats(amount)} {$t('wallet.sats')}</span>
				{#if usdValue !== undefined && usdValue > 0}
					<span class="text-xs opacity-60">≈ {formatUsd(usdValue)}</span>
				{/if}
			{/if}
		</div>
	{:else}
		<span class="text-xs opacity-60">{unit === 'usdt' ? '$0.00' : `0 ${$t('wallet.sats')}`}</span>
	{/if}
</div>
