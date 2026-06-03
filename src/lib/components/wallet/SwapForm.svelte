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
	import { startSwapChain } from '$lib/services/swap-chain.service';
	import type { SmartRoute } from '$lib/services/SmartRouter';
	// resolveRouteAsync / SmartRouter / createInitial moved to use-swap-routes rune (Phase 1); only type for local fallback smartRoute kept.
	import SwapFallback from '$lib/components/wallet/SwapFallback.svelte';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { createDebug } from '$lib/utils/debug';
	import Drawer from '$lib/components/Drawer.svelte';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import AssetSelector from '$lib/components/wallet/AssetSelector.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import * as Sentry from '@sentry/sveltekit';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { useSwapWallets } from '$lib/runes/use-swap-wallets.svelte.ts';
	import { useSwapCalculator } from '$lib/runes/use-swap-calculator.svelte.ts';
	import { useSwapRoutes } from '$lib/runes/use-swap-routes.svelte.ts';
	import SwapPartyCard from '$lib/components/wallet/SwapPartyCard.svelte';
	import SwapEstimateCard from '$lib/components/wallet/SwapEstimateCard.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';

	const d = createDebug('swap');

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

	// SmartRouter instance no longer needed here (routes rune owns its internal or DI one for testability).

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
	// amount + swapPercent owned by swapCalc rune (full encapsulation for bidir/rounding); access via swapCalc.amount etc.
	let swapPhase = $state<'form' | 'confirm' | 'executing' | 'complete' | 'failed'>('form');
	let errorMessage = $state('');
	let swapResult = $state<{ txHash?: string; swapId?: string } | null>(null);
	let isFlipping = $state(false);
	// smartRoute kept local ONLY for SwapFallback retryWithFallback injection (experimental Smart override); main route state in swapRoutes rune.
	let smartRoute = $state<SmartRoute | null>(null);

	// Network status for offline guards (pattern from EarnLendStep + CLAUDE "network awareness")
	let isOnline = $derived($browserNetworkStatus.online);

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
	// isConnectedDest removed (dead after rune extraction; was only for legacy, now unused)

	const swapWallets = useSwapWallets({
		getSourceWalletId: () => sourceWallet,
		getDestWalletId: () => destWallet,
		getSourceType: () => sourceType,
		getDestType: () => destType
	});

	const swapCalc = useSwapCalculator({
		getWalletBalanceToken: () =>
			sourceType === 'rbtc'
				? (sourceWallet === 'builtin' ? builtinRbtcSats : swapWallets.sourceBalances.rbtcSats) /
					100_000_000
				: sourceWallet === 'builtin'
					? builtinUsdt0
					: swapWallets.sourceBalances.usdt0,
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

	// Re-export pure from calc for template (satsUsd used in labels).
	const satsUsd = swapCalc.satsUsd;

	// Effective smart for display (local fallback override takes precedence for SwapFallback retry path).
	let effectiveSmartRoute = $derived(smartRoute || swapRoutes.smartRoute);

	// For rBTC (BTC asset) source: allow entering amount in USD via compact toggle left of input.
	let btcUsdInputMode = $state(false);

	// Sync display amount shown in input (for usd mode on rbtc, we show usd value, but keep calc in native sats)
	let displayInputAmount = $state('');
	let syncingFromInput = false;

	$effect(() => {
		const nativeStr = swapCalc.amount;
		if (sourceType === 'rbtc' && btcUsdInputMode) {
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
		// reset usd mode when source changes away from rbtc
		if (sourceType !== 'rbtc' && btcUsdInputMode) {
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
				available: hasExternalBtcWallet
			});
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
	let sourceAsset = $derived(sourceType === 'rbtc' ? 'rBTC' : 'USDT');
	let sourceIcon = $derived(
		sourceType === 'rbtc'
			? '/images/chains/Bitcoin-Rootstock-logo.webp'
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

	// hasExternalBtcWallet + balances delegated to swapWallets rune (Phase 1).
	// externalBtcBalanceSats let removed (dead alias; templates use swapWallets.externalBtcBalanceSats directly).
	let hasExternalBtcWallet = $derived(swapWallets.hasExternalBtcWallet);
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

	// Wallet-level USD balance — local version using $walletStore directly.
	// The rune's builtinBalance/walletBalanceFor use $derived which breaks
	// when $state is mutated inside $effect subscription callbacks.
	const builtinBalanceUsd = $derived.by(() => {
		const sats = $walletStore.totalBalances?.sats ?? 0;
		const usdt = parseFloat($walletStore.arb?.formattedUsdt0Balance || '0');
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return new Intl.NumberFormat($locale, { style: 'currency', currency: 'USD' }).format(usd);
	});

	function walletBalanceForFn(walletId: string): string {
		if (walletId === 'builtin') return builtinBalanceUsd;
		// Connected wallets: delegate to rune (these work fine — they read
		// connectedSnap which is updated via a different subscription path).
		return swapWallets.walletBalanceFor(walletId);
	}

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
								? `Send to ${swapWallets.connectedWallets.find((w) => w.id === destWallet)?.walletName || 'wallet'}`
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

	// Amount/insuff/valid now from swapCalc rune (unified, exact rounding + guards).
	let amountSats = $derived(swapCalc.amountSats);
	let isInsufficientBalance = $derived(swapCalc.isInsufficientBalance);
	let canSwap = $derived(
		swapCalc.isValidAmount &&
			(swapRoutes.smartRoute !== null || swapRoutes.asyncRouteResult.routes.length > 0) &&
			swapPhase === 'form' &&
			isOnline
	);

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
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap direction flipped',
			data: { from: sourceType, to: sourceType === 'rbtc' ? 'usdt0-arb' : 'rbtc' }
		});
		isFlipping = true;
		d.log(
			'swapDirection: flipping from %s → %s',
			sourceType,
			sourceType === 'rbtc' ? 'usdt0-arb' : 'rbtc'
		);
		setTimeout(() => (isFlipping = false), 300);

		if (sourceType === 'rbtc') {
			sourceType = 'usdt0-arb';
			destType = 'rbtc-rsk';
		} else {
			sourceType = 'rbtc';
			destType = 'usdt0-arb';
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
			for (const w of swapWallets.connectedWallets) {
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
		triggerHaptic(ImpactStyle.Heavy);

		d.log(
			'executeSwap: source=%s dest=%s amount=%s sourceAddr=%s destAddr=%s',
			sourceType,
			destType,
			amountInTokenUnits,
			swapWallets.sourceAddr.substring(0, 10),
			swapWallets.destAddr.substring(0, 10)
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
		const p = smartRoute?.provider ?? swapRoutes.smartRoute?.provider ?? '';
		if (!p) return '';
		return p.charAt(0).toUpperCase() + p.slice(1);
	}

	// -----------------------------------------------------------------------
	// Helpers for confirm/success screens
	// -----------------------------------------------------------------------

	/** True when this is a same-asset wallet-to-wallet send (not a swap). */
	let isDirectTransfer = $derived(
		(sourceType === 'rbtc' && destType === 'rbtc-rsk') ||
			(sourceType === 'usdt0-arb' && destType === 'usdt0-arb')
	);

	// Wallet labels/info now from swapWallets rune (centralized, no more find + builtin fallback dupe).
	let sourceWalletInfo = $derived(swapWallets.sourceWalletInfo);
	let destWalletInfo = $derived(swapWallets.destWalletInfo);
	// walletLabel/addrSnippet available as swapWallets.walletLabel(id), .addrSnippet if needed for other UI.
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
						builtinBalance={builtinBalanceUsd}
						connectedWallets={swapWallets.connectedWallets}
						walletBalanceFor={walletBalanceForFn}
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
						builtinBalance={builtinBalanceUsd}
						connectedWallets={swapWallets.connectedWallets}
						walletBalanceFor={walletBalanceForFn}
						expanded={destExpand}
						onToggle={() => (destExpand = !destExpand)}
					/>

					<!-- Destination Asset Selector -->
					<AssetSelector
						selectedId={destType}
						onSelect={(id) => {
							destType = id as DestType;
							smartRoute = null;
						}}
						assets={destAssets}
						expanded={destAssetExpand}
						onToggle={() => (destAssetExpand = !destAssetExpand)}
					/>

					<!-- Amount Input (now unified via AmountInputSection direct variant for DRY + parity) -->
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
									? satsUsd(Math.round(parseFloat(walletBalanceToken) * 100_000_000), btcUsdPrice)
									: `${walletBalanceDisplay}`}
							</span>
						</label>
						<AmountInputSection
							variant="direct"
							amount={displayInputAmount}
							onAmountChange={(v: string) => {
								if (sourceType === 'rbtc' && btcUsdInputMode) {
									// usd entered for rbtc source -> convert to native sats str for calc
									const usdNum = parseFloat(v || '0');
									if (usdNum > 0 && btcUsdPrice > 0) {
										const frac = usdNum / btcUsdPrice;
										swapCalc.amount = Math.round(frac * 100_000_000).toString();
									} else {
										swapCalc.amount = '';
									}
									syncingFromInput = true;
									displayInputAmount = v; // preserve typed usd value; effect will skip overwrite
								} else if (sourceType === 'usdt0-arb') {
									// enforce 2 decimals + floor dust for usdt
									const n = parseFloat(v || '0');
									const clean = n > 0 ? (Math.floor(n * 100) / 100).toFixed(2) : '';
									swapCalc.amount = clean;
								} else {
									swapCalc.amount = v;
								}
							}}
							tokenPrefix={sourceType !== 'rbtc' ? '$' : undefined}
							showPercentSlider={true}
							sliderDisabled={swapCalc.walletBalanceToken <= 0}
							percent={swapCalc.swapPercent}
							onPercentChange={applyPercent}
							onMaxAmount={async () => setMaxAmount()}
							disabled={!isOnline}
							hasInsufficientBalance={isInsufficientBalance}
							maxDisabled={swapCalc.walletBalanceToken <= 0}
							supportsBtcUsdToggle={sourceType === 'rbtc'}
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
						/>
					</div>

					<!-- Fee/estimate card — always renders (no layout shift); skeleton while loading, dashes when empty -->
					{#if selectedDest}
						<SwapEstimateCard
							variant="form"
							totalSent={amountInTokenUnits > 0
								? sourceType === 'rbtc'
									? satsUsd(amountSats, btcUsdPrice)
									: usdFormatter.format(amountInTokenUnits)
								: undefined}
							feeDisplay={totalFeeSats > 0
								? `−${formatSats(totalFeeSats)} ${$t('wallet.sats')}${btcUsdPrice > 0 && (totalFeeSats / 100_000_000) * btcUsdPrice >= 0.01 ? ' ≈ ' + usdFormatter.format((totalFeeSats / 100_000_000) * btcUsdPrice) : ''}`
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

				<!-- Source Card (reuses SwapPartyCard to eliminate dupe) -->
				<SwapPartyCard
					role="source"
					walletInfo={sourceWalletInfo}
					asset={sourceAsset}
					icon={sourceIcon}
					amountDisplay={sourceType === 'rbtc'
						? satsUsd(Math.round(parseFloat(swapCalc.amount || '0')), btcUsdPrice)
						: usdFormatter.format(parseFloat(swapCalc.amount || '0'))}
					usdEquivalent={undefined}
					chainBadgeIcon={sourceType === 'usdt0-arb' ? '/images/chains/arbitrum.png' : undefined}
					{isDirectTransfer}
					variant="confirm"
				/>

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
							<span class="text-sm font-semibold">{getProviderLabel()}</span>
						{/if}
						<span class="text-base-content/60 text-xs">
							{#if !isDirectTransfer && effectiveSmartRoute && effectiveSmartRoute.totalFeePercent > 0 && amountSats > 0 && btcUsdPrice > 0}
								{usdFormatter.format(
									(amountSats / 100_000_000) *
										btcUsdPrice *
										(effectiveSmartRoute.totalFeePercent / 100)
								)}
							{/if}
							{effectiveSmartRoute && effectiveSmartRoute.totalFeePercent > 0
								? ' · '
								: ''}{effectiveSmartRoute ? effectiveSmartRoute.estimatedTime : ''}
						</span>
					</div>
				</div>

				<!-- Destination Card (reuses SwapPartyCard) -->
				<SwapPartyCard
					role="dest"
					walletInfo={destWalletInfo}
					asset={selectedDest.asset}
					icon={selectedDest.icon}
					amountDisplay={isBitcoinAsset(selectedDest.asset, selectedDest.id)
						? satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000), btcUsdPrice)
						: usdFormatter.format(parseFloat(estimatedOutput))}
					usdEquivalent={undefined}
					chainBadgeIcon={selectedDest.asset === 'USDT0'
						? '/images/chains/arbitrum.png'
						: undefined}
					{isDirectTransfer}
					variant="confirm"
				/>

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
							{swapWallets.walletLabel(sourceWallet)}
							{$t('wallet.swap.sent_to')}
							{swapWallets.walletLabel(destWallet)}
						</p>
					{/if}
				</div>

				<!-- Transaction Summary Cards (reuses SwapPartyCard for source/dest DRY) -->
				<div class="bg-base-200 space-y-3 rounded-xl p-4">
					<SwapPartyCard
						role="source"
						walletInfo={sourceWalletInfo}
						asset={sourceAsset}
						icon={sourceIcon}
						amountDisplay={sourceType === 'rbtc'
							? satsUsd(Math.round(parseFloat(swapCalc.amount || '0')), btcUsdPrice)
							: `${usdFormatter.format(parseFloat(swapCalc.amount || '0'))} ${sourceAsset}`}
						variant="success"
						{isDirectTransfer}
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
