<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	// -----------------------------------------------------------------------
	// Types
	// -----------------------------------------------------------------------

	interface SourceNetwork {
		id: string;
		asset: string;
		label: string;
		icon: string;
		network: string;
		group: 'btc' | 'usdt' | 'other';
		chainName?: string;
		recommended?: boolean;
	}

	// -----------------------------------------------------------------------
	// Hardcoded networks — always available, no network fetch needed
	// -----------------------------------------------------------------------

	// BTC section sorted: Rootstock → Lightning Bitcoin → Liquid Bitcoin → Bitcoin on-chain
	// USDT section sorted: Binance first, then alphabetical
	const SOURCE_NETWORKS: SourceNetwork[] = [
		// -- BTC group --
		{
			id: 'rbtc-rsk',
			asset: 'rBTC',
			label: 'Rootstock Bitcoin',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			network: 'rootstock-bitcoin',
			group: 'btc',
			recommended: true
		},
		{
			id: 'btc-lightning',
			asset: 'BTC',
			label: 'Lightning Bitcoin',
			icon: '/images/chains/lightning.svg',
			network: 'lightning-bitcoin',
			group: 'btc'
		},
		{
			id: 'btc-liquid',
			asset: 'L-BTC',
			label: 'Liquid Bitcoin',
			icon: '/images/chains/Liquid-Bitcoin.svg',
			network: 'liquid-bitcoin',
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
		// -- USDT group (Binance first, rest alphabetical) --
		{
			id: 'usdt-bsc',
			asset: 'USDT',
			label: 'Binance',
			icon: '/images/chains/Binance-logo.svg',
			network: 'usdt-bsc',
			group: 'usdt',
			recommended: true
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
			id: 'usdt-avax',
			asset: 'USDT',
			label: 'Avalanche',
			icon: '/images/chains/avalanche.png',
			network: 'usdt-avalanche',
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
			id: 'usdt-eth',
			asset: 'USDT',
			label: 'Ethereum',
			icon: '/images/chains/ethereum.png',
			network: 'usdt-ethereum',
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
			id: 'usdt-poly',
			asset: 'USDT',
			label: 'Polygon',
			icon: '/images/chains/polygon.png',
			network: 'usdt-polygon',
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

	/** Chain ID → display name. */
	const CHAIN_NAME: Record<number, string> = {
		1: 'Ethereum',
		10: 'Optimism',
		56: 'Binance',
		100: 'Gnosis',
		137: 'Polygon',
		250: 'Fantom',
		8453: 'Base',
		1284: 'Moonbeam',
		42220: 'Celo',
		42161: 'Arbitrum',
		43114: 'Avalanche'
	};

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------

	let { receiveCurrency = 'rbtc', onChange = (_network: string) => {} } = $props<{
		receiveCurrency: 'rbtc' | 'usdt';
		onChange?: (network: string) => void;
	}>();

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------

	let expanded = $state(false);
	let activeGroup = $state<'btc' | 'usdt' | 'other'>('btc');
	let searchQuery = $state('');
	let selectedId = $state('');

	/** True while the initial API fetch is in progress. */
	let _loading = $state(true);

	/** Dynamically discovered networks from LI.FI / Symbiosis APIs. */
	let dynamicNetworks = $state<SourceNetwork[]>([]);

	/** Number of items to show in "Other" group (incremental render). */
	let _visibleCount = $state(50);

	function onScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
			_visibleCount += 50;
		}
	}

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------

	/** All networks merged (hardcoded + dynamic), deduplicated by id. */
	let allNetworks = $derived.by(() => {
		const seen = new SvelteSet(SOURCE_NETWORKS.map((n) => n.id));
		const merged = [...SOURCE_NETWORKS];
		for (const dn of dynamicNetworks) {
			if (!seen.has(dn.id)) {
				seen.add(dn.id);
				merged.push(dn);
			}
		}
		return merged;
	});

	let showOtherGroup = $derived(dynamicNetworks.length > 0);

	let filteredNetworks = $derived.by(() => {
		if (activeGroup === 'other') {
			const q = searchQuery.trim().toLowerCase();
			return q
				? dynamicNetworks.filter(
						(n) => n.label.toLowerCase().includes(q) || n.asset.toLowerCase().includes(q)
					)
				: dynamicNetworks;
		}
		const net = SOURCE_NETWORKS.filter((n) => n.group === activeGroup);
		const q = searchQuery.trim().toLowerCase();
		if (!q) return net;
		return net.filter(
			(n) => n.label.toLowerCase().includes(q) || n.network.toLowerCase().includes(q)
		);
	});

	let selectedNetwork = $derived(allNetworks.find((n) => n.id === selectedId));

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------

	function selectGroup(group: 'btc' | 'usdt' | 'other') {
		activeGroup = group;
		searchQuery = '';
		_visibleCount = 50;
	}

	function selectNetwork(id: string) {
		selectedId = id;
		expanded = false;
		const net = allNetworks.find((n) => n.id === id);
		if (net) onChange(net.network);
	}

	// -----------------------------------------------------------------------
	// Initialisation — reads ONLY from hardcoded SOURCE_NETWORKS (safe)
	// -----------------------------------------------------------------------

	let _lastCurrency: 'rbtc' | 'usdt' | null = null;
	$effect(() => {
		if (_lastCurrency === receiveCurrency) return;
		_lastCurrency = receiveCurrency;
		const g: 'btc' | 'usdt' = receiveCurrency === 'rbtc' ? 'btc' : 'usdt';
		const a = receiveCurrency === 'rbtc' ? 'rBTC' : 'USDT';
		activeGroup = g;
		const defs = SOURCE_NETWORKS.filter((n) => n.group === g);
		const direct = defs.find((n) => n.asset === a);
		const fallback = direct ?? defs[0];
		if (fallback) {
			selectedId = fallback.id;
			onChange(fallback.network);
		}
	});

	// -----------------------------------------------------------------------
	// Dynamic chain sourcing — fetch once on mount, never reactively
	onMount(async () => {
		interface TokenManifestEntry {
			symbol: string;
			name: string;
			localPath: string;
			chainIds: number[];
		}
		let tokenManifest: TokenManifestEntry[] = [];
		try {
			const res = await fetch('/images/tokens/manifest.json');
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data)) tokenManifest = data;
			}
		} catch (err) {
			console.warn('[ReceiveSwapSelector] Failed to load token manifest:', err);
		}

		const discovered: SourceNetwork[] = [];
		const seen = new SvelteSet<string>();
		for (const t of tokenManifest) {
			for (const chainId of t.chainIds ?? []) {
				const id = `dyn-${t.symbol}-${chainId}`;
				if (seen.has(id)) continue;
				seen.add(id);
				const chainLabel = CHAIN_NAME[chainId] ?? `Chain ${chainId}`;
				discovered.push({
					id,
					asset: t.symbol,
					label: t.name || t.symbol,
					icon: t.localPath || '',
					network: `dyn-${t.symbol.toLowerCase()}-${chainId}`,
					group: 'other',
					chainName: chainLabel
				});
			}
		}

		// Sort once at load — avoids re-sorting on every search keystroke
		discovered.sort(
			(a, b) =>
				a.asset.localeCompare(b.asset) || (a.chainName ?? '').localeCompare(b.chainName ?? '')
		);
		dynamicNetworks = discovered;
		_loading = false;
	});
