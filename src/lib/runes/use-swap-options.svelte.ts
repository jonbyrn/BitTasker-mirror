/**
 * use-swap-options.svelte.ts
 *
 * Svelte 5 rune extracting SwapForm.svelte's destination options, asset lists,
 * and balance derivations.
 *
 * Extracted from SwapForm.svelte (lines 274–780):
 * - Chain constants (CHAIN_RSK, CHAIN_ARB, CHAIN_WBTC, CHAIN_BTC)
 * - destOptions $derived.by — destination option list based on source type
 * - sourceAsset / sourceIcon $derived
 * - Balance derivations (builtin wallet + source/dest wallet-aware)
 * - walletBtcSatsFor / walletUsdt0For helpers (connected wallet lookup)
 * - destAssets / sourceAssets (AssetOption[] for selectors)
 * - visibleDestOptions / selectedDest
 *
 * Reactive pattern: subscribes to walletStore, connectedWalletsStore, and
 * svelte-i18n `t` store via $effect → $state bridge (same as use-swap-wallets).
 * Component state (sourceType, destType, sourceWallet, destWallet) is received
 * as getter params so the rune stays outside the component boundary.
 *
 * Testability: pure chain constants exported; rune is factory fn with injectable
 * params; 5-state/edge/unit on pure + rune (vitest hoisted mocks).
 */

import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { formatSats, walletStore } from '$lib/stores/wallet.store';
import {
	connectedWalletsStore,
	type ConnectedWalletEntry
} from '$lib/stores/connected-wallets.store';
import { SOURCE_TO_SAME_DEST } from '$lib/utils/swap-helpers';
import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
import type { SwapWalletBalances } from '$lib/runes/use-swap-wallets.svelte';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DestType = 'usdt0-arb' | 'rbtc-rsk' | 'wbtc-arb' | 'btc-onchain';

export interface DestOption {
	id: DestType;
	asset: string;
	label: string;
	description: string;
	icon: string;
	network: string;
	chainId: number;
	available: boolean;
}

export interface UseSwapOptionsParams {
	getSourceType: () => string;
	getDestType: () => string;
	getSourceWallet: () => string;
	getDestWallet: () => string;
	getBtcPrice: () => number;
	getDestWalletHasBtcSigner: () => boolean;
	getSourceWalletHasBtcSigner: () => boolean;
	/** Source wallet balances from useSwapWallets rune (for non-builtin wallets) */
	getSwapSourceBalances: () => SwapWalletBalances;
	/** Dest wallet balances from useSwapWallets rune (for non-builtin wallets) */
	getSwapDestBalances: () => SwapWalletBalances;
	/** External BTC on-chain balance in sats from useSwapWallets rune */
	getExternalBtcBalanceSats: () => number;
}

// ---------------------------------------------------------------------------
// Chain constants (exported for testability)
// ---------------------------------------------------------------------------

export const CHAIN_RSK = {
	asset: 'rBTC',
	label: 'Rootstock',
	short: 'RSK',
	icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
	network: 'rootstock-bitcoin',
	chainId: 30
} as const;

export const CHAIN_ARB = {
	asset: 'USDT0',
	label: 'Arbitrum',
	short: 'ARB',
	icon: '/images/chains/Tether-USD.svg',
	network: 'usdt0-arb',
	chainId: 42161
} as const;

export const CHAIN_WBTC = {
	asset: 'WBTC',
	label: 'wBTC',
	short: 'WBTC',
	icon: '/images/tokens/wbtc.png',
	network: 'wbtc-arb',
	chainId: 42161
} as const;

export const CHAIN_BTC = {
	asset: 'BTC',
	label: 'Bitcoin',
	short: 'BTC',
	icon: '/images/chains/Bitcoin.svg',
	network: 'bitcoin',
	chainId: -1
} as const;

// ---------------------------------------------------------------------------
// Rune
// ---------------------------------------------------------------------------

