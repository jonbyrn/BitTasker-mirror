<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { changellyService } from '$lib/services/changelly.service';
	import { isChangeallySwapsEnabled } from '$lib/services/kill-switch';

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
	// USDT section sorted: USDT0 entries first, then alphabetical
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
		// -- USDT group --
		{
			id: 'usdt0-arb',
			asset: 'USDT0',
			label: 'Arbitrum',
			icon: '/images/chains/arbitrum.png',
			network: 'usdt0-arbitrum',
			group: 'usdt',
			recommended: true
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
			id: 'usdt0-op',
			asset: 'USDT0',
			label: 'Optimism',
			icon: '/images/chains/optimism.png',
			network: 'usdt-optimism',
			group: 'usdt'
		},
		{
			id: 'usdt0-poly',
			asset: 'USDT0',
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
		},
		{
			id: 'usdt0-rsk',
			asset: 'USDT0',
			label: 'Rootstock',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			network: 'usdt0-rootstock',
			group: 'usdt'
		},
		{
			id: 'doc-rsk',
			asset: 'DOC',
			label: 'Dollar on Chain',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			network: 'doc-rootstock',
			group: 'usdt'
		}
	];

	/** Chain ID → display name. */
	const _CHAIN_NAME: Record<number, string> = {
		30: 'Rootstock (RSK)',
		31: 'Rootstock Testnet',
		42161: 'Arbitrum',
		421614: 'Arbitrum Testnet',
		56: 'Binance Smart Chain'
	};

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------

	let { receiveCurrency = 'rbtc', onChange = (_network: string) => {} } = $props<{
		receiveCurrency: 'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain' | 'tbtc-arb';
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

	/** Error message if Changelly currencies couldn't be loaded. */
	let _error = $state<string | null>(null);

	/** Dynamically discovered networks from Changelly API. */
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

	/** Always show the "Other" tab — it loads Changelly currencies dynamically. */
	let _showOtherGroup = $derived(true);

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

	let _lastCurrency: string | null = null;
	$effect(() => {
		if (_lastCurrency === receiveCurrency) return;
		_lastCurrency = receiveCurrency;
		// Map asset to group: all BTC-denominated assets → 'btc', usdt0-arb → 'usdt'
		const isBtcAsset =
			receiveCurrency === 'rbtc' ||
			receiveCurrency === 'wbtc-arb' ||
			receiveCurrency === 'btc-onchain' ||
			receiveCurrency === 'tbtc-arb';
		const g: 'btc' | 'usdt' = isBtcAsset ? 'btc' : 'usdt';
		activeGroup = g;
		const defs = SOURCE_NETWORKS.filter((n) => n.group === g);
		const direct = defs.find((n) => (isBtcAsset ? n.asset === 'rBTC' : n.recommended));
		const fallback = direct ?? defs[0];
		if (fallback) {
			selectedId = fallback.id;
			onChange(fallback.network);
		}
	});

	// Tickers already covered by the BTC and USDT groups — exclude from "Other"
	const EXCLUDED_TICKERS = new Set([
		'btc',
		'rbtc',
		'lbtc',
		'lightning',
		'usdt',
		'usdt0',
		'usdt-tron',
		'doc',
		'doc-rsk'
	]);

	// -----------------------------------------------------------------------
	// Dynamic chain sourcing — fetch Changelly supported currencies on mount
	onMount(async () => {
		if (!isChangeallySwapsEnabled()) {
			_error = 'Changelly swaps are not enabled.';
			_loading = false;
			return;
		}

		try {
			const currencies = await changellyService.getCurrencies();
			const enabledCurrencies = currencies.filter(
				(c) => c.enabled && !EXCLUDED_TICKERS.has(c.ticker.toLowerCase())
			);

			const discovered: SourceNetwork[] = [];
			const seen = new SvelteSet<string>();
			for (const c of enabledCurrencies) {
				const ticker = c.ticker.toUpperCase();
				const id = `changelly-${ticker}`;
				if (seen.has(id)) continue;
				seen.add(id);
				discovered.push({
					id,
					asset: ticker,
					label: c.name || ticker,
					icon: '',
					network: `changelly-${ticker.toLowerCase()}`,
					group: 'other',
					chainName: c.network || undefined
				});
			}

			discovered.sort(
				(a, b) =>
					a.asset.localeCompare(b.asset) || (a.chainName ?? '').localeCompare(b.chainName ?? '')
			);
			dynamicNetworks = discovered;
		} catch (err) {
			console.warn('[ReceiveSwapSelector] Failed to load Changelly currencies:', err);
			_error = err instanceof Error ? err.message : 'Failed to load currencies';
		} finally {
			_loading = false;
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
						onclick={() => selectGroup('usdt')}>$ USD</button
					>
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
					{:else if activeGroup === 'other' && _error}
						<p class="text-base-content/50 px-2 py-4 text-center text-xs">
							{$t('wallet.receive.other_tab_unavailable') ||
								'Other currencies are currently unavailable.'}
						</p>
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
