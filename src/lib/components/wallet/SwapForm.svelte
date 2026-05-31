<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { fly, fade, scale } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { type Route, type SourceWallet, type Destination } from '$lib/services/route-resolver';
	import {
		resolveRouteAsync,
		createInitialAsyncRouteResult,
		type AsyncRouteResult
	} from '$lib/services/route-resolver-async';
	import { startSwapChain } from '$lib/services/swap-chain.service';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { createDebug } from '$lib/utils/debug';
	import Drawer from '$lib/components/Drawer.svelte';
	import RoutePicker from '$lib/components/wallet/RoutePicker.svelte';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import AssetSelector from '$lib/components/wallet/AssetSelector.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';

	const d = createDebug('swap');
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------
	let { isOpen, onClose } = $props<{
		isOpen: boolean;
		onClose: () => void;
	}>();

	// -----------------------------------------------------------------------
	// Locale-aware formatters
	// -----------------------------------------------------------------------
	const satsFormatter = $derived(new Intl.NumberFormat($locale));
	const usdFormatter = $derived(
		new Intl.NumberFormat($locale, {
			style: 'currency',
			currency: 'USD'
		})
	);

	// -----------------------------------------------------------------------
	// Destination type enum
	// -----------------------------------------------------------------------
	type DestType = 'usdt0-arb' | 'rbtc-rsk' | 'wbtc-arb' | 'btc-onchain';

	interface DestOption {
		id: DestType;
		asset: string;
		label: string;
		description: string;
		icon: string;
		network: string;
		chainId: number;
		available: boolean;
	}

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------
	let sourceType = $state<SourceWallet>('rbtc');
	let destType = $state<DestType>('usdt0-arb');
	let amount = $state('');
	let selectedRouteId = $state('');
	let swapPhase = $state<'form' | 'confirm' | 'executing' | 'complete' | 'failed'>('form');
	let errorMessage = $state('');
	let swapResult = $state<{ txHash?: string; swapId?: string } | null>(null);
	let isFlipping = $state(false);
	let swapPercent = $state(0);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let slideDir = $state(-1); // 1 = forward, -1 = reverse; toggles each swap

	// -----------------------------------------------------------------------
	// Wallet accordion state
	// -----------------------------------------------------------------------
	let sourceWallet = $state<'builtin' | string>('builtin');
	let destWallet = $state<'builtin' | string>('builtin');
	let sourceExpand = $state(false);
	let sourceAssetExpand = $state(false);
	let destExpand = $state(false);
	let destAssetExpand = $state(false);

	let isConnectedSource = $derived(sourceWallet !== 'builtin');
	let isConnectedDest = $derived(destWallet !== 'builtin');

	// Restore persisted connected wallets on mount and re-establish live SDK
	// sessions for balance fetching. Delegates to the shared reconnect service.
	onMount(() => {
		reconnectPersistedWallets();
	});

	/** Source wallet address for route resolution */
	let sourceAddr = $derived.by(() => {
		if (!isConnectedSource) {
			if (sourceType === 'rbtc') return $walletStore.rsk.address ?? '';
			// Arbitrum EVM address — same as RSK (same private key)
			return $walletStore.arb?.address || $walletStore.rsk.address || '';
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === sourceWallet);
		return w?.address ?? '';
	});

	/** Destination wallet address for execution */
	let destAddr = $derived.by(() => {
		if (!isConnectedDest) {
			if (destType === 'btc-onchain') return getExternalBtcAddress();
			if (destType === 'rbtc-rsk') return $walletStore.rsk.address ?? '';
			// Cross-chain destinations use the same EVM address as RSK
			return $walletStore.arb?.address || $walletStore.rsk.address || '';
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === destWallet);
		return w?.address ?? '';
	});

	$effect(() => {
		d.log(
			'addrs: source=%s dest=%s srcWallet=%s destWallet=%s',
			sourceAddr?.substring(0, 10) || '(none)',
			destAddr?.substring(0, 10) || '(none)',
			sourceWallet,
			destWallet
		);
	});

	/** Format USD balance for a wallet in WalletSelector */
	function walletBalanceFor(walletId: string): string {
		if (walletId === 'builtin') {
			const sats = $walletStore.totalBalances.sats;
			const usdt = parseFloat($walletStore.arb?.formattedUsdt0Balance || '0');
			const usd = (sats / 100_000_000) * btcPrice.price + usdt;
			return usdFormatter.format(usd);
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === walletId);
		if (!w?.balances) return '$0.00';
		const btcSats = Number(w.balances.btc?.raw ?? 0) + Number(w.balances.rbtc?.raw ?? 0);
		const usdt = Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e18;
		const usd = (btcSats / 100_000_000) * btcPrice.price + usdt;
		return usdFormatter.format(usd);
	}

	// -----------------------------------------------------------------------
	// BTC wallet detection
	// -----------------------------------------------------------------------
	let hasExternalBtcWallet = $derived(
		(() => {
			if (destWallet === 'builtin') return false;
			const w = $connectedWalletsStore.wallets.find((cw) => cw.id === destWallet);
			if (!w) return false;
			return (
				(w.walletType === 'trezor' ||
					w.walletType === 'ledger' ||
					w.walletType === 'walletconnect') &&
				!!w.btcAddress
			);
		})()
	);

	/**
	 * Get external BTC wallet address for the destination.
	 * Uses the first connected wallet that has a BTC signer/address.
	 */
	function getExternalBtcAddress(): string {
		const handles = connectorRegistry.list();
		for (const handle of handles) {
			try {
				const signer = handle.bitcoinSigner;
				if (signer?.address) return signer.address;
			} catch {
				// Handle doesn't support BTC signing
			}
		}
		// Fallback: check connected wallets store
		const btcWallet = $connectedWalletsStore.wallets.find(
			(w) => w.walletType === 'trezor' || w.walletType === 'ledger'
		);
		return btcWallet?.address ?? '';
	}

	// -----------------------------------------------------------------------
	// Chain icon/asset data
	// -----------------------------------------------------------------------
	const CHAIN_RSK = {
		asset: 'rBTC',
		label: 'Rootstock',
		short: 'RSK',
		icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
		network: 'rootstock-bitcoin',
		chainId: 30
	};
	const CHAIN_ARB = {
		asset: 'USDT0',
		label: 'Arbitrum',
		short: 'ARB',
		icon: '/images/chains/Tether-USD.svg',
		network: 'usdt0-arb',
		chainId: 42161
	};

	const CHAIN_WBTC = {
		asset: 'WBTC',
		label: 'wBTC',
		short: 'WBTC',
		icon: '/images/chains/arbitrum.png',
		network: 'wbtc-arb',
		chainId: 42161 // Arbitrum mainnet
	};

	const CHAIN_BTC = {
		asset: 'BTC',
		label: 'Bitcoin',
		short: 'BTC',
		icon: '/images/chains/Bitcoin.svg',
		network: 'bitcoin',
		chainId: -1 // Bitcoin mainnet (not EVM)
	};

	// -----------------------------------------------------------------------
	// Destination options (computed from source)
	// -----------------------------------------------------------------------
	let destOptions = $derived.by<DestOption[]>(() => {
		const options: DestOption[] = [];

		if (sourceType === 'rbtc') {
			// rBTC → USDT on Arbitrum
			options.push({
				id: 'usdt0-arb',
				asset: CHAIN_ARB.asset,
				label: CHAIN_ARB.label,
				description: $t('wallet.swap.desc_rbtc_to_usdt'),
				icon: CHAIN_ARB.icon,
				network: CHAIN_ARB.network,
				chainId: CHAIN_ARB.chainId,
				available: true
			});

			// Same-wallet transfer: rBTC → rBTC (when source ≠ dest wallet)
			if (sourceWallet !== destWallet) {
				options.push({
					id: 'rbtc-rsk',
					asset: CHAIN_RSK.asset,
					label: CHAIN_RSK.label,
					description: $t('wallet.swap.desc_same_wallet_transfer'),
					icon: CHAIN_RSK.icon,
					network: CHAIN_RSK.network,
					chainId: CHAIN_RSK.chainId,
					available: true
				});
			}

			// rBTC → wBTC on Arbitrum
			options.push({
				id: 'wbtc-arb',
				asset: CHAIN_WBTC.asset,
				label: CHAIN_WBTC.label,
				description: $t('wallet.swap.desc_rbtc_to_wbtc'),
				icon: CHAIN_WBTC.icon,
				network: CHAIN_WBTC.network,
				chainId: CHAIN_WBTC.chainId,
				available: true
			});

			// rBTC → BTC on-chain (only if external BTC wallet, always last)
			options.push({
				id: 'btc-onchain',
				asset: CHAIN_BTC.asset,
				label: CHAIN_BTC.label,
				description: $t('wallet.swap.desc_rbtc_to_btc'),
				icon: CHAIN_BTC.icon,
				network: CHAIN_BTC.network,
				chainId: CHAIN_BTC.chainId,
				available: hasExternalBtcWallet
			});
		} else {
			// USDT → rBTC on RSK
			options.push({
				id: 'rbtc-rsk',
				asset: CHAIN_RSK.asset,
				label: CHAIN_RSK.label,
				description: $t('wallet.swap.desc_usdt_to_rbtc'),
				icon: CHAIN_RSK.icon,
				network: CHAIN_RSK.network,
				chainId: CHAIN_RSK.chainId,
				available: true
			});

			// USDT0 → wBTC on Arbitrum (same-chain swap)
			options.push({
				id: 'wbtc-arb',
				asset: CHAIN_WBTC.asset,
				label: CHAIN_WBTC.label,
				description: $t('wallet.swap.desc_usdt_to_wbtc'),
				icon: CHAIN_WBTC.icon,
				network: CHAIN_WBTC.network,
				chainId: CHAIN_WBTC.chainId,
				available: true
			});

			// Same-wallet transfer: USDT0 → USDT0 on Arbitrum (when source ≠ dest wallet)
			if (sourceWallet !== destWallet) {
				options.push({
					id: 'usdt0-arb',
					asset: CHAIN_ARB.asset,
					label: CHAIN_ARB.label,
					description: $t('wallet.swap.desc_same_wallet_transfer'),
					icon: CHAIN_ARB.icon,
					network: CHAIN_ARB.network,
					chainId: CHAIN_ARB.chainId,
					available: true
				});
			}
		}

		return options;
	});

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------
	let sourceAsset = $derived(sourceType === 'rbtc' ? 'rBTC' : 'USDT');
	let sourceIcon = $derived(
		sourceType === 'rbtc'
			? '/images/chains/Bitcoin-Rootstock-logo.webp'
			: '/images/chains/Tether-USD.svg'
	);

	/** Wallet balance in token units (rBTC or USDT0), read from the selected source wallet. */
	let walletBalanceToken = $derived(
		sourceType === 'rbtc' ? (sourceRbtcSats / 100_000_000).toFixed(6) : sourceUsdt0Usd.toFixed(6)
	);

	/** Actual BTC/USD price from Coinbase, fetched async. Default 0 until loaded. */
	let btcUsdPrice = $state(0);
	/** ETH/USD price for Arbitrum gas→sats conversion. */
	let ethUsdPrice = $state(0);
	/** Live gas price in wei from RPC (eth_gasPrice). */
	let rskGasPriceWei = $state(0n);
	let arbGasPriceWei = $state(0n);

	/**
	 * Gas limit in wei for the current transaction.
	 * For simple transfers: fetched from eth_estimateGas RPC.
	 * For contract calls: 500k (verified from real Symbiosis swap on RSK).
	 */
	let rsxGasLimit = $state(0n);

	// -----------------------------------------------------------------------
	// Live gas price fetching via RPC eth_gasPrice
	// -----------------------------------------------------------------------
	const RSK_RPC = 'https://public-node.rsk.co';
	const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

	async function fetchGasPrice(rpcUrl: string): Promise<bigint> {
		const resp = await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_gasPrice',
				params: [],
				id: 1
			})
		});
		if (!resp.ok) throw new Error(`RPC ${rpcUrl} returned ${resp.status}`);
		const data = (await resp.json()) as { result: string };
		return BigInt(data.result);
	}

	async function estimateDirectTransferGas(to: string, amountWei: string): Promise<bigint> {
		const resp = await fetch(RSK_RPC, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_estimateGas',
				params: [{ to, value: amountWei }],
				id: 1
			})
		});
		const data = (await resp.json()) as { result: string; error?: { message: string } };
		if (data.error) throw new Error(data.error.message);
		return BigInt(data.result);
	}

	async function refreshLiveFees() {
		d.log('refreshLiveFees: fetching gas prices + BTC/ETH rates');
		// Fetch gas prices in parallel from both chains
		const [rskResult, arbResult, btcResult, ethResult] = await Promise.allSettled([
			fetchGasPrice(RSK_RPC),
			fetchGasPrice(ARB_RPC),
			cryptoPriceService.getCurrentPrice('BTC'),
			cryptoPriceService.getCurrentPrice('ETH')
		]);

		if (rskResult.status === 'fulfilled') rskGasPriceWei = rskResult.value;
		if (arbResult.status === 'fulfilled') arbGasPriceWei = arbResult.value;
		if (btcResult.status === 'fulfilled') btcUsdPrice = btcResult.value;
		if (ethResult.status === 'fulfilled') ethUsdPrice = ethResult.value;

		d.log(
			'refreshLiveFees done: rskGas=%d gwei arbGas=%d gwei btc=$%s eth=$%s',
			Number(rskGasPriceWei) / 1e9,
			Number(arbGasPriceWei) / 1e9,
			btcUsdPrice || '?',
			ethUsdPrice || '?'
		);
	}

	// Fetch prices on mount + re-fetch when drawer opens
	onMount(async () => {
		await refreshLiveFees();
	});

	let _feeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!isOpen) return;
		// Re-fetch on drawer open (prices may have changed)
		_feeRefreshTimer = setTimeout(() => refreshLiveFees(), 300);
		return () => {
			if (_feeRefreshTimer) clearTimeout(_feeRefreshTimer);
		};
	});

	/** Convert amount string to source token units (handles sats→rBTC when source is rBTC) */
	let amountInTokenUnits = $derived.by(() => {
		const amt = parseFloat(amount);
		if (!Number.isFinite(amt) || amt <= 0) return 0;
		if (sourceType === 'rbtc') return amt / 100_000_000; // sats → rBTC
		return amt; // USDT
	});

	/** Wallet balance in display units (sats for rBTC, USDT for USDT) */
	let walletBalanceDisplay = $derived.by(() => {
		const num = parseFloat(walletBalanceToken);
		if (!Number.isFinite(num)) return '0';
		if (sourceType === 'rbtc') {
			return formatSats(Math.round(num * 100_000_000));
		}
		return usdFormatter.format(num);
	});

	/** Estimated output in destination token units, with cross-currency conversion */
	/** Format sats with USD equivalent: "5,000,000 Sats ≈ $5,000.00" */
	function satsUsd(sats: number): string {
		const s = formatSats(sats);
		if (btcUsdPrice <= 0) return `${s} ${$t('wallet.sats')}`;
		const usd = (sats / 100_000_000) * btcUsdPrice;
		return `${s} ${$t('wallet.sats')} ≈ ${usdFormatter.format(usd)}`;
	}

	/** Sync amount from percentage slider (works with display units) */
	function applyPercent(pct: number) {
		const bal = parseFloat(walletBalanceToken);
		if (!Number.isFinite(bal) || bal <= 0) return;
		swapPercent = pct;
		if (sourceType === 'rbtc') {
			// Amount in sats
			amount = Math.round((pct / 100) * bal * 100_000_000).toString();
		} else {
			amount = ((pct / 100) * bal).toFixed(6);
		}
	}

	/** Sync percentage from manual amount input */
	$effect(() => {
		const bal = parseFloat(walletBalanceToken);
		if (!Number.isFinite(bal) || bal <= 0 || amountInTokenUnits <= 0) {
			if (swapPercent !== 0) swapPercent = 0;
			return;
		}
		const pct = Math.round((amountInTokenUnits / bal) * 100);
		if (pct !== swapPercent && pct >= 0 && pct <= 100) {
			swapPercent = pct;
		}
	});

	let visibleDestOptions = $derived(destOptions.filter((o) => o.available));

	/** BTC on-chain balance from any connected wallet that supports BTC signing.
	 *  Hardware wallets don't implement fetchBalances(), so we fetch the balance
	 *  live from mempool.space using the wallet's btcAddress. */
	let externalBtcBalanceSats = $state(0);

	$effect(() => {
		const w = $connectedWalletsStore.wallets.find(
			(cw) =>
				(cw.walletType === 'trezor' ||
					cw.walletType === 'ledger' ||
					cw.walletType === 'walletconnect') &&
				!!cw.btcAddress
		);
		const addr = w?.btcAddress;
		if (!addr) {
			externalBtcBalanceSats = 0;
			return;
		}

		// Check stored balance first (set by a connector that does implement fetchBalances)
		if (w?.balances?.btc?.raw) {
			externalBtcBalanceSats = Number(w.balances.btc.raw);
			return;
		}

		// Fetch from mempool.space
		let cancelled = false;
		(async () => {
			try {
				const resp = await fetch(`https://mempool.space/api/address/${addr}`);
				if (cancelled) return;
				const data = (await resp.json()) as {
					chain_stats?: { funded_txo_sum: number; spent_txo_sum: number };
					mempool_stats?: { funded_txo_sum: number; spent_txo_sum: number };
				};
				const confirmed =
					(data.chain_stats?.funded_txo_sum ?? 0) - (data.chain_stats?.spent_txo_sum ?? 0);
				const mempool =
					(data.mempool_stats?.funded_txo_sum ?? 0) - (data.mempool_stats?.spent_txo_sum ?? 0);
				const total = confirmed + mempool;
				if (!cancelled) externalBtcBalanceSats = total;
			} catch {
				if (!cancelled) externalBtcBalanceSats = 0;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// -----------------------------------------------------------------------
	// Wallet-aware balance helpers — source/dest wallet changes update these
	// -----------------------------------------------------------------------

	/** rBTC balance in sats for the currently selected source wallet. */
	let sourceRbtcSats = $derived.by(() => {
		if (!isConnectedSource) {
			return Math.round(parseFloat($walletStore.rsk?.formattedBalance || '0') * 100_000_000);
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === sourceWallet);
		return Number(w?.balances?.rbtc?.raw ?? 0);
	});

	/** USDT0 balance in USD for the currently selected source wallet. */
	let sourceUsdt0Usd = $derived.by(() => {
		if (!isConnectedSource) {
			return parseFloat($walletStore.arb?.formattedUsdt0Balance || '0');
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === sourceWallet);
		return Number(w?.balances?.['usdt0-arb']?.raw ?? 0) / 1e18;
	});

	/** rBTC balance in sats for the currently selected destination wallet. */
	let destRbtcSats = $derived.by(() => {
		if (!isConnectedDest) {
			return Math.round(parseFloat($walletStore.rsk?.formattedBalance || '0') * 100_000_000);
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === destWallet);
		return Number(w?.balances?.rbtc?.raw ?? 0);
	});

	/** USDT0 balance in USD for the currently selected destination wallet. */
	let destUsdt0Usd = $derived.by(() => {
		if (!isConnectedDest) {
			return parseFloat($walletStore.arb?.formattedUsdt0Balance || '0');
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === destWallet);
		return Number(w?.balances?.['usdt0-arb']?.raw ?? 0) / 1e18;
	});

	/** WBTC balance in sats for the currently selected destination wallet. */
	let destWbtcSats = $derived.by(() => {
		if (!isConnectedDest) {
			return Math.round(parseFloat($walletStore.arb?.formattedWbtcBalance || '0') * 100_000_000);
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === destWallet);
		// WBTC has 18 decimals
		const rawWei = Number(w?.balances?.wbtc?.raw ?? 0);
		if (rawWei <= 0) return 0;
		// 1 WBTC = 1e18 wei, 1 BTC = 1e8 sats → wei→sats = rawWei / 1e10
		return Math.round(rawWei / 10_000_000_000);
	});

	/** WBTC balance in sats for the currently selected source wallet. */
	let sourceWbtcSats = $derived.by(() => {
		if (!isConnectedSource) {
			return Math.round(parseFloat($walletStore.arb?.formattedWbtcBalance || '0') * 100_000_000);
		}
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === sourceWallet);
		const rawWei = Number(w?.balances?.wbtc?.raw ?? 0);
		if (rawWei <= 0) return 0;
		// 1 WBTC = 1e18 wei, 1 BTC = 1e8 sats → wei→sats = rawWei / 1e10
		return Math.round(rawWei / 10_000_000_000);
	});

	let destAssets = $derived<AssetOption[]>(
		visibleDestOptions.map((o) => ({
			id: o.id,
			label:
				o.asset === 'USDT0'
					? 'USD (Arbitrum)'
					: o.asset === 'rBTC'
						? 'Bitcoin (rBTC)'
						: o.asset === 'WBTC'
							? 'Bitcoin (wBTC)'
							: o.id === 'btc-onchain'
								? 'Bitcoin (BTC)'
								: `${o.asset}`,
			icon: o.icon,
			subLabel:
				o.id === 'usdt0-arb'
					? 'USDT0 on Arbitrum'
					: o.id === 'wbtc-arb'
						? 'Wrapped BTC on Arbitrum'
						: o.id === 'rbtc-rsk'
							? sourceWallet !== destWallet
								? `Send to ${$connectedWalletsStore.wallets.find((w) => w.id === destWallet)?.walletName || 'wallet'}`
								: o.description
							: o.description,
			available: o.available,
			balance:
				o.id === 'usdt0-arb'
					? `$${destUsdt0Usd.toFixed(2)}`
					: o.id === 'rbtc-rsk'
						? formatSats(destRbtcSats) + ' Sats'
						: o.id === 'wbtc-arb'
							? formatSats(destWbtcSats) + ' Sats'
							: o.id === 'btc-onchain'
								? formatSats(externalBtcBalanceSats) + ' Sats'
								: undefined,
			balanceSub:
				o.id === 'rbtc-rsk'
					? `≈ $${((destRbtcSats / 100_000_000) * btcPrice.price).toFixed(2)}`
					: o.id === 'wbtc-arb'
						? `≈ $${((destWbtcSats / 100_000_000) * btcPrice.price).toFixed(2)}`
						: o.id === 'btc-onchain'
							? `≈ $${((externalBtcBalanceSats / 100_000_000) * btcPrice.price).toFixed(2)}`
							: undefined
		}))
	);

	let sourceAssets = $derived<AssetOption[]>([
		{
			id: 'rbtc',
			label: 'Bitcoin (rBTC)',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			subLabel: 'Bitcoin on Rootstock',
			balance: formatSats(sourceRbtcSats) + ' Sats',
			balanceSub: `≈ $${((sourceRbtcSats / 100_000_000) * btcPrice.price).toFixed(2)}`
		},
		{
			id: 'usdt0-arb',
			label: 'USD (Arbitrum)',
			icon: '/images/chains/Tether-USD.svg',
			subLabel: 'USDT0 on Arbitrum',
			balance: `$${sourceUsdt0Usd.toFixed(2)}`
		},
		{
			id: 'wbtc-arb',
			label: 'Bitcoin (wBTC)',
			icon: '/images/chains/arbitrum.png',
			subLabel: 'Wrapped BTC on Arbitrum',
			balance: formatSats(sourceWbtcSats) + ' Sats',
			balanceSub: `≈ $${((sourceWbtcSats / 100_000_000) * btcPrice.price).toFixed(2)}`
		}
	]);

	let selectedDest = $derived(
		visibleDestOptions.find((o) => o.id === destType) || visibleDestOptions[0]
	);

	/** Build the appropriate Destination object for the route resolver */
	let routeDest = $derived.by<Destination>(() => {
		if (!selectedDest) {
			return { type: 'address', chainId: 56, address: '' };
		}
		if (selectedDest.id === 'btc-onchain') {
			return {
				type: 'invoice',
				network: 'onchain',
				invoice: getExternalBtcAddress() || ''
			};
		}
		return {
			type: 'address',
			chainId: selectedDest.chainId,
			address: ''
		};
	});

	let asyncRouteResult = $state<AsyncRouteResult>(createInitialAsyncRouteResult());
	let routeLoading = $state(false);
	let _routeTimer: ReturnType<typeof setTimeout> | null = null;

	/** Live API routes from Symbiosis + LI.FI. No hardcoded fallback. */
	let liveRoutes = $derived(asyncRouteResult.routes);

	let sortedRoutes = $derived(
		// Routes with live gas data first, then sort by fee
		[...liveRoutes].sort((a, b) => {
			const aHasGas = a.gasCostWei ? 0 : 1;
			const bHasGas = b.gasCostWei ? 0 : 1;
			if (aHasGas !== bHasGas) return aHasGas - bHasGas;
			return a.totalFeePercent - b.totalFeePercent;
		})
	);

	let activeRoute = $derived(
		sortedRoutes.find((r) => r.id === selectedRouteId) || sortedRoutes[0] || null
	);

	// Debounced async route fetch when source/dest/amount changes
	$effect(() => {
		if (_routeTimer) clearTimeout(_routeTimer);

		if (amountInTokenUnits <= 0) {
			asyncRouteResult = createInitialAsyncRouteResult();
			routeLoading = false;
			return;
		}

		routeLoading = true;
		const source = sourceType;
		const dest = routeDest;
		const amt = amountInTokenUnits.toString();

		_routeTimer = setTimeout(async () => {
			d.log(
				'routeResolve: source=%s dest=%s amount=%s addr=%s',
				source,
				selectedDest?.id,
				amt,
				sourceAddr.substring(0, 10)
			);
			try {
				const result = await resolveRouteAsync(source, dest, amt, sourceAddr);
				d.log('routeResolve: got %d routes', result.routes.length);
				asyncRouteResult = result;
			} catch (err) {
				d.warn('routeResolve failed: %s', err instanceof Error ? err.message : String(err));
				// Keep existing routes on API error
			}
			routeLoading = false;
		}, 400);

		return () => {
			if (_routeTimer) clearTimeout(_routeTimer);
		};
	});

	let estimatedOutput = $derived.by(() => {
		if (!activeRoute || amountInTokenUnits <= 0) return '0';
		const fee = 1 - activeRoute.totalFeePercent / 100;
		// Network gas fee in source token units — only affects rBTC source
		// (on Arbitrum, gas is paid in ETH, not the swap token)
		const gasInSourceUnits = sourceType === 'rbtc' ? networkFeeSats / 100_000_000 : 0;
		const sourceAmt = Math.max(0, amountInTokenUnits - gasInSourceUnits);

		let output: number;
		if (sourceType === 'rbtc' && selectedDest?.id === 'usdt0-arb') {
			// rBTC → USDT: rBTC ≈ BTC, so rBTC amount * BTC/USD price * fee
			output = sourceAmt * btcUsdPrice * fee;
		} else if (sourceType === 'usdt0-arb' && selectedDest?.id === 'rbtc-rsk') {
			// USDT → rBTC: USDT amount / BTC/USD price * fee
			output = btcUsdPrice > 0 ? (sourceAmt / btcUsdPrice) * fee : 0;
		} else if (sourceType === 'rbtc' && selectedDest?.id === 'wbtc-arb') {
			// rBTC → wBTC: ~1:1 in BTC terms via bridge
			output = sourceAmt * fee;
		} else if (sourceType === 'usdt0-arb' && selectedDest?.id === 'wbtc-arb') {
			// USDT0 → wBTC: same-chain swap, USDT / BTC price * fee
			output = btcUsdPrice > 0 ? (sourceAmt / btcUsdPrice) * fee : 0;
		} else if (sourceType === 'rbtc' && selectedDest?.id === 'btc-onchain') {
			// rBTC → BTC: ~1:1 in BTC terms, output in BTC token units
			output = sourceAmt * fee;
		} else {
			output = sourceAmt * fee;
		}
		return output.toFixed(6);
	});

	let amountSats = $derived.by(() => {
		if (amountInTokenUnits <= 0) return 0;
		if (sourceType === 'rbtc') {
			return Math.round(amountInTokenUnits * 100_000_000);
		}
		// USDT → approximate sats via BTC/USD price
		return btcUsdPrice > 0 ? Math.round((amountInTokenUnits / btcUsdPrice) * 100_000_000) : 0;
	});

	let isInsufficientBalance = $derived(
		amountInTokenUnits > 0 && Number.isFinite(parseFloat(walletBalanceToken))
			? amountInTokenUnits > parseFloat(walletBalanceToken)
			: false
	);

	let isValidAmount = $derived(amountInTokenUnits > 0 && !isInsufficientBalance);
	let canSwap = $derived(isValidAmount && activeRoute !== null && swapPhase === 'form');

	let routePickerNetwork = $derived(selectedDest?.network ?? null);

	/**
	 * Estimated network (gas) fee in sats for EVERY on-chain transaction.
	 * Uses live gas prices from eth_gasPrice RPC (RSK + Arbitrum).
	 * If the active route carries gasCostWei from LI.FI/Symbiosis, that exact
	 * value is used instead of the estimate.
	 */
	let networkFeeSats = $derived.by(() => {
		if (amountSats <= 0) return 0;
		if (!selectedDest) return 0;

		// Use exact gas from live API quote when available (LI.FI / Symbiosis)
		if (activeRoute?.gasCostWei) {
			const gasWei = BigInt(activeRoute.gasCostWei);
			const sats = Number(gasWei / 10_000_000_000n);
			d.log(
				'networkFeeSats: using live gas from route=%s gasWei=%s → %d sats',
				activeRoute.label,
				activeRoute.gasCostWei,
				sats
			);
			return sats;
		}
		d.log(
			'networkFeeSats: no live gas, route=%s gasCostWei=%s',
			activeRoute?.label || 'none',
			activeRoute?.gasCostWei || 'null'
		);

		const isSimpleTransfer =
			(sourceType === 'rbtc' && destType === 'rbtc-rsk') ||
			(sourceType === 'usdt0-arb' && destType === 'usdt0-arb');

		// RSK source
		if (sourceType === 'rbtc') {
			const gasPrice = rskGasPriceWei > 0n ? rskGasPriceWei : 65_000_000n;
			const gasLimit = rsxGasLimit > 0n ? rsxGasLimit : isSimpleTransfer ? 21_000n : 500_000n;
			return Number((gasLimit * gasPrice) / 10_000_000_000n);
		}

		// Arbitrum L2 source — gas is paid in ETH, convert to sats-equivalent
		if (sourceType === 'usdt0-arb') {
			const gasLimit = isSimpleTransfer ? 65_000n : 300_000n;
			const gasPrice = arbGasPriceWei > 0n ? arbGasPriceWei : 30_000_000n;
			const gasCostWei = gasLimit * gasPrice;
			const ethPrice = ethUsdPrice > 0 ? ethUsdPrice : 2500;
			const btcPrice = btcUsdPrice > 0 ? btcUsdPrice : 74000;
			const gasCostEth = Number(gasCostWei) / 1e18;
			const gasCostSats = ((gasCostEth * ethPrice) / btcPrice) * 100_000_000;
			return Math.round(Math.max(gasCostSats, 1));
		}

		return 0;
	});

	/**
	 * When a simple same-chain transfer is detected, estimate the actual
	 * gas limit via eth_estimateGas on the RSK public node.
	 */
	$effect(() => {
		const dest = destAddr;
		if (!dest || amountInTokenUnits <= 0) return;
		const isSimpleTransfer =
			(sourceType === 'rbtc' && destType === 'rbtc-rsk') ||
			(sourceType === 'usdt0-arb' && destType === 'usdt0-arb');
		if (!isSimpleTransfer) {
			// Contract call — use verified 500k gas (real Symbiosis swap uses ~498k)
			rsxGasLimit = 500_000n;
			return;
		}
		// Simple transfer — fetch from RPC
		let cancelled = false;
		const amountWei = BigInt(Math.round(amountInTokenUnits * 1e18)).toString();
		estimateDirectTransferGas(dest, amountWei)
			.then((gas) => {
				if (!cancelled && gas > 0n) rsxGasLimit = gas;
			})
			.catch(() => {
				if (!cancelled) rsxGasLimit = 21_000n; // fallback
			});
		return () => {
			cancelled = true;
		};
	});

	/**
	 * Swap (provider) fee in sats from the selected route.
	 * Uses LI.FI itemized fees when available, falls back to route percentage.
	 * Zero for direct same-chain transfers (no swap involved).
	 */
	let swapFeeSats = $derived.by(() => {
		if (amountSats <= 0) return 0;
		if (!activeRoute) return 0;

		// Use LI.FI's itemized fee data when present
		if (activeRoute.feeCosts && activeRoute.feeCosts.length > 0) {
			let totalSats = 0;
			for (const f of activeRoute.feeCosts) {
				try {
					const amt = BigInt(f.amount || '0');
					if (amt <= 0n) continue;
					// LI.FI fees in source token wei → /1e10 → sats
					if (amt > 1_000_000_000n) {
						totalSats += Number(amt / 10_000_000_000n);
					} else {
						// Small fees in destination token units → convert via BTC price
						const usdtAmt = Number(amt) / 1_000_000;
						if (btcUsdPrice > 0) totalSats += Math.round((usdtAmt / btcUsdPrice) * 100_000_000);
					}
				} catch {
					/* skip malformed amounts */
				}
			}
			if (totalSats > 0) return totalSats;
		}

		if (activeRoute.totalFeePercent <= 0) return 0;
		return Math.round(amountSats * (activeRoute.totalFeePercent / 100));
	});

	// Sync destType when source changes
	$effect(() => {
		const available = visibleDestOptions;
		if (available.length > 0 && !available.find((o) => o.id === destType)) {
			d.log(
				'destType auto-selected: %s → %s (options: %s)',
				destType,
				available[0]!.id,
				available.map((o) => o.id).join(',')
			);
			destType = available[0]!.id;
		}
	});

	// Auto-select cheapest route only when no route is selected yet
	$effect(() => {
		if (sortedRoutes.length > 0 && !selectedRouteId) {
			const cheapest = sortedRoutes[0];
			if (cheapest) {
				selectedRouteId = cheapest.id;
			}
		}
	});

	// Reset when drawer opens
	$effect(() => {
		if (!isOpen) return;
		selectedRouteId = '';
		errorMessage = '';
	});

	// -----------------------------------------------------------------------
	// Methods
	// -----------------------------------------------------------------------
	function swapDirection() {
		triggerHaptic(ImpactStyle.Light);
		isFlipping = true;
		d.log(
			'swapDirection: flipping from %s → %s',
			sourceType,
			sourceType === 'rbtc' ? 'usdt0-arb' : 'rbtc'
		);
		setTimeout(() => (isFlipping = false), 300);
		slideDir *= -1; // reverse slide direction each swap

		if (sourceType === 'rbtc') {
			sourceType = 'usdt0-arb';
			destType = 'rbtc-rsk';
		} else {
			sourceType = 'rbtc';
			destType = 'usdt0-arb';
		}
		amount = '';
		swapPercent = 0;
		selectedRouteId = '';
		errorMessage = '';
		swapPhase = 'form';
	}

	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		swapPercent = 100;
		if (sourceType === 'rbtc') {
			amount = Math.round(parseFloat(walletBalanceToken) * 100_000_000).toString();
		} else {
			amount = walletBalanceToken;
		}
	}

	function handleKeyPress(e: KeyboardEvent) {
		const allowedKeys = [
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8',
			'9',
			'.',
			'Backspace',
			'Delete',
			'Tab',
			'Enter',
			'ArrowLeft',
			'ArrowRight'
		];
		const isControlKey = e.ctrlKey || e.metaKey || e.altKey;
		if (!allowedKeys.includes(e.key) && !isControlKey) {
			e.preventDefault();
		}
		const currentValue = (e.target as HTMLInputElement).value;
		if (e.key === '.' && currentValue.includes('.')) {
			e.preventDefault();
		}
	}

	function goToConfirm() {
		if (!canSwap) return;
		triggerHaptic(ImpactStyle.Medium);
		swapPhase = 'confirm';
		errorMessage = '';
	}

	function cancelConfirm() {
		swapPhase = 'form';
		errorMessage = '';
	}

	function resetForm() {
		// Guard: don't reset mid-execution
		if (swapPhase === 'executing') return;
		amount = '';
		swapPercent = 0;
		selectedRouteId = '';
		swapPhase = 'form';
		errorMessage = '';
		swapResult = null;
	}

	function handleClose() {
		// Block close during swap execution — prevent orphaning swap state
		if (swapPhase === 'executing') return;
		resetForm();
		onClose();
	}

	async function executeSwap() {
		// Double-execution guard: only allow from confirm phase
		if (swapPhase !== 'confirm') return;
		if (!activeRoute || !amount || isInsufficientBalance) return;

		swapPhase = 'executing';
		errorMessage = '';
		triggerHaptic(ImpactStyle.Heavy);

		d.log(
			'executeSwap: source=%s dest=%s amount=%s sourceAddr=%s destAddr=%s isDirect=%s',
			sourceType,
			destType,
			amountInTokenUnits,
			sourceAddr.substring(0, 10),
			destAddr.substring(0, 10),
			isDirectTransfer
		);

		// Get destination address from selected wallet
		const destAddress = destAddr;

		if (!destAddress) {
			errorMessage = $t('wallet.swap.error.no_dest_address');
			swapPhase = 'failed';
			return;
		}

		// Build proper destination with the actual user address
		const execDest: Destination =
			selectedDest?.id === 'btc-onchain'
				? { type: 'invoice', network: 'onchain', invoice: destAddress }
				: {
						type: 'address',
						chainId: selectedDest?.chainId ?? 42161, // Arbitrum default (was 56 BSC)
						address: destAddress
					};

		// Amount in source token units (not display units like sats)
		const execAmount = amountInTokenUnits.toString();

		// Pass connected wallet ID so swap-chain uses the correct signer
		const connectedSourceId = isConnectedSource ? sourceWallet : null;
		d.log(
			'executeSwap: calling startSwapChain with connectedWalletId=%s',
			connectedSourceId || 'null (built-in)'
		);

		const { data: result, error } = await startSwapChain(
			activeRoute,
			sourceType,
			execDest,
			execAmount,
			connectedSourceId
		);

		if (error || !result) {
			d.error('executeSwap FAILED: %s', error?.message || 'no result');
			errorMessage = error?.message || $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
			return;
		}

		if (result.phase === 'COMPLETE') {
			swapResult = {
				swapId: result.swap1Id ?? undefined,
				txHash: result.swap1Id ?? undefined
			};
			d.log(
				'executeSwap COMPLETE: txHash=%s swapId=%s',
				result.swap1Id?.substring(0, 16),
				result.swap2Id?.substring(0, 16)
			);
			swapPhase = 'complete';
			triggerHaptic(ImpactStyle.Heavy);
		} else if (result.phase === 'FAILED' || result.phase === 'PARTIAL') {
			errorMessage = result.error || $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
			triggerHaptic(ImpactStyle.Heavy);
		} else {
			// Unhandled phase — treat as still pending
			errorMessage = $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
		}
	}

	function getProviderLabel(route: Route): string {
		const service = route.hops[0]?.service;
		switch (service) {
			case 'lifi':
				return 'LI.FI';
			case 'symbiosis':
				return 'Symbiosis';
			case 'boltz':
				return 'Boltz';
			case 'changelly':
				return 'Changelly';
			default:
				return route.label;
		}
	}

	// -----------------------------------------------------------------------
	// Helpers for confirm/success screens
	// -----------------------------------------------------------------------

	/** True when this is a same-asset wallet-to-wallet send (not a swap). */
	let isDirectTransfer = $derived(
		(sourceType === 'rbtc' && destType === 'rbtc-rsk') ||
			(sourceType === 'usdt0-arb' && destType === 'usdt0-arb')
	);

	/** Human-readable wallet name for source/dest display. */
	function walletLabel(id: string): string {
		if (id === 'builtin') return 'BitTasker';
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === id);
		return w?.walletName || id;
	}

	/** Truncated address snippet. */
	function addrSnippet(addr: string): string {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	}

	/** Source wallet label + address for confirm/success cards. */
	let sourceWalletInfo = $derived.by(() => {
		const label = walletLabel(sourceWallet);
		const addr = sourceAddr;
		return addr ? `${label} (${addrSnippet(addr)})` : label;
	});

	/** Destination wallet label + address. */
	let destWalletInfo = $derived.by(() => {
		const label = walletLabel(destWallet);
		const addr = destAddr;
		return addr ? `${label} (${addrSnippet(addr)})` : label;
	});
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.swap.swap_assets')}
	position="right"
	isScrollable={true}
	isSubmitting={swapPhase === 'executing'}
>
	<div class="flex flex-col gap-4">
		{#if swapPhase === 'form'}
			<div transition:fly={{ y: 10, duration: 200 }}>
				<div class="flex flex-col gap-4">
					<!-- From: Wallet Accordion -->
					<WalletSelector
						label={$t('wallet.from') + ':'}
						selectedId={sourceWallet}
						onSelect={(id) => (sourceWallet = id)}
						builtinBalance={walletBalanceFor('builtin')}
						connectedWallets={$connectedWalletsStore.wallets}
						{walletBalanceFor}
						expanded={sourceExpand}
						onToggle={() => (sourceExpand = !sourceExpand)}
					/>

					<!-- Source Asset -->
					<AssetSelector
						selectedId={sourceType}
						onSelect={(id) => {
							if (id !== sourceType) swapDirection();
						}}
						assets={sourceAssets}
						expanded={sourceAssetExpand}
						onToggle={() => (sourceAssetExpand = !sourceAssetExpand)}
					/>

					<!-- Swap Direction Button -->
					<div class="relative flex items-center justify-center py-1">
						<div class="border-base-300 absolute inset-x-0 top-1/2 border-t"></div>
						<button
							type="button"
							class="btn btn-circle btn-outline bg-base-100 relative z-10 min-h-[44px] min-w-[44px] touch-manipulation border-2 transition-transform duration-300 active:scale-95 sm:min-h-[48px] sm:min-w-[48px]"
							class:rotate-180={isFlipping}
							onclick={() => {
								// Swap wallets too
								const tmpWallet = sourceWallet;
								sourceWallet = destWallet;
								destWallet = tmpWallet;
								swapDirection();
							}}
							aria-label={$t('wallet.swap.swap_direction')}
						>
							<svg
								class="h-5 w-5 sm:h-6 sm:w-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
								/>
							</svg>
						</button>
					</div>

					<!-- To: Wallet Accordion -->
					<WalletSelector
						label={$t('wallet.to') + ':'}
						selectedId={destWallet}
						onSelect={(id) => (destWallet = id)}
						builtinBalance={walletBalanceFor('builtin')}
						connectedWallets={$connectedWalletsStore.wallets}
						{walletBalanceFor}
						expanded={destExpand}
						onToggle={() => (destExpand = !destExpand)}
					/>

					<!-- Destination Asset Selector (compact accordion) -->
					<AssetSelector
						selectedId={destType}
						onSelect={(id) => {
							destType = id as DestType;
							selectedRouteId = '';
						}}
						assets={destAssets}
						expanded={destAssetExpand}
						onToggle={() => (destAssetExpand = !destAssetExpand)}
					/>

					<!-- Amount Input -->
					<div class="form-control">
						<label for="swap-amount" class="label flex justify-between px-1 py-1">
							<span class="label-text text-sm sm:text-base">
								{#if sourceType === 'rbtc' && amountSats > 0}
									{satsFormatter.format(amountSats)}
									{$t('wallet.sats')}
									({usdFormatter.format((amountSats / 100_000_000) * btcPrice.price)})
								{:else}
									{sourceType === 'rbtc' ? $t('wallet.sats') : 'USDT'}
								{/if}
							</span>
							<span class="label-text-alt text-xs sm:text-sm">
								{$t('wallet.available_balance')}: {sourceType === 'rbtc'
									? satsUsd(Math.round(parseFloat(walletBalanceToken) * 100_000_000))
									: `${walletBalanceDisplay}`}
							</span>
						</label>
						<div class="join w-full">
							<input
								id="swap-amount"
								type="number"
								class="input input-bordered join-item min-h-[48px] flex-1 rounded-r-none text-base sm:min-h-[52px]"
								placeholder={sourceType === 'rbtc' ? '0' : '0.00'}
								bind:value={amount}
								onkeypress={handleKeyPress}
								min="0"
								step={sourceType === 'rbtc' ? '1' : '0.000001'}
								inputmode="numeric"
							/>
							<button
								type="button"
								class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-l-none active:scale-95 sm:min-h-[52px]"
								onclick={setMaxAmount}
							>
								<span class="text-xs sm:text-sm">{$t('wallet.max')}</span>
							</button>
						</div>
					</div>

					<!-- Percent Slider -->
					<div class="form-control py-2">
						<div class="flex items-center gap-3">
							<span class="text-primary min-w-[3ch] text-right text-sm font-semibold"
								>{swapPercent}%</span
							>
							<input
								id="swap-percent"
								type="range"
								min="0"
								max="100"
								step="1"
								value={swapPercent}
								class="range range-primary range-sm flex-1"
								oninput={(e) => {
									const pct = parseInt((e.target as HTMLInputElement).value);
									applyPercent(pct);
								}}
							/>
						</div>
					</div>

					<!-- RoutePicker — always visible -->
					<RoutePicker
						routes={sortedRoutes}
						{selectedRouteId}
						onSelect={(id: string) => (selectedRouteId = id)}
						btcPrice={btcUsdPrice}
						network={routePickerNetwork}
						{amountSats}
						{networkFeeSats}
						isLoadingFee={routeLoading}
						hasAddress={true}
						hasAmount={amountSats > 0}
					/>
					<!-- Total Card — full fee breakdown -->
					{#if activeRoute && selectedDest && amountInTokenUnits > 0}
						<div
							class="bg-primary/5 border-primary/20 flex flex-col gap-2 rounded-xl border-2 p-3 sm:p-4"
							transition:fade={{ duration: 200 }}
						>
							<!-- Total Sent -->
							<div class="flex items-center justify-between text-sm">
								<span class="text-base-content/60">{$t('wallet.swap.total_sent')}</span>
								<span class="font-semibold tabular-nums">
									{sourceType === 'rbtc'
										? satsUsd(amountSats)
										: usdFormatter.format(amountInTokenUnits)}
								</span>
							</div>

							<!-- Fee rows -->
							{#if networkFeeSats > 0 || swapFeeSats > 0}
								<div class="border-base-200 border-t pt-2">
									{#if networkFeeSats > 0}
										{@const gasUsd = (networkFeeSats / 100_000_000) * btcUsdPrice}
										<div class="text-base-content/60 flex items-center justify-between text-xs">
											<span>{$t('wallet.swap.subtract_network_fee')}</span>
											<span class="tabular-nums"
												>−{formatSats(networkFeeSats)}
												{$t('wallet.sats')}
												{#if gasUsd >= 0.01}≈ ${gasUsd.toFixed(2)}{/if}</span
											>
										</div>
									{/if}
									{#if swapFeeSats > 0}
										{@const swapUsd = (swapFeeSats / 100_000_000) * btcUsdPrice}
										<div class="text-base-content/60 flex items-center justify-between text-xs">
											<span
												>{$t('wallet.swap.subtract_swap_fee')} ({activeRoute.totalFeePercent}%)</span
											>
											<span class="tabular-nums"
												>−{formatSats(swapFeeSats)}
												{$t('wallet.sats')}
												{#if swapUsd >= 0.01}≈ ${swapUsd.toFixed(2)}{/if}</span
											>
										</div>
									{/if}
								</div>
							{/if}

							<!-- You Receive -->
							<div class="border-base-200 flex items-center justify-between border-t pt-2">
								<span class="text-sm font-medium">{$t('wallet.swap.you_receive')}</span>
								<div class="text-right">
									<div class="text-base font-bold tabular-nums sm:text-lg">
										{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain' || selectedDest.id === 'wbtc-arb'}
											{satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
										{:else}
											{usdFormatter.format(parseFloat(estimatedOutput))}
										{/if}
									</div>
									<div class="text-base-content/50 text-xs">
										{$t('wallet.swap.estimated_time')}: {activeRoute.estimatedTime}
									</div>
								</div>
							</div>
						</div>
					{:else if activeRoute && selectedDest}
						<div
							class="bg-primary/5 border-primary/20 flex items-center gap-3 rounded-xl border-2 p-3 sm:p-4"
							transition:fade={{ duration: 200 }}
						>
							<div class="min-w-0 flex-1">
								<div class="text-base-content/60 text-xs sm:text-sm">
									{$t('wallet.swap.estimated_output')}
								</div>
								<div class="text-base font-bold sm:text-lg">
									{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain' || selectedDest.id === 'wbtc-arb'}
										{satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
									{:else}
										{usdFormatter.format(parseFloat(estimatedOutput))}
									{/if}
								</div>
							</div>
							<div class="shrink-0 text-right">
								<div class="text-base-content/60 text-xs">
									{$t('wallet.swap.estimated_time')}
								</div>
								<div class="text-sm font-semibold">
									{activeRoute.estimatedTime}
								</div>
							</div>
						</div>
					{:else}
						<div
							class="bg-primary/5 border-primary/20 flex items-center rounded-xl border-2 p-3 sm:p-4"
							transition:fade={{ duration: 200 }}
						>
							<span class="text-base-content/30 text-sm"
								>{$t('wallet.swap.enter_amount_for_quote')}</span
							>
						</div>
					{/if}

					<!-- Insufficient balance -->
					{#if isInsufficientBalance}
						<div class="alert alert-outline alert-error py-2 sm:py-3">
							<span class="text-xs sm:text-sm">
								{$t('wallet.swap.insufficient_balance')}
							</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Confirm Phase -->
		{#if swapPhase === 'confirm' && activeRoute && selectedDest}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col gap-4">
				<!-- Context-aware header -->
				<div class="flex items-center gap-2">
					{#if isDirectTransfer}
						<svg
							class="text-info h-5 w-5 shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
							/></svg
						>
					{/if}
					<h4 class="text-base font-semibold sm:text-lg">
						{isDirectTransfer ? $t('wallet.swap.confirm_send') : $t('wallet.swap.confirm_swap')}
					</h4>
				</div>
				{#if isDirectTransfer}
					<p class="text-base-content/60 text-xs sm:text-sm">
						{$t('wallet.swap.direct_transfer_note')}
					</p>
				{/if}

				<!-- Source Card -->
				<div class="bg-base-200 flex items-center gap-3 rounded-xl p-3 sm:p-4">
					<div class="relative shrink-0">
						<img
							src={sourceIcon}
							alt={sourceAsset}
							class="h-10 w-10 rounded-full sm:h-12 sm:w-12"
						/>
						{#if sourceType === 'usdt0-arb'}
							<img
								src="/images/chains/arbitrum.png"
								alt="Arbitrum"
								class="border-base-200 absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border sm:h-5 sm:w-5"
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-base-content/60 text-xs sm:text-sm">
							{isDirectTransfer ? $t('wallet.swap.send_from') : $t('wallet.swap.you_send')}
						</div>
						<div class="text-base-content/70 truncate text-xs font-medium">{sourceWalletInfo}</div>
					</div>
					<div class="shrink-0 text-right">
						<div class="text-sm font-bold sm:text-base">
							{sourceType === 'rbtc'
								? `${formatSats(Math.round(parseFloat(amount || '0')))} ${$t('wallet.sats')}`
								: usdFormatter.format(parseFloat(amount || '0'))}
						</div>
						{#if sourceType === 'rbtc'}
							{@const satsVal = Math.round(parseFloat(amount || '0'))}
							<div class="text-base-content/50 text-xs">
								{usdFormatter.format((satsVal / 100_000_000) * btcUsdPrice)}
							</div>
						{/if}
					</div>
				</div>

				<!-- Provider Bridge / Send Arrow -->
				<div class="flex items-center justify-center py-1">
					<div class="bg-base-200 flex items-center gap-2 rounded-full px-4 py-2">
						{#if isDirectTransfer}
							<svg
								class="text-success h-5 w-5 shrink-0"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/></svg
							>
							<span class="text-success text-sm font-semibold">{$t('wallet.swap.direct_send')}</span
							>
						{:else}
							<svg
								class="text-primary h-4 w-4 shrink-0 sm:h-5 sm:w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/></svg
							>
							<span class="text-sm font-semibold">{getProviderLabel(activeRoute)}</span>
						{/if}
						<span class="text-base-content/60 text-xs">
							{#if !isDirectTransfer && activeRoute.totalFeePercent > 0 && amountSats > 0 && btcUsdPrice > 0}
								{usdFormatter.format(
									(amountSats / 100_000_000) * btcUsdPrice * (activeRoute.totalFeePercent / 100)
								)}
							{/if}
							{activeRoute.totalFeePercent > 0 ? ' · ' : ''}{activeRoute.estimatedTime}
						</span>
					</div>
				</div>

				<!-- Destination Card -->
				<div class="bg-base-200 flex items-center gap-3 rounded-xl p-3 sm:p-4">
					<div class="relative shrink-0">
						<img
							src={selectedDest.icon}
							alt={selectedDest.asset}
							class="h-10 w-10 rounded-full sm:h-12 sm:w-12"
						/>
						{#if selectedDest.asset === 'USDT0'}
							<img
								src="/images/chains/arbitrum.png"
								alt="Arbitrum"
								class="border-base-200 absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border sm:h-5 sm:w-5"
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-base-content/60 text-xs sm:text-sm">
							{isDirectTransfer ? $t('wallet.swap.send_to') : $t('wallet.swap.you_get')}
						</div>
						<div class="text-base-content/70 truncate text-xs font-medium">{destWalletInfo}</div>
					</div>
					<div class="shrink-0 text-right">
						<div class="text-sm font-bold sm:text-base">
							{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain' || selectedDest.id === 'wbtc-arb'}
								{formatSats(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
								{$t('wallet.sats')}
							{:else}
								{usdFormatter.format(parseFloat(estimatedOutput))}
							{/if}
						</div>
						{#if selectedDest.asset === 'rBTC' || selectedDest.id === 'btc-onchain' || selectedDest.id === 'wbtc-arb'}
							{@const outSats = Math.round(parseFloat(estimatedOutput) * 100_000_000)}
							<div class="text-base-content/50 text-xs">
								{usdFormatter.format((outSats / 100_000_000) * btcUsdPrice)}
							</div>
						{/if}
					</div>
				</div>

				<!-- Warning — only for swaps, not direct sends -->
				{#if !isDirectTransfer}
					<div class="alert alert-outline alert-warning py-2 text-xs sm:text-sm">
						<svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span>{$t('wallet.swap.irreversible_warning')}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Executing Phase -->
		{#if swapPhase === 'executing'}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col items-center gap-4 py-6">
				<span class="loading loading-spinner loading-lg text-primary"></span>
				<p class="text-sm font-medium sm:text-base">
					{$t('wallet.swap.swap_executing')}
				</p>
				<p class="text-base-content/60 text-xs sm:text-sm">
					{$t('wallet.swap.timing_note')}
				</p>
				<p class="text-base-content/50 pt-2 text-xs italic">
					{$t('wallet.swap.navigate_away_note')}
				</p>
			</div>
		{/if}

		<!-- Success Phase -->
		{#if swapPhase === 'complete'}
			<div class="flex flex-col gap-4" transition:scale={{ duration: 300, start: 0.95 }}>
				<!-- Success Header -->
				<div class="flex flex-col items-center gap-2 py-2">
					<div class="bg-success/10 rounded-full p-3">
						<svg
							class="text-success h-10 w-10 sm:h-12 sm:w-12"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h4 class="text-lg font-bold sm:text-xl">
						{isDirectTransfer ? $t('wallet.swap.send_complete') : $t('wallet.swap.swap_complete')}
					</h4>
					{#if isDirectTransfer}
						<p class="text-base-content/60 text-xs sm:text-sm">
							{sourceAsset}
							{$t('wallet.swap.sent_from')}
							{walletLabel(sourceWallet)}
							{$t('wallet.swap.sent_to')}
							{walletLabel(destWallet)}
						</p>
					{/if}
				</div>

				<!-- Transaction Summary Cards -->
				<div class="bg-base-200 space-y-3 rounded-xl p-4">
					<!-- Source row -->
					<div class="flex items-center gap-3">
						<img
							src={sourceIcon}
							alt={sourceAsset}
							class="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8"
						/>
						<div class="min-w-0 flex-1 text-xs sm:text-sm">
							<div class="text-base-content/60">
								{isDirectTransfer ? $t('wallet.swap.send_from') : $t('wallet.swap.you_send')}
							</div>
							<div class="text-base-content/70 truncate text-xs font-medium">
								{sourceWalletInfo}
							</div>
							<div class="font-semibold">
								{sourceType === 'rbtc'
									? `${formatSats(Math.round(parseFloat(amount || '0')))} ${$t('wallet.sats')}`
									: `${usdFormatter.format(parseFloat(amount || '0'))} ${sourceAsset}`}
							</div>
						</div>
					</div>

					<!-- Provider bridge / Send direction -->
					<div class="flex items-center justify-center">
						<div class="bg-base-100 flex items-center gap-2 rounded-full px-3 py-1 text-xs">
							{#if isDirectTransfer}
								<svg
									class="text-success h-3 w-3 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M17 8l4 4m0 0l-4 4m4-4H3"
									/></svg
								>
								<span class="text-success font-medium">{$t('wallet.swap.direct_send')}</span>
							{:else}
								<span>{getProviderLabel(activeRoute!)}</span>
								<svg
									class="text-primary h-3 w-3 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M17 8l4 4m0 0l-4 4m4-4H3"
									/></svg
								>
							{/if}
						</div>
					</div>

					<!-- Destination row -->
					<div class="flex items-center gap-3">
						<div class="relative shrink-0">
							<img
								src={selectedDest!.icon}
								alt={selectedDest!.asset}
								class="h-7 w-7 rounded-full sm:h-8 sm:w-8"
							/>
							{#if selectedDest!.asset === 'USDT0'}<img
									src="/images/chains/arbitrum.png"
									alt="Arbitrum"
									class="border-base-200 absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border"
								/>{/if}
						</div>
						<div class="min-w-0 flex-1 text-xs sm:text-sm">
							<div class="text-base-content/60">
								{isDirectTransfer ? $t('wallet.swap.send_to') : $t('wallet.swap.you_get')}
							</div>
							<div class="text-base-content/70 truncate text-xs font-medium">{destWalletInfo}</div>
							<div class="font-semibold">
								{#if selectedDest!.asset === 'rBTC' || selectedDest!.id === 'btc-onchain' || selectedDest!.id === 'wbtc-arb'}
									{satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000))}
								{:else}
									{usdFormatter.format(parseFloat(estimatedOutput))}
									{selectedDest!.asset}
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Fee + Time row — only for swaps -->
				{#if !isDirectTransfer}
					<div
						class="bg-base-200 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-4 py-3 text-xs sm:text-sm"
					>
						<span class="text-base-content/60"
							>{$t('wallet.swap.fee_percent')}:
							<span class="text-base-content font-semibold">{activeRoute!.totalFeePercent}%</span
							></span
						>
						<span class="text-base-content/60"
							>{$t('wallet.swap.estimated_time')}:
							<span class="text-base-content font-semibold">{activeRoute!.estimatedTime}</span
							></span
						>
					</div>
				{/if}

				<!-- TX link -->
				{#if swapResult?.swapId}
					{@const hash = swapResult.swapId}
					{@const truncated = `${hash.slice(0, 6)}...${hash.slice(-4)}`}
					{@const explorerUrl =
						sourceType === 'rbtc'
							? `https://explorer.rootstock.io/tx/${hash}`
							: `https://bscscan.com/tx/${hash}`}
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-xl p-3 text-xs transition-colors sm:text-sm"
					>
						<span class="text-base-content/60">TX:</span>
						<span class="font-mono">{truncated}</span>
						<svg
							class="text-base-content/40 ml-auto h-4 w-4 shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/></svg
						>
					</a>
				{/if}

				<!-- Navigate away note -->
				<p class="text-base-content/50 px-1 text-center text-xs italic">
					{$t('wallet.swap.navigate_away_note')}
				</p>

				<button
					class="btn btn-primary min-h-[44px] touch-manipulation active:scale-95 sm:min-h-[48px]"
					onclick={resetForm}
				>
					{$t('wallet.swap.swap_another')}
				</button>
			</div>
		{/if}

		<!-- Error Phase -->
		{#if swapPhase === 'failed'}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col items-center gap-3 py-6">
				<div class="bg-error/10 rounded-full p-3">
					<svg
						class="text-error h-10 w-10 sm:h-12 sm:w-12"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<h4 class="text-lg font-bold sm:text-xl">
					{$t('wallet.swap.swap_failed')}
				</h4>
				<p class="text-base-content/60 text-center text-xs sm:text-sm">{errorMessage}</p>
				<button
					class="btn btn-primary min-h-[44px] touch-manipulation active:scale-95 sm:min-h-[48px]"
					onclick={resetForm}
				>
					{$t('common.buttons.retry')}
				</button>
			</div>
		{/if}

		<!-- General error message -->
		{#if errorMessage && swapPhase !== 'failed'}
			<div class="alert alert-outline alert-error py-2 sm:py-3">
				<span class="text-xs sm:text-sm">{errorMessage}</span>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		{#if swapPhase === 'form'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline btn-error min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.cancel')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={goToConfirm}
					disabled={!canSwap}
				>
					<span class="text-sm sm:text-base">{$t('wallet.swap.swap_preview')}</span>
				</button>
			</div>
		{:else if swapPhase === 'confirm'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={cancelConfirm}
				>
					<span class="text-sm sm:text-base">{$t('common.back')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={executeSwap}
				>
					<span class="text-sm sm:text-base">{$t('wallet.swap.confirm_swap')}</span>
				</button>
			</div>
		{:else if swapPhase === 'complete' || swapPhase === 'failed'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.close')}</span>
				</button>
			</div>
		{/if}
	{/snippet}
</Drawer>

<style>
	@keyframes slideFromLeft {
		from {
			transform: translateX(-60px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	@keyframes slideFromRight {
		from {
			transform: translateX(60px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>
