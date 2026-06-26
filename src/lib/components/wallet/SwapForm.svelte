<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { fly, scale } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { formatSats, walletStore } from '$lib/stores/wallet.store';
	import {
		type Route,
		type SourceWallet,
		type Destination,
		type RouteHop
	} from '$lib/services/route-resolver';
	import {
		startSwapChain,
		onSwapProgress,
		type SwapProgressStep
	} from '$lib/services/swap-chain.service';
	import type { SmartRoute } from '$lib/services/SmartRouter';
	// resolveRouteAsync / SmartRouter / createInitial moved to use-swap-routes rune (Phase 1); only type for local fallback smartRoute kept.
	import SwapFallback from '$lib/components/wallet/SwapFallback.svelte';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { createDebug } from '$lib/utils/debug';
	import Drawer from '$lib/components/Drawer.svelte';
	import PendingSwaps from '$lib/components/wallet/PendingSwaps.svelte';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import * as Sentry from '@sentry/sveltekit';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { useSwapWallets } from '$lib/runes/use-swap-wallets.svelte';
	import { useSwapCalculator } from '$lib/runes/use-swap-calculator.svelte';
	import { useSwapRoutes } from '$lib/runes/use-swap-routes.svelte';
	import SwapPartyCard from '$lib/components/wallet/SwapPartyCard.svelte';
	import SwapEstimateCard from '$lib/components/wallet/SwapEstimateCard.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';

	const d = createDebug('swap');

	// -----------------------------------------------------------------------
	// Destination type enum (defined before Props since Props references it)
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
	// Props
	// -----------------------------------------------------------------------
	let { isOpen, onClose, defaultDestType } = $props<{
		isOpen: boolean;
		onClose: () => void;
		defaultDestType?: DestType;
	}>();

	// -----------------------------------------------------------------------
	// Locale-aware formatters
	// -----------------------------------------------------------------------
	const satsFormatter = $derived(new Intl.NumberFormat($locale ?? 'en'));
	const usdFormatter = $derived(
		new Intl.NumberFormat($locale ?? 'en', {
			style: 'currency',
			currency: 'USD'
		})
	);

	// SmartRouter instance no longer needed here (routes rune owns its internal or DI one for testability).

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------
	let sourceType = $state<SourceWallet>('rbtc');
	let destType = $state<DestType>('usdt0-arb');
	// amount + swapPercent owned by swapCalc rune (full encapsulation for bidir/rounding); access via swapCalc.amount etc.
	let swapPhase = $state<'form' | 'confirm' | 'executing' | 'complete' | 'failed'>('form');
	let errorMessage = $state('');
	let swapResult = $state<{ txHash?: string; swapId?: string } | null>(null);
	let isFlipping = $state(false);
	// Swap progress tracker — updates during executing phase
	let swapProgressStep = $state<SwapProgressStep>('locking-rbtc');
	let swapProgressMessage = $state('');
	let unsubscribeProgress: (() => void) | null = null;
	function _stopProgressTracking() {
		unsubscribeProgress?.();
		unsubscribeProgress = null;
	}

	// Step tracker data for the executing phase UI
	const SWAP_PROGRESS_STEPS = [
		{ key: 'locking-rbtc', label: 'Locking rBTC on RSK' },
		{ key: 'waiting-for-boltz', label: 'Waiting for Boltz confirmation' },
		{ key: 'claiming-tbtc', label: 'Claiming tBTC on Arbitrum' },
		{ key: 'swapping-tbtc', label: 'Swapping tBTC to USDT0' }
	] as const;
	const SWAP_STEP_ORDER = ['locking-rbtc', 'waiting-for-boltz', 'claiming-tbtc', 'swapping-tbtc'];
	const currentStepIdx = $derived(SWAP_STEP_ORDER.indexOf(swapProgressStep));

	// smartRoute kept local ONLY for SwapFallback retryWithFallback injection (experimental Smart override); main route state in swapRoutes rune.
	let smartRoute = $state<SmartRoute | null>(null);

	// Network status for offline guards (pattern from EarnLendStep + CLAUDE "network awareness")
	let isOnline = $derived($browserNetworkStatus.online);

	// -----------------------------------------------------------------------
	// Wallet accordion state
	// -----------------------------------------------------------------------
	let sourceWallet = $state<'builtin' | string>('builtin');
	let destWallet = $state<'builtin' | string>('builtin');

	let isConnectedSource = $derived(sourceWallet !== 'builtin');
	// isConnectedDest removed (dead after rune extraction; was only for legacy, now unused)

	const swapWallets = useSwapWallets({
		getSourceWalletId: () => sourceWallet,
		getDestWalletId: () => destWallet,
		getSourceType: () => sourceType,
		getDestType: () => destType
	});

	const swapCalc = useSwapCalculator({
		getWalletBalanceToken: () => {
			if (sourceType === 'rbtc') {
				return (
					(sourceWallet === 'builtin' ? builtinRbtcSats : swapWallets.sourceBalances.rbtcSats) /
					100_000_000
				);
			}
			if (sourceType === 'wbtc-arb' || sourceType === 'tbtc-arb') {
				return (
					(sourceWallet === 'builtin' ? builtinWbtcSats : swapWallets.sourceBalances.wbtcSats) /
					100_000_000
				);
			}
			if (sourceType === 'btc-onchain') {
				return (sourceWallet === 'builtin' ? 0 : swapWallets.externalBtcBalanceSats) / 100_000_000;
			}
			return sourceWallet === 'builtin' ? builtinUsdt0 : swapWallets.sourceBalances.usdt0;
		},
		getSourceType: () => sourceType,
		getBtcUsdPrice: () => btcUsdPrice,
		getIsOnline: () => isOnline
	});

	// Routes rune (Phase 1) — owns dual Smart+async resolution, fees, outputs. Gas/price feeds kept here (refresh timer ownership).
	const swapRoutes = useSwapRoutes({
		getSourceType: () => sourceType,
		getDestType: () => destType,
		getAmountSats: () => swapCalc.amountSats,
		getSourceAddr: () => swapWallets.sourceAddr,
		getIsOnline: () => isOnline,
		getBtcUsdPrice: () => btcUsdPrice,
		getEthUsdPrice: () => ethUsdPrice,
		getRskGasWei: () => rskGasPriceWei,
		getArbGasWei: () => arbGasPriceWei
	});

	// Pre-swap ETH balance check for boltz+lifi routes that require claiming on Arbitrum
	let arbEthBalance = $state<string | null>(null);
	let arbEthCheckDone = $state(false);
	const needsArbEth = $derived.by(() => {
		// Local SmartRoute (SwapFallback retry path)
		if (smartRoute?.provider === 'boltz+lifi' && smartRoute?.toChain === 'arbitrum') {
			return true;
		}
		// Engine's recommended Route — check hops for boltz+lifi multi-hop to Arbitrum
		const rec = swapRoutes.engineResult?.recommended;
		if (rec && rec.hops.length > 1) {
			const hasBoltz = rec.hops.some((h) => h.service === 'boltz');
			const hasLifiOrSymbiosis = rec.hops.some(
				(h) => h.service === 'lifi' || h.service === 'symbiosis'
			);
			const targetsArbitrum = rec.hops[rec.hops.length - 1]?.toChain === 'arbitrum';
			if (hasBoltz && hasLifiOrSymbiosis && targetsArbitrum) return true;
		}
		return false;
	});

	// Re-export pure from calc for template (satsUsd used in labels).
	const satsUsd = swapCalc.satsUsd;

	// Effective smart for display (local SmartRoute from SwapFallback retry path only).
	// The rune's smartRoute is now Route | null (from route engine), not SmartRoute.
	let effectiveSmartRoute = $derived(smartRoute);

	// For rBTC (BTC asset) source: allow entering amount in USD via compact toggle left of input.
	let btcUsdInputMode = $state(false);

	// Sync display amount shown in input (for usd mode on rbtc, we show usd value, but keep calc in native sats)
	let displayInputAmount = $state('');
	let syncingFromInput = false;

	$effect(() => {
		const nativeStr = swapCalc.amount;
		if (isBtcSource && btcUsdInputMode) {
			if (syncingFromInput) {
				syncingFromInput = false;
				return;
			}
			const frac = swapCalc.amountInTokenUnits;
			const usd = frac * btcUsdPrice;
			displayInputAmount = usd > 0 ? usd.toFixed(2) : '';
		} else {
			displayInputAmount = nativeStr;
		}
	});

	$effect(() => {
		// reset usd mode when source changes away from BTC-denominated assets
		if (!isBtcSource && btcUsdInputMode) {
			btcUsdInputMode = false;
			syncingFromInput = false;
		}
	});

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
		chainId: 42161
	};
	const CHAIN_BTC = {
		asset: 'BTC',
		label: 'Bitcoin',
		short: 'BTC',
		icon: '/images/chains/Bitcoin.svg',
		network: 'bitcoin',
		chainId: -1
	};

	// -----------------------------------------------------------------------
	// Destination options (computed from source)
	// -----------------------------------------------------------------------
	let destOptions = $derived.by<DestOption[]>(() => {
		const options: DestOption[] = [];

		if (sourceType === 'rbtc') {
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

			options.push({
				id: 'btc-onchain',
				asset: CHAIN_BTC.asset,
				label: CHAIN_BTC.label,
				description: $t('wallet.swap.desc_rbtc_to_btc'),
				icon: CHAIN_BTC.icon,
				network: CHAIN_BTC.network,
				chainId: CHAIN_BTC.chainId,
				available: destWalletHasBtcSigner
			});
		} else if (sourceType === 'btc-onchain') {
			// BTC on-chain source: swap to rBTC, USDT0, wBTC, or send BTC to another wallet
			options.push({
				id: 'rbtc-rsk',
				asset: CHAIN_RSK.asset,
				label: CHAIN_RSK.label,
				description: $t('wallet.swap.desc_btc_to_rbtc'),
				icon: CHAIN_RSK.icon,
				network: CHAIN_RSK.network,
				chainId: CHAIN_RSK.chainId,
				available: true
			});

			options.push({
				id: 'usdt0-arb',
				asset: CHAIN_ARB.asset,
				label: CHAIN_ARB.label,
				description: $t('wallet.swap.desc_btc_to_usdt'),
				icon: CHAIN_ARB.icon,
				network: CHAIN_ARB.network,
				chainId: CHAIN_ARB.chainId,
				available: true
			});

			options.push({
				id: 'wbtc-arb',
				asset: CHAIN_WBTC.asset,
				label: CHAIN_WBTC.label,
				description: $t('wallet.swap.desc_btc_to_wbtc'),
				icon: CHAIN_WBTC.icon,
				network: CHAIN_WBTC.network,
				chainId: CHAIN_WBTC.chainId,
				available: true
			});

			if (sourceWallet !== destWallet) {
				options.push({
					id: 'btc-onchain',
					asset: CHAIN_BTC.asset,
					label: CHAIN_BTC.label,
					description: $t('wallet.swap.desc_same_wallet_transfer'),
					icon: CHAIN_BTC.icon,
					network: CHAIN_BTC.network,
					chainId: CHAIN_BTC.chainId,
					available: destWalletHasBtcSigner
				});
			}
		} else {
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
	let sourceAsset = $derived(
		sourceType === 'rbtc' || sourceType === 'btc-onchain'
			? 'BTC'
			: sourceType === 'wbtc-arb'
				? 'WBTC'
				: sourceType === 'tbtc-arb'
					? 'TBTC'
					: 'USDT'
	);
	let sourceIcon = $derived(
		sourceType === 'rbtc'
			? '/images/chains/Bitcoin-Rootstock-logo.webp'
			: sourceType === 'btc-onchain'
				? '/images/chains/Bitcoin.svg'
				: sourceType === 'wbtc-arb'
					? '/images/chains/Wrapped-Bitcoin-Logo.webp'
					: sourceType === 'tbtc-arb'
						? '/images/chains/tBTC-logo.webp'
						: '/images/chains/Tether-USD.svg'
	);

	/** Wallet balance in token units (rBTC or USDT0) — delegated to calculator rune (which sources from wallets rune). */
	let walletBalanceToken = $derived(swapCalc.walletBalanceToken.toFixed(6));

	/** Actual BTC/USD price from Coinbase, fetched async. Default 0 until loaded. */
	let btcUsdPrice = $state(0);
	/** ETH/USD price for Arbitrum gas→sats conversion. */
	let ethUsdPrice = $state(0);
	/** Live gas price in wei from RPC (eth_gasPrice). */
	let rskGasPriceWei = $state(0n);
	let arbGasPriceWei = $state(0n);

	/** Gas limit in wei for the current transaction. */
	// rsxGasLimit $state removed (dead store after extraction; effect still assigns but var unused in current paths, gas now in routes rune for most)

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

	async function refreshLiveFees() {
		if (!isOnline) {
			d.log('refreshLiveFees: skipped (offline)');
			return;
		}
		d.log('refreshLiveFees: fetching gas prices + BTC/ETH rates');
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

	onMount(async () => {
		reconnectPersistedWallets();
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'SwapForm mounted',
			data: { sourceType, destType }
		});
		// Fire-and-forget: prices/gas are non-blocking for initial render.
		// The $effect below re-fetches on every drawer open anyway.
		refreshLiveFees();
	});

	let _feeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!isOpen) return;
		// Apply default destination type when drawer opens (e.g. wBTC from loan flow)
		if (defaultDestType) {
			destType = defaultDestType;
		}
		_feeRefreshTimer = setTimeout(() => refreshLiveFees(), 300);
		return () => {
			if (_feeRefreshTimer) clearTimeout(_feeRefreshTimer);
		};
	});

	// amountInTokenUnits now from swapCalc (Phase 1 rune)

	// walletBalanceDisplay now from swapCalc (Phase 1 rune)

	// satsUsd now from swapCalc (Phase 1 rune)

	// applyPercent now from swapCalc (Phase 1 rune)

	// pct sync now in swapCalc rune (Phase 1)

	let visibleDestOptions = $derived(destOptions.filter((o) => o.available));

	// hasExternalBtcWallet removed — replaced by per-wallet sourceWalletHasBtcSigner/destWalletHasBtcSigner

	/** Whether the selected SOURCE wallet supports BTC on-chain signing */
	let sourceWalletHasBtcSigner = $derived.by(() => {
		if (sourceWallet === 'builtin') return false;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === sourceWallet);
		if (!w) return false;
		return (
			(w.walletType === 'trezor' ||
				w.walletType === 'ledger' ||
				w.walletType === 'walletconnect') &&
			!!w.btcAddress
		);
	});

	/** Whether the selected DEST wallet supports BTC on-chain signing */
	let destWalletHasBtcSigner = $derived.by(() => {
		if (destWallet === 'builtin') return false;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === destWallet);
		if (!w) return false;
		return (
			(w.walletType === 'trezor' ||
				w.walletType === 'ledger' ||
				w.walletType === 'walletconnect') &&
			!!w.btcAddress
		);
	});
	// Builtin wallet balances — read directly from the wallet store using
	// Svelte 5's $auto-subscription. The rune's $derived chain breaks for
	// nested property access (walletSnap.totalBalances.sats) because $state
	// mutations inside $effect subscription callbacks don't propagate to
	// $derived values. $walletStore is the proven reactive path.
	const builtinRbtcSats = $derived($walletStore.totalBalances?.sats ?? 0);
	const builtinUsdt0 = $derived(parseFloat($walletStore.arb?.formattedUsdt0Balance || '0'));
	const builtinWbtcSats = $derived(
		Math.round(parseFloat($walletStore.arb?.formattedWbtcBalance || '0') * 100_000_000)
	);

	let sourceRbtcSats = $derived(
		sourceWallet === 'builtin' ? builtinRbtcSats : swapWallets.sourceBalances.rbtcSats
	);
	let sourceUsdt0Usd = $derived(
		sourceWallet === 'builtin' ? builtinUsdt0 : swapWallets.sourceBalances.usdt0
	);
	let destRbtcSats = $derived(
		destWallet === 'builtin' ? builtinRbtcSats : swapWallets.destBalances.rbtcSats
	);
	let destUsdt0Usd = $derived(
		destWallet === 'builtin' ? builtinUsdt0 : swapWallets.destBalances.usdt0
	);
	let destWbtcSats = $derived(
		destWallet === 'builtin' ? builtinWbtcSats : swapWallets.destBalances.wbtcSats
	);
	let sourceWbtcSats = $derived(
		sourceWallet === 'builtin' ? builtinWbtcSats : swapWallets.sourceBalances.wbtcSats
	);

	/** BTC sats for a wallet (builtin = rBTC + BTC + wBTC from walletStore; connected = from balances) */
	function walletBtcSatsForFn(walletId: string): number {
		if (walletId === 'builtin') {
			return builtinRbtcSats + builtinWbtcSats;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		// All connectors store rbtc/btc/wbtc raw values already in sats
		return (
			Number(w.balances.rbtc?.raw ?? 0) +
			Number(w.balances.btc?.raw ?? 0) +
			Number(w.balances.wbtc?.raw ?? 0)
		);
	}

	/** USDT0 on Arbitrum for a wallet (returns USD amount) */
	function walletUsdt0ForFn(walletId: string): number {
		if (walletId === 'builtin') return builtinUsdt0;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		// raw is in smallest unit (6 decimals for USDT0)
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e6;
	}

	let destAssets = $derived<AssetOption[]>(
		visibleDestOptions.map((o) => ({
			id: o.id,
			label:
				o.asset === 'USDT0'
					? 'USD'
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
								? formatSats(swapWallets.externalBtcBalanceSats) + ' Sats'
								: undefined,
			balanceSub:
				o.id === 'rbtc-rsk'
					? `≈ $${((destRbtcSats / 100_000_000) * btcPrice.price).toFixed(2)}`
					: o.id === 'wbtc-arb'
						? `≈ $${((destWbtcSats / 100_000_000) * btcPrice.price).toFixed(2)}`
						: o.id === 'btc-onchain'
							? `≈ $${((swapWallets.externalBtcBalanceSats / 100_000_000) * btcPrice.price).toFixed(2)}`
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
			label: 'USD',
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
		},
		// BTC on-chain — only available when the selected source wallet has a BTC signer
		...(sourceWalletHasBtcSigner
			? [
					{
						id: 'btc-onchain' as const,
						label: 'Bitcoin (BTC)',
						icon: '/images/chains/Bitcoin.svg',
						subLabel: 'Bitcoin on-chain',
						balance: formatSats(swapWallets.externalBtcBalanceSats) + ' Sats',
						balanceSub: `≈ $${(
							(swapWallets.externalBtcBalanceSats / 100_000_000) *
							btcPrice.price
						).toFixed(2)}`
					}
				]
			: [])
	]);

	let selectedDest = $derived(
		visibleDestOptions.find((o) => o.id === destType) || visibleDestOptions[0]
	);

	// Amount/insuff/valid now from swapCalc rune (unified, exact rounding + guards).
	let amountSats = $derived(swapCalc.amountSats);
	let isInsufficientBalance = $derived(swapCalc.isInsufficientBalance);

	// amountInTokenUnits delegate (used in execute, effects, displays, resets).
	let amountInTokenUnits = $derived(swapCalc.amountInTokenUnits);
	let walletBalanceDisplay = $derived(swapCalc.walletBalanceDisplay);

	// Route resolution fully delegated to swapRoutes rune (Phase 1 extraction).
	// Old destinationFor + debounce $effect + direct async/smart state removed (now in rune; see use-swap-routes.svelte.ts).
	// Use swapRoutes.smartRoute, .routeLoading, .estimatedOutput, .getExecutableRoute() etc.
	// Local smartRoute kept only for SwapFallback retry injection (sets override for confirm/execute on that path).

	// Estimated output / fees / active route now from swapRoutes rune (exact parity with prior logic + fallbacks preserved in rune).
	// Delegates (thin, for template/execute compat during migration):
	let estimatedOutput = $derived(swapRoutes.estimatedOutput);
	let totalFeeSats = $derived(swapRoutes.totalFeeSats);
	let minSwapSats = $derived(swapRoutes.minSwapSats);

	// Below minimum check (reactive, no layout shift — note always rendered, color changes)
	let isBelowMinimum = $derived(
		minSwapSats > 0 && swapCalc.amountSats > 0 && swapCalc.amountSats < minSwapSats
	);

	let canSwap = $derived(
		swapCalc.isValidAmount &&
			!isBelowMinimum &&
			(swapRoutes.engineResult.recommended !== null || swapRoutes.engineResult.routes.length > 0) &&
			swapPhase === 'form' &&
			isOnline
	);

	// Combined amount error: below minimum OR above balance
	let isAmountError = $derived(isBelowMinimum || isInsufficientBalance);

	// Minimum slider percentage (derived from minSwapSats / walletBalance)
	let minSliderPercent = $derived.by(() => {
		if (minSwapSats <= 0) return 0;
		const bal = swapCalc.walletBalanceToken;
		if (bal <= 0) return 0;
		const maxSats = Math.floor(bal * 100_000_000);
		if (maxSats <= 0) return 0;
		return Math.min(100, Math.ceil((minSwapSats / maxSats) * 100));
	});

	// Auto-fill minimum when asset changes and current amount is below minimum
	let _lastSourceTypeForMin = $state<string>('');
	let _lastDestTypeForMin = $state<string>('');
	$effect(() => {
		const src = sourceType;
		const dst = destType;
		const min = minSwapSats;

		// Only auto-fill when source/dest actually changed (not on every amount change)
		const srcChanged = src !== _lastSourceTypeForMin;
		const dstChanged = dst !== _lastDestTypeForMin;
		_lastSourceTypeForMin = src;
		_lastDestTypeForMin = dst;

		if (min <= 0) return;
		if (!srcChanged && !dstChanged) return;

		const currentSats = swapCalc.amountSats;
		if (currentSats < min) {
			d.log('Auto-filling minimum: %d → %d sats (asset changed)', currentSats, min);
			swapCalc.amount = min.toString();
		}
	});

	// rsx direct gas effect + estimate fn removed (dead post Phase1 extraction; routes rune + startSwapChain handle gas/limits for both simple/direct and swaps).

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

	// Reset when drawer opens
	$effect(() => {
		if (!isOpen) return;
		smartRoute = null;
		errorMessage = '';
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'Swap drawer opened',
			data: { sourceType, destType }
		});
	});

	// -----------------------------------------------------------------------
	// Methods
	// -----------------------------------------------------------------------
	function swapDirection() {
		triggerHaptic(ImpactStyle.Light);

		// Direct swap: source ↔ dest (both wallet and asset)
		const prevSource = sourceType;
		const prevDest = destType;
		const prevSourceWallet = sourceWallet;
		const prevDestWallet = destWallet;

		// Map DestType → SourceWallet (for the new source)
		const DEST_TO_SOURCE: Record<string, SourceWallet> = {
			'rbtc-rsk': 'rbtc',
			'usdt0-arb': 'usdt0-arb',
			'wbtc-arb': 'wbtc-arb',
			'btc-onchain': 'btc-onchain'
		};
		const reverseSource = DEST_TO_SOURCE[prevDest] ?? 'rbtc';

		// Check if the reverse pair is valid (dest asset must be available as source)
		const validSourceAssets = sourceAssets.map((a) => a.id);
		if (!validSourceAssets.includes(reverseSource)) {
			d.log('swapDirection: reverse source %s not in sourceAssets, skipping', reverseSource);
			return;
		}

		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap direction flipped',
			data: { from: `${prevSourceWallet}/${prevSource}`, to: `${prevDestWallet}/${prevDest}` }
		});

		isFlipping = true;
		d.log('swapDirection: %s/%s ↔ %s/%s', prevSourceWallet, prevSource, prevDestWallet, prevDest);
		setTimeout(() => (isFlipping = false), 300);

		// Map SourceWallet → DestType (for the new dest)
		const SOURCE_TO_DEST: Record<string, DestType> = {
			rbtc: 'rbtc-rsk',
			'wbtc-arb': 'wbtc-arb',
			'btc-onchain': 'btc-onchain',
			'usdt0-arb': 'usdt0-arb',
			'tbtc-arb': 'wbtc-arb'
		};

		// Swap wallets and assets
		sourceWallet = prevDestWallet;
		destWallet = prevSourceWallet;
		sourceType = reverseSource as SourceWallet;
		destType = SOURCE_TO_DEST[prevSource] ?? 'rbtc-rsk';

		// Validate dest is available for new source, auto-correct if not
		const available = visibleDestOptions;
		if (available.length > 0 && !available.find((o) => o.id === destType)) {
			destType = available[0]!.id;
		}

		swapCalc.resetAmount();
		btcUsdInputMode = false;
		displayInputAmount = '';
		syncingFromInput = false;
		smartRoute = null;
		errorMessage = '';
		swapPhase = 'form';
		swapRoutes.clearRoutes();
	}

	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'max amount set',
			data: { sourceType, balance: walletBalanceToken }
		});
		swapCalc.setMaxAmount();
	}

	function applyPercent(pct: number) {
		swapCalc.applyPercent(pct);
	}

	/** Returns true if the asset or dest option id represents a bitcoin asset (rBTC, WBTC, onchain BTC, etc).
	 * Used to decide sats value formatting (sats + ≈ usd) for "you receive" / dest lines in totals when one of source/dest is BTC.
	 * Mirrors checks in destAssets + selectedDest conditions for DRY.
	 */
	function isBitcoinAsset(asset?: string, id?: string): boolean {
		const a = (asset || '').toUpperCase().replace('BITCOIN', '').trim();
		const i = (id || '').toLowerCase();
		return (
			a === 'RBTC' ||
			a === 'WBTC' ||
			a === 'BTC' ||
			i === 'rbtc-rsk' ||
			i === 'wbtc-arb' ||
			i === 'btc-onchain'
		);
	}

	/** True when the source is a BTC-denominated asset (sats-based input). */
	let isBtcSource = $derived(
		sourceType === 'rbtc' ||
			sourceType === 'wbtc-arb' ||
			sourceType === 'tbtc-arb' ||
			sourceType === 'btc-onchain'
	);

	function goToConfirm() {
		if (!canSwap) return;
		triggerHaptic(ImpactStyle.Medium);
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap confirm phase',
			data: { sourceType, destType, amount: amountInTokenUnits, wallet: sourceWallet }
		});
		swapPhase = 'confirm';
		errorMessage = '';
		// Check ETH balance on Arbitrum if boltz+lifi route (needed for claiming tBTC)
		if (needsArbEth) {
			arbEthCheckDone = false;
			checkArbEthBalance();
		}
	}

	async function checkArbEthBalance() {
		try {
			// For connected wallets the EVM address is the same across chains.
			// For the built-in wallet we must use the Arbitrum address, NOT the RSK address,
			// because the built-in wallet derives separate addresses per chain.
			let addr = '';
			if (sourceWallet !== 'builtin') {
				// Connected wallet — address is the same on all EVM chains
				addr = swapWallets.sourceAddr || '';
			} else {
				// Built-in wallet — use the Arbitrum address from the wallet store
				const store = get(walletStore);
				addr = store.arb?.address || store.rsk?.address || '';
			}
			if (!addr) {
				arbEthBalance = '0';
				arbEthCheckDone = true;
				return;
			}
			const res = await fetch('https://arb1.arbitrum.io/rpc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getBalance',
					params: [addr, 'latest'],
					id: 1
				})
			});
			const data = await res.json();
			const wei = BigInt(data.result || '0x0');
			arbEthBalance = (Number(wei) / 1e18).toFixed(6);
		} catch {
			arbEthBalance = 'unknown';
		}
		arbEthCheckDone = true;
	}

	function cancelConfirm() {
		swapPhase = 'form';
		errorMessage = '';
	}

	function resetForm() {
		if (swapPhase === 'executing') return;
		swapCalc.resetAmount();
		btcUsdInputMode = false;
		displayInputAmount = '';
		syncingFromInput = false;
		smartRoute = null;
		swapPhase = 'form';
		errorMessage = '';
		swapResult = null;
		swapRoutes.clearRoutes();
	}

	function handleClose() {
		if (swapPhase === 'executing') return;
		resetForm();
		onClose();
	}

	/**
	 * Resolve destination address directly from wallet store + connected wallets.
	 * Bypasses the rune's derived values which can be stale due to Svelte 5
	 * $state proxy reactivity issues with deeply nested objects.
	 */
	function resolveDestAddress(dt: string, isConn: boolean, wid: string): string {
		if (isConn) {
			const w = swapWallets.getConnectedWallet(wid);
			return w?.address ?? '';
		}
		const store = get(walletStore);
		if (dt === 'btc-onchain') {
			// External BTC address from connected wallets
			for (const w of $connectedWalletsStore.wallets) {
				if (w.btcAddress) return w.btcAddress;
			}
			return '';
		}
		if (dt === 'rbtc-rsk') return store.rsk?.address ?? '';
		return store.arb?.address || store.rsk?.address || '';
	}

	async function executeSwap() {
		if (swapPhase !== 'confirm') return;
		if (!swapCalc.amount || isInsufficientBalance) return;
		// Use rune for executable route (handles Smart + async + usdt0 special LI.FI case internally)
		if (!swapRoutes.getExecutableRoute() && !smartRoute) return;

		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap execute started',
			data: { sourceType, destType, amount: amountInTokenUnits, connected: !!isConnectedSource }
		});
		swapPhase = 'executing';
		errorMessage = '';
		swapProgressStep = 'locking-rbtc';
		swapProgressMessage = 'Starting swap...';
		unsubscribeProgress = onSwapProgress((step, message) => {
			swapProgressStep = step;
			swapProgressMessage = message;
		});
		triggerHaptic(ImpactStyle.Heavy);

		d.log(
			'executeSwap: source=%s dest=%s amount=%s sourceAddr=%s destAddr=%s connected=%s',
			sourceType,
			destType,
			amountInTokenUnits,
			swapWallets.sourceAddr.substring(0, 10),
			swapWallets.destAddr.substring(0, 10),
			isConnectedSource ? sourceWallet : 'builtin'
		);

		const destAddress =
			swapWallets.destAddr || resolveDestAddress(destType, destWallet !== 'builtin', destWallet);

		if (!destAddress) {
			errorMessage = $t('wallet.swap.error.no_dest_address');
			swapPhase = 'failed';
			return;
		}

		const execDest: Destination =
			selectedDest?.id === 'btc-onchain'
				? { type: 'invoice', network: 'onchain', invoice: destAddress }
				: selectedDest?.id === 'wbtc-arb'
					? {
							type: 'address',
							chainId: selectedDest?.chainId ?? 42161,
							address: destAddress,
							asset: 'WBTC'
						}
					: {
							type: 'address',
							chainId: selectedDest?.chainId ?? 42161,
							address: destAddress
						};

		const execAmount = amountInTokenUnits.toString();
		const connectedSourceId = isConnectedSource ? sourceWallet : null;
		d.log(
			'executeSwap: calling startSwapChain with connectedWalletId=%s',
			connectedSourceId || 'null (built-in)'
		);

		// For execute: prefer rune (supports Smart conversion + special usdt0 case + fallback async); fallback to local smartRoute override for SwapFallback retry path.
		let execRoute: Route | null = swapRoutes.getExecutableRoute();
		d.log(
			'executeSwap: execRoute=%s hops=%d smartRoute=%s',
			execRoute?.id ?? 'null',
			execRoute?.hops?.length ?? 0,
			effectiveSmartRoute?.provider ?? 'null'
		);
		if (!execRoute && smartRoute) {
			// Convert local fallback Smart to Route shape (minimal, for retry path)
			execRoute = {
				id: `smart-${smartRoute.provider}`,
				label: smartRoute.provider,
				hops: [
					{
						service: (smartRoute.provider as RouteHop['service']) || 'lifi',
						fromAsset: smartRoute.fromAsset,
						fromChain: 'arbitrum',
						toAsset: smartRoute.toAsset,
						toChain: 'rsk',
						feePercent: 0,
						estimatedTimeMin: smartRoute.estimatedTimeMinutes || 1,
						estimatedTimeMax: (smartRoute.estimatedTimeMinutes || 1) + 1
					}
				],
				totalFeePercent: 0,
				estimatedTime: `${smartRoute.estimatedTimeMinutes || 5} min`,
				recommended: true
			};
		}

		if (!execRoute) {
			errorMessage = $t('wallet.swap.error.no_routes') || 'No executable route available';
			Sentry.addBreadcrumb({
				category: 'wallet.swap',
				message: 'swap failed - no route',
				data: { sourceType, destType }
			});
			swapPhase = 'failed';
			return;
		}

		const { data: result, error } = await startSwapChain(
			execRoute,
			sourceType,
			execDest,
			execAmount,
			connectedSourceId
		);

		d.log(
			'executeSwap result: phase=%s error=%s swap1=%s swap2=%s',
			result?.phase ?? 'null',
			error?.message ?? result?.error ?? 'none',
			result?.swap1Id?.substring(0, 16) ?? 'null',
			result?.swap2Id?.substring(0, 16) ?? 'null'
		);

		if (error || !result) {
			d.error('executeSwap FAILED: %s', error?.message || 'no result');
			Sentry.addBreadcrumb({
				category: 'wallet.swap',
				message: 'swap execute failed',
				data: { error: error?.message }
			});
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
		} else {
			errorMessage = result.error || $t('wallet.swap.error.swap_failed');
			swapPhase = 'failed';
			triggerHaptic(ImpactStyle.Heavy);
		}
	}

	/** Retry swap using a fallback route from SwapFallback. */
	function retryWithFallback(route: SmartRoute) {
		smartRoute = route;
		swapPhase = 'confirm';
		errorMessage = '';
	}

	function getProviderLabel(): string {
		// Local SmartRoute (SwapFallback retry path) — format provider name
		const p = smartRoute?.provider ?? '';
		if (p) {
			return p
				.split('+')
				.map((part) => {
					const trimmed = part.trim().toLowerCase();
					if (trimmed === 'lifi') return 'LI.FI';
					if (trimmed === 'boltz') return 'Boltz';
					if (trimmed === 'symbiosis') return 'Symbiosis';
					if (trimmed === 'changelly') return 'Changelly';
					return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
				})
				.join(' + ');
		}
		// Engine's recommended Route — use label directly (already formatted by engine)
		return swapRoutes.engineResult?.recommended?.label ?? '';
	}

	// -----------------------------------------------------------------------
	// Helpers for confirm/success screens
	// -----------------------------------------------------------------------

	/** True when this is a same-asset wallet-to-wallet send (not a swap). */
	let isDirectTransfer = $derived(
		(sourceType === 'rbtc' && destType === 'rbtc-rsk') ||
			(sourceType === 'usdt0-arb' && destType === 'usdt0-arb') ||
			(sourceType === 'btc-onchain' && destType === 'btc-onchain')
	);

	/** Estimated network fee in sats for direct transfers (RSK gas: 21000 gas × gas price). */
	let directTransferNetworkFeeSats = $derived.by(() => {
		if (!isDirectTransfer) return 0;
		if (sourceType === 'rbtc' || sourceType === 'btc-onchain') {
			// RSK: 21000 gas for simple transfer
			const gasUsed = 21000n;
			const feeWei = gasUsed * rskGasPriceWei;
			return Number(feeWei / 10_000_000_000n);
		}
		if (sourceType === 'usdt0-arb') {
			// Arbitrum: ~65000 gas for ERC-20 transfer
			const gasUsed = 65000n;
			const feeWei = gasUsed * arbGasPriceWei;
			return Number(feeWei / 10_000_000_000n);
		}
		return 0;
	});

	// Wallet labels/info now from swapWallets rune (centralized, no more find + builtin fallback dupe).
	let sourceWalletInfo = $derived(swapWallets.sourceWalletInfo);
	let destWalletInfo = $derived(swapWallets.destWalletInfo);

	// Wallet type/address for confirm card WalletIcon display
	let sourceWalletType = $derived.by(() => {
		if (sourceWallet === 'builtin') return undefined;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === sourceWallet);
		return w?.walletType;
	});
	let sourceWalletAddress = $derived.by(() => {
		if (sourceWallet === 'builtin') return undefined;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === sourceWallet);
		return w?.address;
	});
	let destWalletType = $derived.by(() => {
		if (destWallet === 'builtin') return undefined;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === destWallet);
		return w?.walletType;
	});
	let destWalletAddress = $derived.by(() => {
		if (destWallet === 'builtin') return undefined;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === destWallet);
		return w?.address;
	});

	// Asset display name for confirm card
	let sourceAssetName = $derived.by(() => {
		const opt = sourceAssets.find((a) => a.id === sourceType);
		return opt?.label ?? sourceAsset;
	});
	let destAssetName = $derived.by(() => {
		if (!selectedDest) return '';
		// Use destAssets label (matches accordion: "USD", "Bitcoin (rBTC)") not destOptions label ("Arbitrum", "Rootstock")
		const opt = destAssets.find((a) => a.id === selectedDest.id);
		return opt?.label ?? selectedDest.asset;
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
					<!-- From: Dual-zone party selector (wallet + asset in one accordion) -->
					<SwapPartySelector
						label={$t('wallet.from')}
						selectedWalletId={sourceWallet}
						onWalletSelect={(id) => (sourceWallet = id)}
						connectedWallets={$connectedWalletsStore.wallets}
						walletBtcSatsFor={walletBtcSatsForFn}
						walletUsdt0For={walletUsdt0ForFn}
						btcPrice={btcPrice.price}
						selectedAssetId={sourceType}
						onAssetSelect={(id) => {
							if (id !== sourceType) {
								const prev = sourceType;
								sourceType = id as SourceWallet;
								if (id === 'rbtc') {
									destType = 'usdt0-arb';
								} else if (id === 'usdt0-arb') {
									destType = 'rbtc-rsk';
								} else if (id === 'btc-onchain') {
									destType = 'rbtc-rsk';
								} else if (id === 'wbtc-arb') {
									destType = 'usdt0-arb';
								} else if (id === 'tbtc-arb') {
									destType = 'usdt0-arb';
								}
								swapCalc.resetAmount();
								btcUsdInputMode = false;
								displayInputAmount = '';
								smartRoute = null;
								Sentry.addBreadcrumb({
									category: 'wallet.swap',
									message: 'source asset changed',
									data: { from: prev, to: sourceType }
								});
							}
						}}
						assets={sourceAssets}
					/>

					<!-- Swap Direction Button -->
					<div class="relative flex items-center justify-center py-1">
						<div class="border-base-300 absolute inset-x-0 top-1/2 border-t"></div>
						<button
							type="button"
							class="btn btn-circle btn-outline bg-base-100 relative z-10 min-h-[44px] min-w-[44px] touch-manipulation border-2 transition-transform duration-300 active:scale-95 sm:min-h-[48px] sm:min-w-[48px]"
							class:rotate-180={isFlipping}
							onclick={() => {
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

					<!-- To: Dual-zone party selector -->
					<SwapPartySelector
						label={$t('wallet.to')}
						selectedWalletId={destWallet}
						onWalletSelect={(id) => (destWallet = id)}
						connectedWallets={$connectedWalletsStore.wallets}
						walletBtcSatsFor={walletBtcSatsForFn}
						walletUsdt0For={walletUsdt0ForFn}
						btcPrice={btcPrice.price}
						selectedAssetId={destType}
						onAssetSelect={(id) => {
							destType = id as DestType;
							smartRoute = null;
						}}
						assets={destAssets}
					/>

					<!-- Amount Input (now unified via AmountInputSection direct variant for DRY + parity) -->
					<div class="form-control">
						<label for="swap-amount" class="label flex justify-between px-1 py-1">
							<span class="label-text text-sm sm:text-base">
								{#if isBtcSource && amountSats > 0}
									{#if btcUsdInputMode}
										{usdFormatter.format((amountSats / 100_000_000) * btcPrice.price)}
									{:else}
										{satsFormatter.format(amountSats)}
										{$t('wallet.sats')}
										({usdFormatter.format((amountSats / 100_000_000) * btcPrice.price)})
									{/if}
								{:else if isBtcSource}
									{btcUsdInputMode ? '$USD' : $t('wallet.sats')}
								{:else}
									'USDT'
								{/if}
							</span>
							<span class="label-text-alt text-xs sm:text-sm">
								{$t('wallet.available_balance')}: {isBtcSource
									? satsUsd(Math.round(parseFloat(walletBalanceToken) * 100_000_000), btcUsdPrice)
									: `${walletBalanceDisplay}`}
							</span>
						</label>
						<AmountInputSection
							variant="direct"
							amount={displayInputAmount}
							unit="sats"
							onUnitChange={() => {}}
							onAmountChange={(v: string) => {
								if (isBtcSource && btcUsdInputMode) {
									// usd entered for btc source -> convert to native sats str for calc
									const usdNum = parseFloat(v || '0');
									if (usdNum > 0 && btcUsdPrice > 0) {
										const frac = usdNum / btcUsdPrice;
										swapCalc.amount = Math.round(frac * 100_000_000).toString();
									} else {
										swapCalc.amount = '';
									}
									syncingFromInput = true;
									displayInputAmount = v;
								} else if (sourceType === 'usdt0-arb') {
									// enforce 2 decimals + floor dust for usdt (formatting only, no clamp)
									const n = parseFloat(v || '0');
									const clean = n > 0 ? (Math.floor(n * 100) / 100).toFixed(2) : '';
									swapCalc.amount = clean;
									displayInputAmount = clean;
								} else {
									swapCalc.amount = v;
									displayInputAmount = v;
								}
							}}
							tokenPrefix={isBtcSource ? undefined : '$'}
							showPercentSlider={true}
							sliderDisabled={swapCalc.walletBalanceToken <= 0}
							sliderMin={minSliderPercent}
							percent={swapCalc.swapPercent}
							onPercentChange={(pct: number) => applyPercent(Math.max(pct, minSliderPercent))}
							onMaxAmount={async () => setMaxAmount()}
							disabled={!isOnline}
							hasInsufficientBalance={isInsufficientBalance}
							maxDisabled={swapCalc.walletBalanceToken <= 0}
							supportsBtcUsdToggle={isBtcSource}
							btcUsdMode={btcUsdInputMode}
							onBtcUsdModeChange={(isUsd: boolean) => {
								const wasUsd = btcUsdInputMode;
								btcUsdInputMode = isUsd;
								syncingFromInput = false;
								if (isUsd && !wasUsd) {
									// native -> usd display (effect will update displayInputAmount)
								} else if (!isUsd && wasUsd) {
									// usd -> native
									const usdNum = parseFloat(displayInputAmount || '0');
									if (usdNum > 0 && btcUsdPrice > 0) {
										const frac = usdNum / btcUsdPrice;
										swapCalc.amount = Math.round(frac * 100_000_000).toString();
									} else {
										swapCalc.amount = '';
									}
								}
							}}
							btcNativeSymbol="₿"
							belowMinimum={isAmountError}
						/>
						<!-- Minimum swap amount note (always rendered, no layout shift) -->
						<div
							class="flex min-h-[1.25rem] items-center text-sm transition-colors duration-300 sm:text-base {minSwapSats >
								0 && !isAmountError
								? 'text-base-content/50'
								: ''} {isAmountError ? 'text-error' : ''}"
						>
							{#if minSwapSats > 0}
								{$t('wallet.swap.minimum_amount')}: {satsFormatter.format(minSwapSats)}
								{$t('wallet.sats')}{#if btcUsdPrice > 0}
									≈ {usdFormatter.format((minSwapSats / 100_000_000) * btcUsdPrice)}{/if}
							{/if}
						</div>
					</div>

					<!-- Fee/estimate card — always renders (no layout shift); skeleton while loading, dashes when empty -->
					{#if selectedDest}
						<SwapEstimateCard
							variant="form"
							totalSent={amountInTokenUnits > 0
								? isBtcSource
									? satsUsd(amountSats, btcUsdPrice)
									: usdFormatter.format(amountInTokenUnits)
								: undefined}
							feeDisplay={totalFeeSats > 0
								? `−${formatSats(totalFeeSats)} ${$t('wallet.sats')}${btcUsdPrice > 0 && (totalFeeSats / 100_000_000) * btcUsdPrice >= 0.01 ? ' ≈ ' + usdFormatter.format((totalFeeSats / 100_000_000) * btcUsdPrice) : ''}`
								: isDirectTransfer && directTransferNetworkFeeSats > 0
									? `~${formatSats(directTransferNetworkFeeSats)} ${$t('wallet.sats')}${btcUsdPrice > 0 ? ' ≈ ' + usdFormatter.format((directTransferNetworkFeeSats / 100_000_000) * btcUsdPrice) : ''}`
									: undefined}
							youReceive={amountInTokenUnits > 0 && estimatedOutput
								? isBitcoinAsset(selectedDest.asset, selectedDest.id)
									? satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000), btcUsdPrice)
									: usdFormatter.format(parseFloat(estimatedOutput))
								: undefined}
							providerLabel={swapRoutes.smartRoute || effectiveSmartRoute
								? getProviderLabel()
								: swapRoutes.activeRouteForCalc?.label || undefined}
							estimatedTime={effectiveSmartRoute?.estimatedTimeMinutes
								? `${effectiveSmartRoute.estimatedTimeMinutes} min`
								: swapRoutes.activeRouteForCalc?.estimatedTime || undefined}
							feePercent={effectiveSmartRoute?.totalFeePercent ??
								swapRoutes.activeRouteForCalc?.totalFeePercent}
							{isDirectTransfer}
							loading={swapRoutes.routeLoading}
							belowMinimum={isAmountError}
						/>
					{/if}

					<!-- Insufficient balance -->
					{#if isInsufficientBalance}
						<div class="alert alert-outline alert-error py-2 sm:py-3">
							<span class="text-xs sm:text-sm">
								{$t('wallet.swap.insufficient_balance')}
							</span>
						</div>
					{/if}

					<!-- Pending swaps accordion -->
					<PendingSwaps />
				</div>
			</div>
		{/if}

		<!-- Confirm Phase -->
		{#if swapPhase === 'confirm' && (swapRoutes.smartRoute || smartRoute) && selectedDest}
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
				<div>
					<span class="text-base-content/60 mb-1 block text-xs font-medium">
						{isDirectTransfer ? $t('wallet.swap.send_from') : $t('wallet.swap.you_send')}
					</span>
					<SwapPartyCard
						role="source"
						walletInfo={sourceWalletInfo}
						asset={sourceAsset}
						icon={sourceIcon}
						amountDisplay={isBitcoinAsset(sourceType)
							? `${satsFormatter.format(Math.round(parseFloat(swapCalc.amount || '0')))} ${$t('wallet.sats')}`
							: usdFormatter.format(parseFloat(swapCalc.amount || '0'))}
						usdEquivalent={isBitcoinAsset(sourceType)
							? `≈ ${usdFormatter.format((Math.round(parseFloat(swapCalc.amount || '0')) / 100_000_000) * btcUsdPrice)}`
							: undefined}
						showSatsAbove={isBitcoinAsset(sourceType)}
						chainBadgeIcon={sourceType === 'usdt0-arb' ? '/images/chains/arbitrum.png' : undefined}
						variant="confirm"
						walletType={sourceWalletType}
						walletAddress={sourceWalletAddress}
						assetName={sourceAssetName}
					/>
				</div>

				<!-- Provider / Route / Fee -->
				<div class="flex flex-col items-center gap-1 py-1">
					<div class="bg-base-200 flex items-center gap-2 rounded-full px-4 py-2">
						{#if isDirectTransfer}
							<svg
								class="text-success h-5 w-5 shrink-0"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/>
							</svg>
							<span class="text-success text-sm font-semibold">{$t('wallet.swap.direct_send')}</span
							>
						{:else}
							<svg
								class="text-primary h-4 w-4 shrink-0 sm:h-5 sm:w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/>
							</svg>
							<span class="text-sm font-semibold">{getProviderLabel()}</span>
						{/if}
						{#if effectiveSmartRoute?.estimatedTime}
							<span class="text-base-content/50 text-xs">· {effectiveSmartRoute.estimatedTime}</span
							>
						{/if}
					</div>
					{#if !isDirectTransfer && totalFeeSats > 0}
						<span class="text-base-content/50 text-xs">
							{$t('wallet.swap.fee_percent') || 'Fee'}: −{formatSats(totalFeeSats)}
							{$t('wallet.sats')}
							{#if btcUsdPrice > 0 && (totalFeeSats / 100_000_000) * btcUsdPrice >= 0.01}
								≈ {usdFormatter.format((totalFeeSats / 100_000_000) * btcUsdPrice)}
							{/if}
						</span>
					{/if}
				</div>

				<!-- Destination Card -->
				<div>
					<span class="text-base-content/60 mb-1 block text-xs font-medium">
						{isDirectTransfer ? $t('wallet.swap.send_to') : $t('wallet.swap.you_get')}
					</span>
					<SwapPartyCard
						role="dest"
						walletInfo={destWalletInfo}
						asset={selectedDest.asset}
						icon={selectedDest.icon}
						amountDisplay={isBitcoinAsset(selectedDest.asset, selectedDest.id)
							? `${satsFormatter.format(Math.round(parseFloat(estimatedOutput) * 100_000_000))} ${$t('wallet.sats')}`
							: usdFormatter.format(parseFloat(estimatedOutput))}
						usdEquivalent={isBitcoinAsset(selectedDest.asset, selectedDest.id)
							? `≈ ${usdFormatter.format(parseFloat(estimatedOutput) * btcUsdPrice)}`
							: undefined}
						showSatsAbove={isBitcoinAsset(selectedDest.asset, selectedDest.id)}
						chainBadgeIcon={selectedDest.asset === 'USDT0'
							? '/images/chains/arbitrum.png'
							: undefined}
						variant="confirm"
						walletType={destWalletType}
						walletAddress={destWalletAddress}
						assetName={destAssetName}
					/>
				</div>

				<!-- Cross-chain warning removed per user request -->
			</div>
		{/if}

		<!-- Executing Phase -->
		{#if swapPhase === 'executing'}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col items-center gap-4 py-6">
				<span class="loading loading-spinner loading-lg text-primary"></span>
				<p class="text-sm font-medium sm:text-base">
					{swapProgressMessage || $t('wallet.swap.swap_executing')}
				</p>

				<!-- Step Tracker -->
				<div class="flex w-full max-w-xs flex-col gap-2 text-xs">
					{#each SWAP_PROGRESS_STEPS as step, i (step.key)}
						{@const isDone = i < currentStepIdx}
						{@const isCurrent = i === currentStepIdx}
						<div
							class="flex items-center gap-2 {isDone
								? 'text-success'
								: isCurrent
									? 'text-primary'
									: 'text-base-content/40'}"
						>
							{#if isDone}
								<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{:else if isCurrent}
								<span class="loading loading-spinner loading-xs text-primary shrink-0"></span>
							{:else}
								<span class="h-4 w-4 shrink-0 rounded-full border border-current opacity-40"></span>
							{/if}
							<span class={isDone ? 'line-through opacity-60' : ''}>{step.label}</span>
						</div>
					{/each}
				</div>

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
							{swapWallets.walletLabel(sourceWallet)}
							{$t('wallet.swap.sent_to')}
							{swapWallets.walletLabel(destWallet)}
						</p>
					{/if}
				</div>

				<!-- Transaction Summary Cards -->
				<div class="bg-base-200 space-y-3 rounded-xl p-4">
					<SwapPartyCard
						role="source"
						walletInfo={sourceWalletInfo}
						asset={sourceAsset}
						icon={sourceIcon}
						amountDisplay={isBtcSource
							? satsUsd(Math.round(parseFloat(swapCalc.amount || '0')), btcUsdPrice)
							: `${usdFormatter.format(parseFloat(swapCalc.amount || '0'))} ${sourceAsset}`}
						variant="success"
						{isDirectTransfer}
						walletType={sourceWalletType}
						walletAddress={sourceWalletAddress}
						assetName={sourceAssetName}
					/>

					<!-- Provider bridge kept (small) -->
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
								<span>{getProviderLabel()}</span>
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

					<SwapPartyCard
						role="dest"
						walletInfo={destWalletInfo}
						asset={selectedDest!.asset}
						icon={selectedDest!.icon}
						amountDisplay={isBitcoinAsset(selectedDest!.asset, selectedDest!.id)
							? satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000), btcUsdPrice)
							: `${usdFormatter.format(parseFloat(estimatedOutput))} ${selectedDest!.asset}`}
						variant="success"
						{isDirectTransfer}
						walletType={destWalletType}
						walletAddress={destWalletAddress}
						assetName={destAssetName}
					/>
				</div>

				<!-- Fee + Time row — only for swaps (uses SwapEstimateCard for DRY, success-fee variant) -->
				{#if !isDirectTransfer}
					<SwapEstimateCard
						variant="success-fee"
						feePercent={effectiveSmartRoute?.totalFeePercent ?? 0}
						estimatedTime={effectiveSmartRoute?.estimatedTime ?? '—'}
						{isDirectTransfer}
					/>
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

		<!-- Error / Failed Phase (with SwapFallback support) -->
		{#if swapPhase === 'failed'}
			<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col gap-4 py-4">
				{#if smartRoute?.fallbackRoutes && smartRoute.fallbackRoutes.length > 0}
					<SwapFallback {smartRoute} onRetry={(route: SmartRoute) => retryWithFallback(route)} />
				{:else}
					<div class="flex flex-col items-center gap-3 py-6">
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
			<div class="flex gap-3 sm:justify-end">
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
			{#if needsArbEth && arbEthCheckDone && arbEthBalance !== 'unknown' && parseFloat(arbEthBalance) < 0.0001}
				<div class="alert alert-warning py-2 text-xs">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<span>{$t('wallet.swap.arb_eth_warning', { values: { balance: arbEthBalance } })}</span>
				</div>
			{/if}
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
