<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Route } from '$lib/services/route-resolver';
	import { formatSats, formatUsd } from '$lib/stores/wallet.store';

	interface Props {
		routes: Route[];
		selectedRouteId: string;
		onSelect: (routeId: string) => void;
		networkFeeSats?: number;
		isLoadingFee?: boolean;
		btcPrice: number;
		network?: string | null;
		amountSats?: number;
		hasAddress?: boolean;
		hasAmount?: boolean;
		/** Live swap fee from API — overrides route-based calculation when provided. */
		swapFeeOverride?: number;
	}

	let {
		routes,
		selectedRouteId,
		onSelect,
		networkFeeSats = 0,
		isLoadingFee = false,
		btcPrice = 0,
		network = null,
		amountSats = 0,
		hasAddress = false,
		hasAmount = false,
		swapFeeOverride = undefined as number | undefined
	}: Props = $props();

	let expanded = $state(false);

	let selectedRoute = $derived(routes.find((r) => r.id === selectedRouteId));
	let isUSDT = $derived(
		typeof network === 'string' &&
			(network === 'usdt-bsc' || network === 'usdt-arbitrum' || network.startsWith('usdt'))
	);

	/** Swap fee: uses live API override when > 0, otherwise falls back to route %. */
	let swapFeeSats = $derived.by(() => {
		if (amountSats <= 0) return 0;
		if (swapFeeOverride && swapFeeOverride > 0) return swapFeeOverride;
		if (!selectedRoute) return 0;
		return Math.round(amountSats * (selectedRoute.totalFeePercent / 100));
	});

	/** Total fee: swap fee + network transaction fee. */
	let totalFeeSats = $derived(swapFeeSats + networkFeeSats);

	/**
	 * Format a sats amount as "XXX Sats" or "$X.XX".
	 * When btcPrice is available, append USD equivalent in parens.
	 */
	function feeDisplay(sats: number): string {
		const usdValue = btcPrice > 0 && sats > 0 ? (sats / 100_000_000) * btcPrice : 0;
		if (isUSDT) {
			return usdValue > 0 ? formatUsd(usdValue) : '$0.00';
		}
		const satsStr = `${formatSats(sats)} ${$t('wallet.sats')}`;
		if (usdValue > 0) {
			return `${satsStr} (${formatUsd(usdValue)})`;
		}
		return satsStr;
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
>
	<button
		type="button"
		class="collapse-title flex min-h-0 items-center px-3 py-2 text-left text-sm font-medium"
		onclick={() => (expanded = !expanded)}
		disabled={isLoadingFee}
	>
		<span>{$t('wallet.network_fee')}:</span>
		{#if isLoadingFee}
			<span class="loading loading-spinner loading-xs ml-1.5"></span>
		{:else if routes.length === 0 && hasAddress && hasAmount}
			<span class="ml-1.5 text-xs opacity-70">{$t('wallet.route_picker.no_routes')}</span>
		{:else if totalFeeSats > 0}
			<span class="ml-1.5 font-semibold">{feeDisplay(totalFeeSats)}</span>
		{:else if !hasAddress && !hasAmount}
			<span class="ml-1.5 text-xs opacity-70"
				>{$t('wallet.route_picker.enter_address_and_amount')}</span
			>
		{:else if !hasAddress}
			<span class="ml-1.5 text-xs opacity-70">{$t('wallet.route_picker.enter_address')}</span>
		{:else if !hasAmount}
			<span class="ml-1.5">—</span>
		{:else if hasAddress && hasAmount}
			<span class="ml-1.5">—</span>
		{:else}
			<span class="ml-1.5">—</span>
		{/if}
		{#if selectedRoute && hasAddress && hasAmount}
			<span class="mr-6 ml-auto shrink-0 text-xs opacity-50">{selectedRoute.estimatedTime}</span>
		{/if}
	</button>
	<div class="collapse-content px-2">
		<div class="space-y-1.5 px-2 pt-1">
			{#if totalFeeSats > 0}
				<!-- Swap fee row -->
				{#if swapFeeSats > 0}
					<div class="flex items-center justify-between text-xs opacity-70">
						<span>{$t('wallet.swap.swap_fee')}</span>
						<span>{feeDisplay(swapFeeSats)}</span>
					</div>
				{/if}
				<!-- Network fee row -->
				{#if networkFeeSats > 0}
					<div class="flex items-center justify-between text-xs opacity-70">
						<span>{$t('wallet.swap.network_transaction_fee')}</span>
						<span>{feeDisplay(networkFeeSats)}</span>
					</div>
				{/if}
			{/if}

			<!-- Route options (only show if multiple) -->
			{#if routes.length > 1}
				<div class="border-base-300 mt-2 flex flex-col gap-2 border-t pt-2">
					{#each routes as route (route.id)}
						{@const _routeFee = Math.round(amountSats * (route.totalFeePercent / 100))}
						<button
							type="button"
							class="hover:bg-base-200 flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm transition-colors {selectedRouteId ===
							route.id
								? 'bg-primary/5'
								: ''}"
							onclick={() => onSelect(route.id)}
						>
							<span class="text-primary/70 text-lg leading-none">
								{selectedRouteId === route.id ? '●' : '○'}
							</span>
							<span class="min-w-0 flex-1">
								<span class="font-medium">{route.label}</span>
								<span class="ml-1 opacity-50">{route.estimatedTime}</span>
							</span>
							<span class="ml-auto shrink-0 font-medium">
								{_routeFee > 0 ? feeDisplay(_routeFee) : 'Free'}
							</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if !totalFeeSats && !isLoadingFee}
				<div class="text-center text-xs opacity-70">
					{#if !hasAddress && !hasAmount}
						Enter address and amount to calculate fees
					{:else if !hasAddress}
						Enter address to calculate fees
					{:else if !hasAmount}
						Enter amount to calculate fees
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
