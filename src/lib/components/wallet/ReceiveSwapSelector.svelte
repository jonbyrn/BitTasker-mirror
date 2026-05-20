<script lang="ts">
	/**
	 * ReceiveSwapSelector — "Payer sends from" network picker
	 *
	 * Shows all supported source networks the payer can send from,
	 * filtered by asset type (BTC/USDT/Other). Mirrors the send form's
	 * "To:" destination picker pattern.
	 */
	import { t } from 'svelte-i18n';

	// ── Source network options ────────────────────────────────────────────────
	// Mirrors DESTINATION_CHAIN_OPTIONS from SendPaymentForm, organized by asset

	const SOURCE_NETWORKS = [
		// BTC networks
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
		// USDT networks
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
		}
	] as const;

	type SourceNetwork = (typeof SOURCE_NETWORKS)[number];

	// ── Props ─────────────────────────────────────────────────────────────────

	let { receiveCurrency = 'rbtc', onChange = (_network: string) => {} } = $props<{
		receiveCurrency: 'rbtc' | 'usdt';
		onChange?: (network: string) => void;
	}>();

	// ── State ─────────────────────────────────────────────────────────────────

	let expanded = $state(false);
	let activeGroup = $state<'btc' | 'usdt' | 'other'>('btc');
	let searchQuery = $state('');
	let selectedId = $state<string>('');

	// ── Derived ───────────────────────────────────────────────────────────────

	/** Networks filtered by the active group chip */
	let filteredNetworks = $derived.by(() => {
		if (activeGroup === 'other') {
			const q = searchQuery.toLowerCase().trim();
			if (!q) return SOURCE_NETWORKS;
			return SOURCE_NETWORKS.filter(
				(n) =>
					n.asset.toLowerCase().includes(q) ||
					n.label.toLowerCase().includes(q) ||
					n.network.toLowerCase().includes(q)
			);
		}
		return SOURCE_NETWORKS.filter((n) => n.group === activeGroup);
	});

	let selectedNetwork = $derived(SOURCE_NETWORKS.find((n) => n.id === selectedId));

	// ── Init ──────────────────────────────────────────────────────────────────

	// Default to the asset matching the receive currency
	$effect(() => {
		if (!selectedId) {
			const defaultGroup = receiveCurrency === 'rbtc' ? 'btc' : 'usdt';
			const defaultAsset = receiveCurrency === 'rbtc' ? 'rBTC' : 'USDT';
			activeGroup = defaultGroup;
			const defaults = SOURCE_NETWORKS.filter((n) => n.group === defaultGroup);
			// Pick the direct match first (same chain, no swap)
			const direct = defaults.find((n) => n.asset === defaultAsset);
			const id = direct?.id ?? defaults[0]?.id ?? '';
			selectedId = id;
			if (id) onChange(direct?.network ?? '');
		}
	});

	// ── Handlers ──────────────────────────────────────────────────────────────

	function selectGroup(group: 'btc' | 'usdt' | 'other') {
		activeGroup = group;
		searchQuery = '';
	}

	function selectNetwork(network: SourceNetwork) {
		selectedId = network.id;
		expanded = false;
		onChange(network.network);
	}
</script>

<div class="form-control">
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={expanded}
	>
		<button
			type="button"
			class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 pr-10 text-sm font-medium sm:pr-12"
			onclick={() => (expanded = !expanded)}
		>
			<span class="text-base-content/60">{$t('wallet.receive.payer_sends_from')}:</span>
			{#if selectedNetwork?.icon}
				<img src={selectedNetwork.icon} alt={selectedNetwork.label} class="h-5 w-5" />
			{/if}
			<span class="text-sm">{selectedNetwork?.asset} ({selectedNetwork?.label ?? 'Unknown'})</span>
		</button>
		<div class="collapse-content px-2">
			<div class="space-y-2">
				<!-- Filter chips -->
				<div class="flex gap-1">
					<button
						type="button"
						class="btn btn-xs {activeGroup === 'btc' ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => selectGroup('btc')}
					>
						BTC
					</button>
					<button
						type="button"
						class="btn btn-xs {activeGroup === 'usdt' ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => selectGroup('usdt')}
					>
						USDT
					</button>
					<button
						type="button"
						class="btn btn-xs {activeGroup === 'other' ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => selectGroup('other')}
					>
						{$t('wallet.receive.other')}
					</button>
				</div>

				<!-- Search bar (Other only) -->
				{#if activeGroup === 'other'}
					<input
						type="text"
						class="input input-bordered input-sm w-full"
						placeholder={$t('wallet.receive.search_networks')}
						bind:value={searchQuery}
					/>
				{/if}

				<!-- Network list -->
				<div class="max-h-48 space-y-1 overflow-y-auto">
					{#each filteredNetworks as network (network.id)}
						<button
							type="button"
							class="hover:border-primary flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 text-left text-xs transition-colors {selectedId ===
							network.id
								? 'bg-primary/10'
								: ''}"
							onclick={() => selectNetwork(network)}
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
					{#if filteredNetworks.length === 0}
						<span class="text-base-content/50 text-xs"
							>{$t('wallet.receive.no_networks_found')}</span
						>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