export function useSwapOptions(params: UseSwapOptionsParams) {
	// ---- Store subscriptions (following useSwapWallets pattern) ----

	const walletSnap = $state(get(walletStore));
	const connectedSnap = $state(get(connectedWalletsStore));

	// Dedicated $state for connected wallets list — separate from connectedSnap
	// proxy to ensure Svelte 5's reactivity propagates reliably.
	let connectedWalletsList = $state<ConnectedWalletEntry[]>(get(connectedWalletsStore).wallets);

	// Dedicated $state for totalBalances.sats. Svelte 5's $derived doesn't
	// re-track nested access when the parent proxy is replaced.
	let builtinRbtcSatsState = $state(walletSnap.totalBalances?.sats ?? 0);

	// Dedicated $state for token balances — subscription callbacks run outside
	// the reactive graph, so mutations to walletSnap.arb don't trigger $derived.
	// Using separate $state vars ensures re-evaluation when the subscription fires.
	let builtinUsdt0State = $state(parseFloat(walletSnap.arb?.formattedUsdt0Balance || '0'));
	let builtinWbtcSatsState = $state(
		Math.round(parseFloat(walletSnap.arb?.formattedWbtcBalance || '0') * 100_000_000)
	);
	let builtinTbtcSatsState = $state(
		Math.round(parseFloat(walletSnap.arb?.formattedTbtcBalance || '0') * 100_000_000)
	);

	// Translation function — subscribed to `t` store for locale reactivity.
	let translate = $state<(key: string) => string>(get(t));

	$effect(() => {
		const unsubs: Array<() => void> = [];

		unsubs.push(
			walletStore.subscribe((v) => {
				walletSnap.rsk = v.rsk;
				walletSnap.arb = v.arb;
				walletSnap.bsc = v.bsc;
				walletSnap.totalBalances = v.totalBalances;
				walletSnap.isConnected = v.isConnected;
				walletSnap.isInitializing = v.isInitializing;
				walletSnap.assets = v.assets;
				walletSnap.transactions = v.transactions;
				walletSnap.error = v.error;
				walletSnap.rbtcRateError = v.rbtcRateError;
				const sats = v.totalBalances?.sats ?? 0;
				if (sats !== builtinRbtcSatsState) builtinRbtcSatsState = sats;
				// Update dedicated $state vars for token balances (subscription runs
				// outside reactive graph; direct walletSnap.arb mutations don't trigger $derived)
				const usdt0 = parseFloat(v.arb?.formattedUsdt0Balance || '0');
				if (usdt0 !== builtinUsdt0State) builtinUsdt0State = usdt0;
				const wbtc = Math.round(parseFloat(v.arb?.formattedWbtcBalance || '0') * 100_000_000);
				if (wbtc !== builtinWbtcSatsState) builtinWbtcSatsState = wbtc;
				const tbtc = Math.round(parseFloat(v.arb?.formattedTbtcBalance || '0') * 100_000_000);
				if (tbtc !== builtinTbtcSatsState) builtinTbtcSatsState = tbtc;
			})
		);

		unsubs.push(
			connectedWalletsStore.subscribe((v) => {
				connectedSnap.wallets = v.wallets;
				connectedSnap.activeWalletId = v.activeWalletId;
				connectedSnap.error = v.error;
				connectedSnap.connectingType = v.connectingType;
				connectedWalletsList = v.wallets;
			})
		);

		unsubs.push(t.subscribe((fn) => (translate = fn)));

		return () => {
			unsubs.forEach((u) => u());
		};
	});

	// ---- Derived: source asset / icon ----

	const sourceAsset = $derived.by(() => {
		const st = params.getSourceType();
		if (st === 'rbtc' || st === 'btc-onchain') return 'BTC';
		if (st === 'wbtc-arb') return 'WBTC';
		if (st === 'tbtc-arb') return 'TBTC';
		return 'USDT';
	});

	const sourceIcon = $derived.by(() => {
		const st = params.getSourceType();
		if (st === 'rbtc') return '/images/chains/Bitcoin-Rootstock-logo.webp';
		if (st === 'btc-onchain') return '/images/chains/Bitcoin.svg';
		if (st === 'wbtc-arb') return '/images/tokens/wbtc.png';
		if (st === 'tbtc-arb') return '/images/tokens/tbtc.png';
		return '/images/chains/Tether-USD.svg';
	});

	// ---- Builtin wallet balances ----

	const builtinRbtcSats = $derived(builtinRbtcSatsState);
	const builtinUsdt0 = $derived(builtinUsdt0State);
	const builtinWbtcSats = $derived(builtinWbtcSatsState);
	const builtinTbtcSats = $derived(builtinTbtcSatsState);

	// ---- Source/dest balances (builtin vs connected wallet) ----

	const sourceRbtcSats = $derived(
		params.getSourceWallet() === 'builtin'
			? builtinRbtcSats
			: params.getSwapSourceBalances().rbtcSats
	);
	const sourceUsdt0Usd = $derived(
		params.getSourceWallet() === 'builtin' ? builtinUsdt0 : params.getSwapSourceBalances().usdt0
	);
	const sourceWbtcSats = $derived(
		params.getSourceWallet() === 'builtin'
			? builtinWbtcSats
			: params.getSwapSourceBalances().wbtcSats
	);
	const sourceTbtcSats = $derived(
		params.getSourceWallet() === 'builtin'
			? builtinTbtcSats
			: (params.getSwapSourceBalances().tbtcSats ?? 0)
	);
	const destRbtcSats = $derived(
		params.getDestWallet() === 'builtin' ? builtinRbtcSats : params.getSwapDestBalances().rbtcSats
	);
	const destUsdt0Usd = $derived(
		params.getDestWallet() === 'builtin' ? builtinUsdt0 : params.getSwapDestBalances().usdt0
	);
	const destWbtcSats = $derived(
		params.getDestWallet() === 'builtin' ? builtinWbtcSats : params.getSwapDestBalances().wbtcSats
	);

	// ---- Destination options (computed from source) ----

	const destOptions = $derived.by<DestOption[]>(() => {
		const sourceType = params.getSourceType();
		const sourceWallet = params.getSourceWallet();
		const destWallet = params.getDestWallet();
		const destWalletHasBtcSigner = params.getDestWalletHasBtcSigner();

		const options: DestOption[] = [];

		if (sourceType === 'rbtc') {
			options.push({
				id: 'usdt0-arb',
				asset: CHAIN_ARB.asset,
				label: CHAIN_ARB.label,
				description: translate('wallet.swap.desc_rbtc_to_usdt'),
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
					description: translate('wallet.swap.desc_same_wallet_transfer'),
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
				description: translate('wallet.swap.desc_rbtc_to_wbtc'),
				icon: CHAIN_WBTC.icon,
				network: CHAIN_WBTC.network,
				chainId: CHAIN_WBTC.chainId,
				available: true
			});

			options.push({
				id: 'btc-onchain',
				asset: CHAIN_BTC.asset,
				label: CHAIN_BTC.label,
				description: translate('wallet.swap.desc_rbtc_to_btc'),
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
				description: translate('wallet.swap.desc_btc_to_rbtc'),
				icon: CHAIN_RSK.icon,
				network: CHAIN_RSK.network,
				chainId: CHAIN_RSK.chainId,
				available: true
			});

			options.push({
				id: 'usdt0-arb',
				asset: CHAIN_ARB.asset,
				label: CHAIN_ARB.label,
				description: translate('wallet.swap.desc_btc_to_usdt'),
				icon: CHAIN_ARB.icon,
				network: CHAIN_ARB.network,
				chainId: CHAIN_ARB.chainId,
				available: true
			});

			options.push({
				id: 'wbtc-arb',
				asset: CHAIN_WBTC.asset,
				label: CHAIN_WBTC.label,
				description: translate('wallet.swap.desc_btc_to_wbtc'),
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
					description: translate('wallet.swap.desc_same_wallet_transfer'),
					icon: CHAIN_BTC.icon,
					network: CHAIN_BTC.network,
					chainId: CHAIN_BTC.chainId,
					available: destWalletHasBtcSigner
				});
			}
		} else {
			// wbtc-arb, usdt0-arb, tbtc-arb sources
			options.push({
				id: 'rbtc-rsk',
				asset: CHAIN_RSK.asset,
				label: CHAIN_RSK.label,
				description: translate('wallet.swap.desc_usdt_to_rbtc'),
				icon: CHAIN_RSK.icon,
				network: CHAIN_RSK.network,
				chainId: CHAIN_RSK.chainId,
				available: true
			});

			// USDT0 on Arbitrum — unavailable as a swap target when it's a same-wallet same-asset self-send
			options.push({
				id: 'usdt0-arb',
				asset: CHAIN_ARB.asset,
				label: CHAIN_ARB.label,
				description: translate('wallet.swap.desc_usdt_to_rbtc'),
				icon: CHAIN_ARB.icon,
				network: CHAIN_ARB.network,
				chainId: CHAIN_ARB.chainId,
				available: SOURCE_TO_SAME_DEST[sourceType] !== 'usdt0-arb' || sourceWallet !== destWallet
			});

			// wBTC on Arbitrum — same-chain DEX swap via Symbiosis
			options.push({
				id: 'wbtc-arb',
				asset: CHAIN_WBTC.asset,
				label: CHAIN_WBTC.label,
				description: translate('wallet.swap.desc_btc_to_wbtc'),
				icon: CHAIN_WBTC.icon,
				network: CHAIN_WBTC.network,
				chainId: CHAIN_WBTC.chainId,
				available: SOURCE_TO_SAME_DEST[sourceType] !== 'wbtc-arb' || sourceWallet !== destWallet
			});

			// Self-swap (same asset) — only for cross-wallet transfers
			if (sourceWallet !== destWallet) {
				options.push({
					id: sourceType as DestType,
					asset: sourceAsset,
					label:
						sourceType === 'wbtc-arb'
							? CHAIN_WBTC.label
							: sourceType === 'usdt0-arb'
								? CHAIN_ARB.label
								: CHAIN_WBTC.label,
					description: translate('wallet.swap.desc_same_wallet_transfer'),
					icon:
						sourceType === 'wbtc-arb'
							? CHAIN_WBTC.icon
							: sourceType === 'usdt0-arb'
								? CHAIN_ARB.icon
								: CHAIN_WBTC.icon,
					network:
						sourceType === 'wbtc-arb'
							? CHAIN_WBTC.network
							: sourceType === 'usdt0-arb'
								? CHAIN_ARB.network
								: CHAIN_WBTC.network,
					chainId:
						sourceType === 'wbtc-arb'
							? CHAIN_WBTC.chainId
							: sourceType === 'usdt0-arb'
								? CHAIN_ARB.chainId
								: CHAIN_WBTC.chainId,
					available: true
				});
			}
		}

		return options;
	});

	// ---- Filtered / selected dest ----

	const visibleDestOptions = $derived(destOptions.filter((o) => o.available));

	const selectedDest = $derived(
		visibleDestOptions.find((o) => o.id === params.getDestType()) || visibleDestOptions[0]
	);

	// ---- Wallet helpers (connected wallet balance lookups) ----

	/** BTC sats for a wallet (builtin = rBTC + BTC + wBTC + tBTC from walletStore; connected = from balances) */
	function walletBtcSatsFor(walletId: string): number {
		if (walletId === 'builtin') {
			return builtinRbtcSats + builtinWbtcSats + builtinTbtcSats;
		}
		const w = connectedWalletsList.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		// All connectors store rbtc/btc/wbtc raw values already in sats
		return (
			Number(w.balances.rbtc?.raw ?? 0) +
			Number(w.balances.btc?.raw ?? 0) +
			Number(w.balances.wbtc?.raw ?? 0)
		);
	}

	/** USDT0 on Arbitrum for a wallet (returns USD amount) */
	function walletUsdt0For(walletId: string): number {
		if (walletId === 'builtin') return builtinUsdt0;
		const w = connectedWalletsList.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		// raw is in smallest unit (6 decimals for USDT0)
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e6;
	}

	// ---- Asset option lists ----

	const destAssets = $derived.by<AssetOption[]>(() => {
		const sourceWallet = params.getSourceWallet();
		const destWallet = params.getDestWallet();
		const btcPriceVal = params.getBtcPrice();
		const extBtcSats = params.getExternalBtcBalanceSats();
		// Touch connectedWalletsList so $derived tracks it (walletName lookup)
		void connectedWalletsList.length;

		return visibleDestOptions.map((o) => ({
			id: o.id,
			label:
				o.asset === 'USDT0'
					? translate('wallet.swap.asset.usd')
					: o.asset === 'rBTC'
						? translate('wallet.swap.asset.bitcoin_rbtc')
						: o.asset === 'WBTC'
							? translate('wallet.swap.asset.bitcoin_wbtc')
							: o.id === 'btc-onchain'
								? translate('wallet.swap.asset.bitcoin_btc')
								: `${o.asset}`,
			symbol: o.asset,
			icon: o.icon,
			subLabel:
				o.id === 'usdt0-arb'
					? translate('wallet.swap.network.usdt0_arbitrum')
					: o.id === 'wbtc-arb'
						? translate('wallet.swap.network.wbtc_arbitrum')
						: o.id === 'rbtc-rsk'
							? sourceWallet !== destWallet
								? `${translate('wallet.swap.send_to')} ${connectedWalletsList.find((w) => w.id === destWallet)?.walletName || 'wallet'}`
								: o.description
							: o.description,
			available: o.available,
			balance:
				o.id === 'usdt0-arb'
					? `$${destUsdt0Usd.toFixed(2)}`
					: o.id === 'rbtc-rsk'
						? formatSats(destRbtcSats) + ' ' + translate('wallet.sats')
						: o.id === 'wbtc-arb'
							? formatSats(destWbtcSats) + ' ' + translate('wallet.sats')
							: o.id === 'btc-onchain'
								? formatSats(extBtcSats) + ' ' + translate('wallet.sats')
								: undefined,
			balanceSub:
				o.id === 'rbtc-rsk'
					? `≈ $${((destRbtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
					: o.id === 'wbtc-arb'
						? `≈ $${((destWbtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
						: o.id === 'btc-onchain'
							? `≈ $${((extBtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
							: undefined
		}));
	});

	const sourceAssets = $derived.by<AssetOption[]>(() => {
		const sourceWalletHasBtcSigner = params.getSourceWalletHasBtcSigner();
		const btcPriceVal = params.getBtcPrice();
		const extBtcSats = params.getExternalBtcBalanceSats();

		const assets: AssetOption[] = [
			{
				id: 'rbtc',
				label: translate('wallet.swap.asset.bitcoin_rbtc'),
				icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
				symbol: 'rBTC',
				subLabel: translate('wallet.swap.network.bitcoin_rootstock'),
				balance: formatSats(sourceRbtcSats) + ' ' + translate('wallet.sats'),
				balanceSub: `≈ $${((sourceRbtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
			},
			{
				id: 'usdt0-arb',
				label: translate('wallet.swap.asset.usd'),
				icon: '/images/chains/Tether-USD.svg',
				symbol: 'USDT',
				subLabel: translate('wallet.swap.network.usdt0_arbitrum'),
				balance: `$${sourceUsdt0Usd.toFixed(2)}`
			},
			{
				id: 'wbtc-arb',
				label: translate('wallet.swap.asset.bitcoin_wbtc'),
				icon: '/images/tokens/wbtc.png',
				symbol: 'wBTC',
				subLabel: translate('wallet.swap.network.wbtc_arbitrum'),
				balance: formatSats(sourceWbtcSats) + ' ' + translate('wallet.sats'),
				balanceSub: `≈ $${((sourceWbtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
			},
			// BTC on-chain — only available when the selected source wallet has a BTC signer
			...(sourceWalletHasBtcSigner
				? [
						{
							id: 'btc-onchain' as const,
							label: translate('wallet.swap.asset.bitcoin_btc'),
							icon: '/images/chains/Bitcoin.svg',
							symbol: 'BTC',
							subLabel: translate('wallet.swap.network.bitcoin_onchain'),
							balance: formatSats(extBtcSats) + ' ' + translate('wallet.sats'),
							balanceSub: `≈ $${((extBtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
						}
					]
				: []),
			// tBTC on Arbitrum — tier 2 asset (only shown when balance > 0)
			...(sourceTbtcSats > 0
				? [
						{
							id: 'tbtc-arb' as const,
							label: translate('wallet.swap.asset.bitcoin_tbtc'),
							icon: '/images/tokens/tbtc.png',
							symbol: 'tBTC',
							subLabel: translate('wallet.swap.network.tbtc_arbitrum'),
							balance: formatSats(sourceTbtcSats) + ' ' + translate('wallet.sats'),
							balanceSub: `≈ $${((sourceTbtcSats / 100_000_000) * btcPriceVal).toFixed(2)}`
						}
					]
				: [])
		];

		return assets;
	});

	// ---- Return (getters so $derived in consumers re-track reactive values) ----

	return {
		get destOptions() {
			return destOptions;
		},
		get visibleDestOptions() {
			return visibleDestOptions;
		},
		get selectedDest() {
			return selectedDest;
		},
		get sourceAsset() {
			return sourceAsset;
		},
		get sourceIcon() {
			return sourceIcon;
		},
		get destAssets() {
			return destAssets;
		},
		get sourceAssets() {
			return sourceAssets;
		},
		get builtinRbtcSats() {
			return builtinRbtcSats;
		},
		get builtinUsdt0() {
			return builtinUsdt0;
		},
		get builtinWbtcSats() {
			return builtinWbtcSats;
		},
		get builtinTbtcSats() {
			return builtinTbtcSats;
		},
		get sourceRbtcSats() {
			return sourceRbtcSats;
		},
		get sourceUsdt0Usd() {
			return sourceUsdt0Usd;
		},
		get sourceWbtcSats() {
			return sourceWbtcSats;
		},
		get sourceTbtcSats() {
			return sourceTbtcSats;
		},
		get destRbtcSats() {
			return destRbtcSats;
		},
		get destUsdt0Usd() {
			return destUsdt0Usd;
		},
		get destWbtcSats() {
			return destWbtcSats;
		},
		walletBtcSatsFor,
		walletUsdt0For
	};
}
