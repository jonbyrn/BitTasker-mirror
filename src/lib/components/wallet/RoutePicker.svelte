<script lang="ts">
	import type { Route } from '$lib/services/route-resolver';

	interface Props {
		routes: Route[];
		selectedRouteId: string;
		onSelect: (routeId: string) => void;
	}

	let { routes, selectedRouteId, onSelect }: Props = $props();

	let expanded = $state(true);

	let selectedRoute = $derived(routes.find((r) => r.id === selectedRouteId));

	/** Derive a chain icon from the first hop's service and from-chain. */
	function getRouteIcon(route: Route): string {
		const hop = route.hops[0];
		if (hop.service === 'direct') {
			if (hop.fromChain === 'rsk') return '/images/chains/Bitcoin-Rootstock-logo.webp';
			if (hop.fromChain === 'bsc') return '/images/chains/Tether-USD.svg';
		}
		if (hop.service === 'boltz') {
			return '/images/chains/lightning.svg';
		}
		if (hop.service === 'changelly') {
			if (hop.fromChain === 'rsk') return '/images/chains/Bitcoin-Rootstock-logo.webp';
			if (hop.fromChain === 'bsc') return '/images/chains/Binance-logo.svg';
		}
		return '/images/chains/Bitcoin.svg';
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
>
	<button
		type="button"
		class="collapse-title flex min-h-0 items-center px-4 py-1 text-left text-sm font-medium"
		onclick={() => (expanded = !expanded)}
	>
		<span>Route</span>
		{#if selectedRoute}
			<span class="mr-6 ml-auto text-xs opacity-70">{selectedRoute.label}</span>
		{/if}
	</button>
	<div class="collapse-content px-2">
		<div class="space-y-1 px-2 pt-2">
			{#each routes as route (route.id)}
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors {selectedRouteId ===
					route.id
						? 'border-primary bg-primary/5'
						: 'border-base-300 hover:border-primary/50'}"
					onclick={() => onSelect(route.id)}
				>
					<img src={getRouteIcon(route)} alt={route.label} class="h-6 w-6" />
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium">{route.label}</div>
					</div>
					<div class="ml-auto text-right text-xs">
						<div class="opacity-70">
							{route.totalFeePercent > 0 ? `${route.totalFeePercent}%` : 'No fee'}
						</div>
						<div class="opacity-50">{route.estimatedTime}</div>
					</div>
				</button>
			{/each}
		</div>
	</div>
</div>
