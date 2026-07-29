<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatSats, formatUsd } from '$lib/utils/wallet/format';

	interface Props {
		amount: string; // Store as string to preserve input
		unit: 'sats' | 'usd';
		onUnitToggle: () => void;
		btcPrice?: number; // Optional BTC price, will fetch if not provided
	}

	let { amount, unit, onUnitToggle, btcPrice = 0 }: Props = $props();

	let isLoadingPrice = $state(false);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (unit === 'sats') {
			const parsed = parseFloat(amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const amountInUSD = $derived.by(() => {
		if (unit === 'usd') {
			const parsed = parseFloat(amount);
			return isNaN(parsed) ? 0 : parsed;
		} else {
			const sats = parseFloat(amount);
			if (isNaN(sats) || btcPrice === 0) return 0;
			return (sats / 100_000_000) * btcPrice;
		}
	});

	// Fetch BTC price if not provided
	onMount(async () => {
		if (btcPrice === 0) {
			isLoadingPrice = true;
			try {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			} catch (error) {
				console.error('Failed to fetch BTC price:', error);
				// Keep btcPrice at 0, conversions will show unavailable
			} finally {
				isLoadingPrice = false;
			}
		}
	});
</script>

<div class="amount-display flex flex-col items-center gap-2 md:gap-3">
	<!-- Primary Amount Display -->
	<div class="flex items-baseline gap-2 md:gap-3">
		{#if unit === 'sats'}
			<span
				class="text-base-content text-4xl font-bold tabular-nums md:text-5xl lg:text-6xl"
				data-testid="primary-amount-sats"
			>
				{formatSats(amountInSats)}
			</span>
			<button
				type="button"
				class="btn btn-sm btn-ghost h-auto min-h-0 px-2 text-lg font-semibold md:px-3 md:text-xl"
				onclick={onUnitToggle}
				aria-label={$t('wallet.receive.unit_sats')}
			>
				{$t('wallet.receive.unit_sats')}
			</button>
		{:else}
			<span
				class="text-base-content text-4xl font-bold tabular-nums md:text-5xl lg:text-6xl"
				data-testid="primary-amount-usd"
			>
				{formatUsd(amountInUSD)}
			</span>
			<button
				type="button"
				class="btn btn-sm btn-ghost h-auto min-h-0 px-2 text-lg font-semibold md:px-3 md:text-xl"
				onclick={onUnitToggle}
				aria-label={$t('wallet.receive.unit_usd')}
			>
				{$t('wallet.receive.unit_usd')}
			</button>
		{/if}
	</div>

	<!-- Conversion Display (Secondary) -->
	{#if amount && parseFloat(amount) > 0}
		<div class="text-base-content/70 flex items-center gap-2 text-base md:text-lg">
			{#if unit === 'sats'}
				{#if isLoadingPrice}
					<span class="loading loading-spinner loading-sm"></span>
					<span>{$t('common.loading')}</span>
				{:else if btcPrice > 0}
					<span data-testid="conversion-usd">≈ {formatUsd(amountInUSD)}</span>
				{:else}
					<span class="text-base-content/50">{$t('wallet.exchange_rate_unavailable')}</span>
				{/if}
			{:else if isLoadingPrice}
				<span class="loading loading-spinner loading-sm"></span>
				<span>{$t('common.loading')}</span>
			{:else if btcPrice > 0}
				<span data-testid="conversion-sats"
					>≈ {formatSats(amountInSats)} {$t('wallet.receive.unit_sats')}</span
				>
			{:else}
				<span class="text-base-content/50">{$t('wallet.exchange_rate_unavailable')}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Ensure consistent number rendering */
	.tabular-nums {
		font-variant-numeric: tabular-nums;
	}
</style>
