<script lang="ts">
	import { t } from 'svelte-i18n';

	const SOURCE_NETWORKS = [
		{
			id: 'rbtc-rsk',
			asset: 'rBTC',
			label: 'Rootstock Bitcoin',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			network: 'rootstock-bitcoin',
			group: 'btc'
		},
		{
			id: 'btc-onchain',
			asset: 'BTC',
			label: 'Bitcoin',
			icon: '/images/chains/Bitcoin.svg',
			network: 'bitcoin',
			group: 'btc'
		},
		{
			id: 'btc-lightning',
			asset: 'BTC',
			label: 'Lightning',
			icon: '/images/chains/lightning.svg',
			network: 'lightning-bitcoin',
			group: 'btc'
		},
		{
			id: 'usdt-bsc',
			asset: 'USDT',
			label: 'Binance',
			icon: '/images/chains/Binance-logo.svg',
			network: 'usdt-bsc',
			group: 'usdt'
		},
		{
			id: 'usdt-eth',
			asset: 'USDT',
			label: 'Ethereum',
			icon: '/images/chains/ethereum.png',
			network: 'usdt-ethereum',
			group: 'usdt'
		},
		{
			id: 'usdt-arb',
			asset: 'USDT',
			label: 'Arbitrum',
			icon: '/images/chains/arbitrum.png',
			network: 'usdt-arbitrum',
			group: 'usdt'
		},
		{
			id: 'usdt-poly',
			asset: 'USDT',
			label: 'Polygon',
			icon: '/images/chains/polygon.png',
			network: 'usdt-polygon',
			group: 'usdt'
		},
		{
			id: 'usdt-op',
			asset: 'USDT',
			label: 'Optimism',
			icon: '/images/chains/optimism.png',
			network: 'usdt-optimism',
			group: 'usdt'
		},
		{
			id: 'usdt-base',
			asset: 'USDT',
			label: 'Base',
			icon: '/images/chains/base.png',
			network: 'usdt-base',
			group: 'usdt'
		},
		{
			id: 'usdt-avax',
			asset: 'USDT',
			label: 'Avalanche',
			icon: '/images/chains/avalanche.png',
			network: 'usdt-avalanche',
			group: 'usdt'
		},
		{
			id: 'usdt-trx',
			asset: 'USDT',
			label: 'TRON',
			icon: '/images/chains/tron.png',
			network: 'usdt-tron',
			group: 'usdt'
		}
	];

	let { receiveCurrency = 'rbtc', onChange = (_network: string) => {} } = $props<{
		receiveCurrency: 'rbtc' | 'usdt';
		onChange?: (network: string) => void;
	}>();

	let expanded = $state(false);
	let activeGroup = $state<'btc' | 'usdt'>('btc');
	let searchQuery = $state('');
	let selectedId = $state('');

	let filteredNetworks = $derived.by(() => {
		const net =
			activeGroup === 'btc'
				? SOURCE_NETWORKS.filter((n) => n.group === 'btc')
				: SOURCE_NETWORKS.filter((n) => n.group === 'usdt');
		const q = searchQuery.trim().toLowerCase();
		if (!q) return net;
		return net.filter(
			(n) => n.label.toLowerCase().includes(q) || n.network.toLowerCase().includes(q)
		);
	});

	let selectedNetwork = $derived(SOURCE_NETWORKS.find((n) => n.id === selectedId));

	function selectGroup(group: 'btc' | 'usdt') {
		activeGroup = group;
	}

	function selectNetwork(id: string) {
		selectedId = id;
		expanded = false;
		const net = SOURCE_NETWORKS.find((n) => n.id === id);
		if (net) onChange(net.network);
	}

	// Init defaults
	let _inited = false;
	$effect(() => {
		if (_inited) return;
		const g: 'btc' | 'usdt' = receiveCurrency === 'rbtc' ? 'btc' : 'usdt';
		const a = receiveCurrency === 'rbtc' ? 'rBTC' : 'USDT';
		activeGroup = g;
		const defs = SOURCE_NETWORKS.filter((n) => n.group === g);
		const direct = defs.find((n) => n.asset === a);
		const id = direct?.id ?? defs[0]?.id ?? '';
		if (id) {
			selectedId = id;
			onChange(direct?.network ?? '');
			_inited = true;
		}
	});
</script>

<div class="form-control">
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={expanded}
	>
		<button
			type="button"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2 pr-10 text-sm font-medium sm:pr-12"
			onclick={() => (expanded = !expanded)}
		>
			<span class="text-base-content/60">{$t('wallet.from')}:</span>
			{#if selectedNetwork?.icon}
				<img src={selectedNetwork.icon} alt={selectedNetwork.label} class="h-5 w-5" />
			{/if}
			<span class="text-sm">{selectedNetwork?.asset} ({selectedNetwork?.label ?? 'Unknown'})</span>
		</button>
		<div class="collapse-content px-2">
			<div class="space-y-2">
				<div class="flex gap-1">
					<button
						type="button"
						class="btn btn-sm min-h-[44px] flex-1 {activeGroup === 'btc'
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => selectGroup('btc')}>BTC</button
					>
					<button
						type="button"
						class="btn btn-sm min-h-[44px] flex-1 {activeGroup === 'usdt'
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => selectGroup('usdt')}>USDT</button
					>
				</div>
				<div class="max-h-48 space-y-1 overflow-y-auto">
					{#each filteredNetworks as network (network.id)}
						<button
							type="button"
							class="hover:border-primary flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 text-left text-xs transition-colors {selectedId ===
							network.id
								? 'bg-primary/10'
								: ''}"
							onclick={() => selectNetwork(network.id)}
						>
							{#if network.icon}
								<img src={network.icon} alt={network.label} class="h-5 w-5" />
							{/if}
							<span class="font-medium">{network.asset}</span>
							<span class="text-base-content/70">({network.label})</span>
							{#if selectedId === network.id}
								<span class="text-primary ml-auto text-xs">●</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
