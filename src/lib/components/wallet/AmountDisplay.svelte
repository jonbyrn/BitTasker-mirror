<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	interface Props {
		amount: string; // Store as string to preserve input
		unit: 'sats' | 'usd';
		onUnitToggle: () => void;
		btcPrice?: number; // Optional BTC price, will fetch if not provided
	}

	const props = $props<Props>();

	// Initialize btcPrice from props if provided, otherwise 0
	// Use nullish coalescing to distinguish between 0 and undefined
	let btcPrice = $state<number>(
		props.btcPrice !== undefined && props.btcPrice !== null ? props.btcPrice : 0
	);
	let isLoadingPrice = $state(false);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (props.unit === 'sats') {
			const parsed = parseFloat(props.amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(props.amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const amountInUSD = $derived.by(() => {
		if (props.unit === 'usd') {
			const parsed = parseFloat(props.amount);
			return isNaN(parsed) ? 0 : parsed;
		} else {
			const sats = parseFloat(props.amount);
			if (isNaN(sats) || btcPrice === 0) return 0;
			return (sats / 100_000_000) * btcPrice;
		}
	});

	// Format sats with thousand separators
	function formatSats(sats: number): string {
		if (isNaN(sats) || !isFinite(sats)) return '0';
		return new Intl.NumberFormat('en-US').format(sats);
	}

	// Format USD with currency symbol
	function formatUSD(usd: number): string {
		if (isNaN(usd) || !isFinite(usd)) return '$0.00';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(usd);
	}

	// Fetch BTC price if not provided
	onMount(async () => {
		if (props.btcPrice === undefined || props.btcPrice === null) {
			isLoadingPrice = true;
			try {
				btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			} catch (error) {
				console.error('Failed to fetch BTC price:', error);
				// Keep btcPrice at 0, conversions will show unavailable
			} finally {
				isLoadingPrice = false;
			}
		} else {
			btcPrice = props.btcPrice;
		}
	});

	// Update btcPrice when prop changes
	$effect(() => {
		if (props.btcPrice !== undefined && props.btcPrice !== null) {
			btcPrice = props.btcPrice;
		}
	});
</script>

<div class="amount-display flex flex-col items-center gap-2 md:gap-3">
	<!-- Primary Amount Display -->
	<div class="flex items-baseline gap-2 md:gap-3">
		{#if props.unit === 'sats'}
			<span
				class="text-4xl md:text-5xl lg:text-6xl font-bold text-base-content tabular-nums"
				data-testid="primary-amount-sats"
			>
				{formatSats(amountInSats)}
			</span>
			<button
				type="button"
				class="btn btn-sm btn-ghost text-lg md:text-xl font-semibold px-2 md:px-3 min-h-0 h-auto"
				onclick={props.onUnitToggle}
				aria-label={$t('wallet.receive.unit_sats')}
			>
				{$t('wallet.receive.unit_sats')}
			</button>
		{:else}
			<span
				class="text-4xl md:text-5xl lg:text-6xl font-bold text-base-content tabular-nums"
				data-testid="primary-amount-usd"
			>
				{formatUSD(amountInUSD)}
			</span>
			<button
				type="button"
				class="btn btn-sm btn-ghost text-lg md:text-xl font-semibold px-2 md:px-3 min-h-0 h-auto"
				onclick={props.onUnitToggle}
				aria-label={$t('wallet.receive.unit_usd')}
			>
				{$t('wallet.receive.unit_usd')}
			</button>
		{/if}
	</div>

	<!-- Conversion Display (Secondary) -->
	{#if props.amount && parseFloat(props.amount) > 0}
		<div class="flex items-center gap-2 text-base md:text-lg text-base-content/70">
			{#if props.unit === 'sats'}
				{#if isLoadingPrice}
					<span class="loading loading-spinner loading-sm"></span>
					<span>{$t('common.loading')}</span>
				{:else if btcPrice > 0}
					<span data-testid="conversion-usd">≈ {formatUSD(amountInUSD)}</span>
				{:else}
					<span class="text-base-content/50">{$t('wallet.exchange_rate_unavailable')}</span>
				{/if}
			{:else}
				{#if isLoadingPrice}
					<span class="loading loading-spinner loading-sm"></span>
					<span>{$t('common.loading')}</span>
				{:else if btcPrice > 0}
					<span data-testid="conversion-sats">≈ {formatSats(amountInSats)} {$t('wallet.receive.unit_sats')}</span>
				{:else}
					<span class="text-base-content/50">{$t('wallet.exchange_rate_unavailable')}</span>
				{/if}
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