</script>

<div class="form-control">
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={expanded}
	>
		<button
			type="button"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2 pr-10 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:pr-12"
			aria-expanded={expanded}
			aria-controls="swap-source-content"
			onclick={() => (expanded = !expanded)}
		>
			<span class="text-base-content/60">{$t('wallet.from')}:</span>
			{#if selectedNetwork?.icon}
				<img
					src={selectedNetwork.icon}
					alt={selectedNetwork.label}
					class="h-5 w-5"
					loading="lazy"
				/>
			{/if}
			<span class="text-sm">{selectedNetwork?.asset} ({selectedNetwork?.label ?? 'Unknown'})</span>
		</button>
		<div
			class="collapse-content px-2"
			id="swap-source-content"
			role="region"
			aria-label="Network selection list"
		>
			<div class="space-y-2">
				<!-- Group chips -->
				<div class="flex gap-1" role="tablist" aria-label="Network groups">
					<button
						type="button"
						role="tab"
						aria-selected={activeGroup === 'btc'}
						class="btn btn-sm min-h-[44px] flex-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 {activeGroup ===
						'btc'
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => selectGroup('btc')}>₿ BTC</button
					>
					<button
						type="button"
						role="tab"
						aria-selected={activeGroup === 'usdt'}
						class="btn btn-sm min-h-[44px] flex-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 {activeGroup ===
						'usdt'
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => selectGroup('usdt')}>$ USDT</button
					>
					{#if _loading || showOtherGroup}
						<button
							type="button"
							role="tab"
							aria-selected={activeGroup === 'other'}
							class="btn btn-sm min-h-[44px] flex-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 {activeGroup ===
							'other'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => selectGroup('other')}
						>
							{#if _loading}
								<span class="loading loading-spinner loading-xs"></span>
							{/if}
							{$t('wallet.receive.other')}
						</button>
					{/if}
				</div>

				<!-- Search bar (only for "Other" group) -->
				{#if activeGroup === 'other'}
					<label class="input input-sm input-bordered flex w-full items-center gap-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 opacity-50"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<input
							type="search"
							bind:value={searchQuery}
							placeholder={$t('wallet.receive.search_networks')}
							class="grow bg-transparent text-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
						/>
					</label>
				{/if}

				<!-- Network list -->
				<div class="max-h-48 space-y-1 overflow-y-auto" onscroll={onScroll}>
					{#each filteredNetworks.slice(0, _visibleCount) as network (network.id)}
						<button
							type="button"
							class="hover:border-primary flex min-h-[44px] w-full gap-2 rounded-lg border-2 border-transparent p-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 {network.group ===
							'other'
								? 'items-start'
								: 'items-center'} {selectedId === network.id ? 'bg-primary/10' : ''}"
							onclick={() => selectNetwork(network.id)}
						>
							{#if network.icon}
								<img
									src={network.icon}
									alt={network.label}
									class="h-5 w-5 shrink-0 {network.group === 'other' ? 'mt-0.5' : ''}"
									loading="lazy"
								/>
							{:else}
								<div
									class="bg-base-300 flex h-5 w-5 shrink-0 items-center justify-center rounded-full {network.group ===
									'other'
										? 'mt-0.5'
										: ''}"
								>
									<span class="text-base-content/50 text-[10px] font-medium">
										{network.label.charAt(0).toUpperCase()}
									</span>
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="truncate">
									<span class="font-medium">{network.asset}</span>
									<span class="text-base-content/70"> ({network.label})</span>
								</div>
								{#if network.group === 'other' && network.chainName}
									<div class="text-base-content/50 truncate text-[11px] leading-tight">
										{network.chainName} chain
									</div>
								{/if}
							</div>
							{#if network.recommended}
								<span class="badge badge-primary badge-xs shrink-0 text-[10px]"
									>{$t('wallet.recommended')}</span
								>
							{/if}
							{#if selectedId === network.id}
								<span
									class="text-primary ml-auto shrink-0 text-xs {network.group === 'other'
										? 'mt-0.5'
										: ''}">●</span
								>
							{/if}
						</button>
					{/each}
					{#if activeGroup === 'other' && _loading}
						<div class="flex justify-center py-4">
							<span class="loading loading-spinner loading-sm"></span>
						</div>
					{:else if filteredNetworks.length === 0 && activeGroup === 'other'}
						<p class="text-base-content/50 px-2 py-4 text-center text-xs">
							{$t('wallet.receive.no_networks_found')}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
