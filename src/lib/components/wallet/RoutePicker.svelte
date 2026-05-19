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
	}

	let {
		routes,
		selectedRouteId,
		onSelect,
		networkFeeSats = 0,
		isLoadingFee = false,
		btcPrice = 0,
		network = null,
		amountSats = 0
	}: Props = $props();

	let expanded = $state(false);

	let selectedRoute = $derived(routes.find((r) => r.id === selectedRouteId));
	let isUSDT = $derived(network === 'usdt-bsc');

	/** Swap fee for the selected route in sats. */
	let swapFeeSats = $derived.by(() => {
		if (!selectedRoute || amountSats <= 0) return 0;
		return Math.round(amountSats * (selectedRoute.totalFeePercent / 100));
	});

	/** Total fee: swap fee + network transaction fee. */
	let totalFeeSats = $derived(swapFeeSats + networkFeeSats);

	/**
	 * Format a sats amount as "XXX Sats" or "$X.XX".
	 * When btcPrice is available, append USD equivalent in parens.
	 */
	function feeDisplay(sats: number): string {
		if (isUSDT) return `$${(sats / 100_000_000).toFixed(2)}`;
		const satsStr = `${formatSats(sats)} ${$t('wallet.sats')}`;
		if (btcPrice > 0 && sats > 0) {
			const usd = formatUsd((sats / 100_000_000) * btcPrice);
			return `${satsStr} (${usd})`;
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
		{:else if totalFeeSats > 0}
			<span class="ml-1.5 font-semibold">{feeDisplay(totalFeeSats)}</span>
			{#if selectedRoute}
				<span class="mr-6 ml-auto shrink-0 text-xs opacity-50">~{selectedRoute.estimatedTime}</span>
			{/if}
		{:else}
			<span class="ml-1.5 font-semibold">{isUSDT ? '$0.00' : '0 ' + $t('wallet.sats')}</span>
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
				<!-- Total row when both present -->
				{#if swapFeeSats > 0 && networkFeeSats > 0}
					<div
						class="border-base-300 flex items-center justify-between border-t pt-1 text-xs font-semibold"
					>
						<span>Total</span>
						<span>{feeDisplay(totalFeeSats)}</span>
					</div>
				{/if}
			{/if}

			<!-- Route options (only show if multiple) -->
			{#if routes.length > 1}
				<div class="border-base-300 mt-1.5 border-t pt-1.5">
					{#each routes as route (route.id)}
						{@const _routeFee = Math.round(amountSats * (route.totalFeePercent / 100))}
						<button
							type="button"
							class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors {selectedRouteId ===
							route.id
								? 'bg-primary/5'
								: ''}"
							onclick={() => onSelect(route.id)}
						>
							<span class="text-primary/70 text-base leading-none">
								{selectedRouteId === route.id ? '●' : '○'}
							</span>
							<span class="min-w-0 flex-1">
								<span class="font-medium">{route.label}</span>
								<span class="ml-1 opacity-50">~{route.estimatedTime}</span>
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
					{$t('wallet.send.enter_address_and_amount_to_estimate')}
				</div>
			{/if}
		</div>
	</div>
</div>
