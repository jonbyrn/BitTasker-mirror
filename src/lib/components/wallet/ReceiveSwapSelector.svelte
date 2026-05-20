<script lang="ts">
	/**
	 * ReceiveSwapSelector — "Payer sends from" network picker
	 *
	 * Shows all supported source networks the payer can send from,
	 * filtered by asset type (BTC/USDT/Other). Mirrors the send form's
	 * "To:" destination picker pattern.
	 */
	import { t } from 'svelte-i18n';
	import { lifiService } from '$lib/services/lifi.service';
	import { symbiosisService } from '$lib/services/symbiosis.service';
	import { tryCatch } from '$lib/utils/tryCatch';

	// ── Source network options — hardcoded fallback ───────────────────────────

	const HARDCODED_NETWORKS = [
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

	interface SourceNetwork {
		id: string;
		asset: string;
		label: string;
		icon: string;
		network: string;
		group: string;
	}

	// ── Props ─────────────────────────────────────────────────────────────────

	let { receiveCurrency = 'rbtc', onChange = (_network: string) => {} } = $props<{
		receiveCurrency: 'rbtc' | 'usdt';
		onChange?: (network: string) => void;
	}>();

	// ── Dynamic network fetching ──────────────────────────────────────────────

	/** Chain icon mapping — maps chain IDs/keys to icons for known chains */
	const CHAIN_ICONS: Record<string, string> = {
		ethereum: '/images/chains/ethereum.png',
		arbitrum: '/images/chains/arbitrum.png',
		polygon: '/images/chains/polygon.png',
		optimism: '/images/chains/optimism.png',
		base: '/images/chains/base.png',
		avalanche: '/images/chains/avalanche.png',
		avalanchec: '/images/chains/avalanche.png',
		tron: '/images/chains/tron.png',
		binance: '/images/chains/Binance-logo.svg',
		bsc: '/images/chains/Binance-logo.svg',
		rootstock: '/images/chains/Bitcoin-Rootstock-logo.webp',
		rsk: '/images/chains/Bitcoin-Rootstock-logo.webp',
		bitcoin: '/images/chains/Bitcoin.svg',
		lightning: '/images/chains/lightning.svg'
	};

	const CACHE_KEY = 'bittasker_swap_source_networks';
	const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

	let dynamicNetworks = $state<SourceNetwork[]>([]);
	let _networksLoading = $state(false);

	async function fetchDynamicNetworks() {
		// Check cache
		try {
			const cached = localStorage.getItem(CACHE_KEY);
			if (cached) {
				const { data, timestamp } = JSON.parse(cached);
				if (Date.now() - timestamp < CACHE_TTL_MS && Array.isArray(data)) {
					dynamicNetworks = data as SourceNetwork[];
					return;
				}
			}
		} catch {
			/* ignore cache errors */
		}

		_networksLoading = true;
		const results: SourceNetwork[] = [];

		// Fetch from LI.FI
		const { data: lifiChains } = await tryCatch(lifiService.getChains());
		if (lifiChains) {
			for (const c of lifiChains) {
				if (!c.mainnet) continue;
				const key = c.key?.toLowerCase() ?? '';
				const asset =
					key === 'rootstock' || key === 'rsk' || key === 'bitcoin' ? 'rBTC/BTC' : 'USDT';
				const group = asset === 'rBTC/BTC' ? 'btc' : 'usdt';
				results.push({
					id: `lifi-${c.id}`,
					asset: key === 'rootstock' || key === 'rsk' ? 'rBTC' : key === 'bitcoin' ? 'BTC' : 'USDT',
					label: c.name,
					icon: CHAIN_ICONS[key] ?? '',
					network: key.includes('bitcoin') ? 'bitcoin' : `usdt-${key}`,
					group
				});
			}
		}

		// Fetch from Symbiosis
		const { data: symbiosisChains } = await tryCatch(symbiosisService.getChains());
		if (symbiosisChains) {
			for (const c of symbiosisChains) {
				const name = c.name?.toLowerCase() ?? '';
				if (results.some((r) => r.label.toLowerCase() === name)) continue; // dedupe
				const asset = name.includes('bitcoin') || name.includes('rootstock') ? 'BTC' : 'USDT';
				const group = asset === 'BTC' ? 'btc' : 'usdt';
				results.push({
					id: `sym-${c.chainId}`,
					asset,
					label: c.name,
					icon: CHAIN_ICONS[name] ?? '',
					network: name.includes('bitcoin') ? 'bitcoin' : `usdt-${name}`,
					group
				});
			}
		}

		if (results.length > 0) {
			dynamicNetworks = results;
			try {
				localStorage.setItem(CACHE_KEY, JSON.stringify({ data: results, timestamp: Date.now() }));
			} catch {
				/* ignore */
			}
		}
		_networksLoading = false;
	}

	// Always start with hardcoded; enrich with API data on mount
	let _fetched = false;
	$effect(() => {
		if (!_fetched) {
			_fetched = true;
			fetchDynamicNetworks();
		}
	});

	// ── State ─────────────────────────────────────────────────────────────────

	let expanded = $state(false);
	let activeGroup = $state<'btc' | 'usdt' | 'other'>('btc');
	let searchQuery = $state('');
	let selectedId = $state<string>('');

	// ── Derived ───────────────────────────────────────────────────────────────

	// Use API data when available, fall back to hardcoded
	let activeNetworks = $derived(
		dynamicNetworks.length > 0 ? dynamicNetworks : [...HARDCODED_NETWORKS]
	);

	/** Networks filtered by the active group chip */
	let filteredNetworks = $derived.by(() => {
		const source = activeNetworks;
		if (activeGroup === 'other') {
			const q = searchQuery.toLowerCase().trim();
			if (!q) return source;
			return source.filter(
				(n) =>
					n.asset.toLowerCase().includes(q) ||
					n.label.toLowerCase().includes(q) ||
					n.network.toLowerCase().includes(q)
			);
		}
		return source.filter((n) => n.group === activeGroup);
	});

	let selectedNetwork = $derived(activeNetworks.find((n) => n.id === selectedId));

	// ── Init ──────────────────────────────────────────────────────────────────

	// Default to the asset matching the receive currency (run once)
	let _defaultsApplied = false;
	$effect(() => {
		if (_defaultsApplied) return;
		const defaultGroup = receiveCurrency === 'rbtc' ? 'btc' : 'usdt';
		const defaultAsset = receiveCurrency === 'rbtc' ? 'rBTC' : 'USDT';
		activeGroup = defaultGroup;
		const defaults = HARDCODED_NETWORKS.filter((n) => n.group === defaultGroup);
		const direct = defaults.find((n) => n.asset === defaultAsset);
		const id = direct?.id ?? defaults[0]?.id ?? '';
		if (id) {
			selectedId = id;
			onChange(direct?.network ?? '');
			_defaultsApplied = true;
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
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2 pr-10 text-sm font-medium sm:pr-12"
			onclick={() => (expanded = !expanded)}
		>
			<span class="text-base-content/60">{$t('wallet.from')}:</span>
			{#if _networksLoading}
				<span class="loading loading-spinner loading-xs ml-1"></span>
			{:else if selectedNetwork?.icon}
				<img src={selectedNetwork.icon} alt={selectedNetwork.label} class="h-5 w-5" />
			{/if}
			<span class="text-sm">{selectedNetwork?.asset} ({selectedNetwork?.label ?? 'Unknown'})</span>
		</button>
		<div class="collapse-content px-2">
			<div class="space-y-2">
				<!-- Filter chips -->
				<div class="flex justify-center gap-1">
					<button
						type="button"
						class="btn btn-sm min-h-[44px] flex-1 {activeGroup === 'btc'
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => selectGroup('btc')}
					>
						BTC
					</button>
					<button
						type="button"
						class="btn btn-sm min-h-[44px] flex-1 {activeGroup === 'usdt'
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => selectGroup('usdt')}
					>
						USDT
					</button>
					<button
						type="button"
						class="btn btn-sm min-h-[44px] flex-1 {activeGroup === 'other'
							? 'btn-primary'
							: 'btn-ghost'}"
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
