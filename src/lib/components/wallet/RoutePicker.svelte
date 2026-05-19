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

	/** Total fee: route swap fee + network transaction fee. */
	let totalFeeSatsCombined = $derived.by(() => {
		if (!selectedRoute || amountSats <= 0) return networkFeeSats;
		const swapFee = Math.round(amountSats * (selectedRoute.totalFeePercent / 100));
		return swapFee + networkFeeSats;
	});

	function getFiatFee(sats: number): string {
		if (btcPrice <= 0 || sats <= 0) return '';
		return formatUsd((sats / 100_000_000) * btcPrice);
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
		{:else if totalFeeSatsCombined > 0}
			{#if isUSDT}
				<span class="ml-1.5 font-semibold">${(totalFeeSatsCombined / 100_000_000).toFixed(2)}</span>
			{:else}
				<span class="ml-1.5 font-semibold"
					>{formatSats(totalFeeSatsCombined)} {$t('wallet.sats')}</span
				>
				{#if btcPrice > 0}
					<span class="ml-1 text-xs opacity-60">≈ {getFiatFee(totalFeeSatsCombined)}</span>
				{/if}
			{/if}
		{:else}
			<span class="ml-1.5 font-semibold">{isUSDT ? '$0.00' : '0 ' + $t('wallet.sats')}</span>
		{/if}
		{#if selectedRoute}
			<span class="mr-6 ml-auto shrink-0 text-xs opacity-50">~{selectedRoute.estimatedTime}</span>
		{/if}
	</button>
	<div class="collapse-content px-2">
		<div class="space-y-1.5 px-2 pt-1">
			<!-- Fee breakdown -->
			{#if totalFeeSatsCombined > 0}
				{@const swapFeeSats = Math.round(
					amountSats * ((selectedRoute?.totalFeePercent ?? 0) / 100)
				)}
				{#if swapFeeSats > 0}
					<div class="flex items-center justify-between text-xs opacity-70">
						<span>{$t('wallet.swap.swap_fee')}</span>
						<span>{formatSats(swapFeeSats)} {$t('wallet.sats')}</span>
					</div>
				{/if}
				{#if networkFeeSats > 0}
					<div class="flex items-center justify-between text-xs opacity-70">
						<span>{$t('wallet.swap.network_transaction_fee')}</span>
						<span>{formatSats(networkFeeSats)} {$t('wallet.sats')}</span>
					</div>
				{/if}
				<!-- Combined total when both swap + network exist -->
				{#if swapFeeSats > 0 && networkFeeSats > 0}
					<div
						class="border-base-300 flex items-center justify-between border-t pt-1 text-xs font-semibold"
					>
						<span>Total</span>
						<span>{formatSats(totalFeeSatsCombined)} {$t('wallet.sats')}</span>
					</div>
				{/if}
			{/if}

			<!-- Route options (only show if multiple routes) -->
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
								{#if isUSDT}
									${(_routeFee / 100_000_000).toFixed(2)}
								{:else}
									{formatSats(_routeFee)} {$t('wallet.sats')}
								{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if !totalFeeSatsCombined && !isLoadingFee}
				<div class="text-center text-xs opacity-70">
					{$t('wallet.send.enter_address_and_amount_to_estimate')}
				</div>
			{/if}
		</div>
	</div>
</div>
