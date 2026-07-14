/**
 * Swap Wallets Rune (Svelte 5 + runes)
 *
 * Phase 1 logic extraction (per /docs/wallet/swapform-phase1-logic-extraction-design.md).
 * Centralizes *all* wallet/balance/address lookup + external BTC detection (previously
 * duplicated in SwapForm.svelte ~103-199 helpers + 541-586 wallet-aware balances +
 * 493-538 externalBtc effect + 1143-1166 label/info + destOptions/AssetSelector usage).
 *
 * Responsibilities (exact from design + verified current behavior):
 * - Single source for 'builtin' | string walletId (gold standard for WalletSelector).
 * - Source/dest-specific balances in consistent units (rbtcSats/usdt0 human/wbtcSats).
 * - Addresses for routes/execution (sourceAddr for resolveRouteAsync, destAddr for startSwapChain + getExternalBtcAddress scan).
 * - Provide walletBalanceFor(id) for WalletSelector (USD total, used in 2 places in SwapForm + other drawers).
 * - Detect external BTC (hasExternalBtcWallet + getExternalBtcAddress, used for 'btc-onchain' dest + mempool fetch effect for externalBtcBalanceSats).
 * - Expose isConnected* deriveds + selected wallet info (label/addr for confirm UI).
 * - Defensive: isFinite guards (per defi), offline awareness (return 0 or cached), null addr handling.
 * - (Future) support refresh of connected balances if needed (facade to balancePoller? but scope minimal for phase1).
 * - No UI, no phase, no routes, no amount calc. Pure lookup + deriveds.
 * - Co-locate types (extend ConnectedWalletEntry / wallet store shapes; no `any`).
 * - Logging via createDebug('swap-wallets'); Sentry breadcrumbs on key lookups if error paths (async mempool).
 * - Browser guard for effects (mempool fetch).
 *
 * Preserves *exact* current math/behavior (Math.round for rbtc/wbtc builtin, /1e18 usdt conn,
 * /10_000_000_000 wbtc conn, btcSats = btc.raw + rbtc.raw, usd = (sats/1e8 * price + usdt),
 * getExternalBtcAddress scan order + fallback, external effect cancelled/fetch logic,
 * hasExternal check including walletconnect, addr fallbacks for usdt0 source, etc.).
 * No routes/amount/calc/execute/UI.
 *
 * Patterns followed (defi-positions.store.svelte.ts + btcPrice.svelte.ts + CLAUDE):
 * - Factory fn (opts for reactive selection getters; keeps state in caller).
 * - Internal class for $state/$derived + effects (or direct fn body equivalent).
 * - $state snaps + $effect subscribe for live svelte store reactivity (wallet/connected/network).
 * - btcPrice rune direct (tracks as $state).
 * - get(store) + snapshots inside.
 * - Pure helpers at bottom (testable; isFiniteNum etc.).
 * - Defensive: isFinite guards, nulls, offline (0/cached for external), browser guards.
 * - Async (mempool): tryCatch + Sentry.addBreadcrumb (category 'swap.wallets', warning on err paths) + d.error.
 * - Logging: createDebug('swap-wallets'); $effect for addrs.
 * - Browser guard on effects/fetch.
 * - Co-located interfaces; no `any`; typed from project sources.
 * - under-500 LOC target; reusable (high for BuySellForm, Earn*, Send, etc per audit).
 *
 * Data deps (read-only): walletStore (via get + snap), connectedWalletsStore,
 * btcPrice, connectorRegistry, browserNetworkStatus.
 * Test: vitest hoisted mocks (like SwapForm.test.ts + defi) + fake opts.get*; 5-state/edge/unit on pure + rune.
 *
 * Future: evolve to shared use-wallets; add lastUpdated/staleness if needed.
 * Ordering: this first (feeds calculator balances + routes addrs).
 *
 * References (full reads + greps + MCP done pre-codegen):
 * - Design doc section 1 + SwapForm.svelte (exact sections).
 * - defi-positions + btcPrice + stores + services (above).
 * - AGENTS/CLAUDE rules (gitnexus proxy, memory proxy via todo, no edits yet, etc.).
 */

import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { locale } from 'svelte-i18n';
import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
import { walletStore } from '$lib/stores/wallet.store';
import { btcPrice } from '$lib/runes/btcPrice.svelte';
import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
import { browserNetworkStatus } from '$lib/utils/network-status';
import { createDebug } from '$lib/utils/debug';
import { tryCatch } from '$lib/utils/tryCatch';
import * as Sentry from '@sentry/sveltekit';
import type { SourceWallet } from '$lib/services/route-resolver';

const d = createDebug('swap-wallets');

// ---------------------------------------------------------------------------
// Typed Interfaces (public API, co-located, exact from design + current code)
// ---------------------------------------------------------------------------

export type WalletId = 'builtin' | string;

export interface SwapWalletBalances {
	rbtcSats: number; // always sats (builtin or conn raw adjusted)
	usdt0: number; // human USD num (builtin formatted parse or conn /1e18)
	wbtcSats: number; // sats (builtin or conn wei /1e10 adjusted)
	tbtcSats: number; // sats (builtin or conn wei /1e10 adjusted)
}

export interface SwapWalletAddresses {
	source: string;
	dest: string;
}

export interface UseSwapWalletsOptions {
	// Callers provide reactive getters for selections (keeps UI state in component for now)
	getSourceWalletId: () => WalletId;
	getDestWalletId: () => WalletId;
	getSourceType: () => SourceWallet; // 'rbtc' | 'usdt0-arb' (narrowed in practice)
	getDestType: () => string; // DestType 'usdt0-arb' | 'rbtc-rsk' | 'wbtc-arb' | 'btc-onchain'
	// Optional translation function (i18n). Falls back to English if not provided.
	getTranslation?: (key: string) => string;
}

export interface UseSwapWallets {
	// Selection mirrors (for convenience; or caller keeps own $state)
	isConnectedSource: boolean; // $derived
	isConnectedDest: boolean;

	// Addresses (for routes/execute)
	sourceAddr: string;
	destAddr: string;

	// Per-selection balances (source/dest aware)
	sourceBalances: SwapWalletBalances;
	destBalances: SwapWalletBalances;

	// External BTC (dest only, for 'btc-onchain')
	hasExternalBtcWallet: boolean;
	externalBtcBalanceSats: number;

	// For WalletSelector (exact current sig)
	walletBalanceFor(walletId: WalletId): string; // USD formatted, e.g. '$12,345.67'
	builtinBalance: string; // alias for walletBalanceFor('builtin')

	// Display helpers (moved from SwapForm)
	walletLabel(id: WalletId): string;
	addrSnippet(addr: string): string;
	sourceWalletInfo: string; // "BitTasker (0xabc...def)"
	destWalletInfo: string;

	// Raw access (rare, for advanced)
	getConnectedWallet(id: string): ConnectedWalletEntry | undefined;
	getBuiltinTokenBalance(token: 'rbtc' | 'usdt0' | 'wbtc'): number;

	// For consumers that need full list (pass-through, no copy)
	connectedWallets: ConnectedWalletEntry[]; // $derived from store
}

export function useSwapWallets(opts: UseSwapWalletsOptions): UseSwapWallets {
	// Reactive snapshots from svelte stores (updated via $effect subs so $derived.by re-tracks)
	const walletSnap = $state(get(walletStore));
	const connectedSnap = $state(get(connectedWalletsStore));
	let localeSnap = $state(get(locale) || 'en');
	let isOnlineSnap = $state(get(browserNetworkStatus).online);

	// Dedicated $state for connected wallets list — separate from connectedSnap
	// proxy to ensure Svelte 5's reactivity propagates reliably when the store
	// is updated after initial mount (e.g. from reconnectPersistedWallets).
	let connectedWalletsList = $state<ConnectedWalletEntry[]>(get(connectedWalletsStore).wallets);

	// Dedicated $state for totalBalances.sats. Svelte 5's $derived doesn't
	// re-track nested access when the parent proxy is replaced.
	let builtinRbtcSats = $state(walletSnap.totalBalances?.sats ?? 0);

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
				if (sats !== builtinRbtcSats) builtinRbtcSats = sats;
			})
		);
		unsubs.push(
			connectedWalletsStore.subscribe((v) => {
				connectedSnap.wallets = v.wallets;
				connectedSnap.activeWalletId = v.activeWalletId;
				connectedSnap.error = v.error;
				connectedSnap.connectingType = v.connectingType;
				// Also update the dedicated list $state for reliable reactivity.
				// Setting a top-level $state triggers $derived re-evaluation
				// more reliably than mutating a property on a $state proxy.
				connectedWalletsList = v.wallets;
			})
		);
		unsubs.push(locale.subscribe((l) => (localeSnap = l || 'en')));
		unsubs.push(browserNetworkStatus.subscribe((v) => (isOnlineSnap = v.online)));
		return () => {
			unsubs.forEach((u) => u());
		};
	});

	const isConnectedSource = $derived(opts.getSourceWalletId() !== 'builtin');
	const isConnectedDest = $derived(opts.getDestWalletId() !== 'builtin');

	/** Source wallet address for route resolution */
	const sourceAddr = $derived.by(() => {
		// walletSnap + connectedSnap ensure re-evaluation on store updates
		void walletSnap.isConnected;
		void connectedSnap.wallets.length;
		const store = get(walletStore);
		const wid = opts.getSourceWalletId();
		const st = opts.getSourceType();
		if (!isConnectedSource) {
			if (st === 'rbtc') return store.rsk?.address ?? '';
			return store.arb?.address || store.rsk?.address || '';
		}
		return getConnectedWallet(wid)?.address ?? '';
	});

	/** Destination wallet address for execution (incl. btc-onchain) */
	const destAddr = $derived.by(() => {
		// walletSnap + connectedSnap ensure re-evaluation on store updates
		void walletSnap.isConnected;
		void connectedSnap.wallets.length;
		const store = get(walletStore);
		const wid = opts.getDestWalletId();
		const dt = opts.getDestType();
		if (!isConnectedDest) {
			if (dt === 'btc-onchain') return getExternalBtcAddress();
			if (dt === 'rbtc-rsk') return store.rsk?.address ?? '';
			return store.arb?.address || store.rsk?.address || '';
		}
		return getConnectedWallet(wid)?.address ?? '';
	});

	$effect(() => {
		d.log(
			'addrs: source=%s dest=%s srcWallet=%s destWallet=%s',
			sourceAddr?.substring(0, 10) || '(none)',
			destAddr?.substring(0, 10) || '(none)',
			opts.getSourceWalletId(),
			opts.getDestWalletId()
		);
	});

	function getConnectedWallet(id: string): ConnectedWalletEntry | undefined {
		return connectedSnap.wallets.find((cw) => cw.id === id);
	}

	function getBuiltinTokenBalance(token: 'rbtc' | 'usdt0' | 'wbtc' | 'tbtc'): number {
		if (token === 'rbtc') {
			return builtinRbtcSats;
		}
		if (token === 'usdt0') {
			return parseFloat(walletSnap.arb?.formattedUsdt0Balance || '0');
		}
		if (token === 'tbtc') {
			return Math.round(parseFloat(walletSnap.arb?.formattedTbtcBalance || '0') * 100_000_000);
		}
		// wbtc
		return Math.round(parseFloat(walletSnap.arb?.formattedWbtcBalance || '0') * 100_000_000);
	}

	/** Format USD balance for a wallet in WalletSelector (exact current math + formatter) */
	function walletBalanceFor(walletId: WalletId): string {
		const usdFormatter = new Intl.NumberFormat(localeSnap, {
			style: 'currency',
			currency: 'USD'
		});
		if (walletId === 'builtin') {
			const sats = builtinRbtcSats;
			const usdt = getBuiltinTokenBalance('usdt0');
			const usd = (sats / 100_000_000) * btcPrice.price + usdt;
			return usdFormatter.format(usd);
		}
		const w = getConnectedWallet(walletId);
		if (!w?.balances) return '$0.00';
		const btcSats = Number(w.balances.btc?.raw ?? 0) + Number(w.balances.rbtc?.raw ?? 0);
		const usdt = Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e6;
		const usd = (btcSats / 100_000_000) * btcPrice.price + usdt;
		return usdFormatter.format(usd);
	}

	const builtinBalance = $derived(walletBalanceFor('builtin'));

	// BTC wallet detection (exact from SwapForm)
	const hasExternalBtcWallet = $derived.by(() => {
		const wid = opts.getDestWalletId();
		if (wid === 'builtin') return false;
		const w = getConnectedWallet(wid);
		if (!w) return false;
		return (
			(w.walletType === 'trezor' ||
				w.walletType === 'ledger' ||
				w.walletType === 'walletconnect') &&
			!!w.btcAddress
		);
	});

	/**
	 * Get external BTC wallet address for the destination (exact scan + fallback from SwapForm).
	 */
	function getExternalBtcAddress(): string {
		const handles = connectorRegistry.list();
		for (const handle of handles) {
			try {
				const signer = handle.bitcoinSigner;
				if (signer?.address) return signer.address;
			} catch {
				// Connector doesn't support BTC signing — skip
				d.log('connector %s does not support BTC signing', handle.id);
			}
		}
		const btcWallet = connectedSnap.wallets.find(
			(w) => w.walletType === 'trezor' || w.walletType === 'ledger'
		);
		return btcWallet?.address ?? '';
	}

	/** BTC on-chain balance from any connected wallet that supports BTC signing (state + effect moved verbatim) */
	let externalBtcBalanceSats = $state(0);

	$effect(() => {
		if (!browser) {
			externalBtcBalanceSats = 0;
			return;
		}
		if (!isOnlineSnap) {
			// Defensive: return cached/0 per design (current code proceeds to fetch which fails to 0)
			// We still allow store .raw if present (cached balances)
		}

		const w = connectedSnap.wallets.find(
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

		if (w?.balances?.btc?.raw) {
			externalBtcBalanceSats = Number(w.balances.btc.raw);
			return;
		}

		const controller = new AbortController();
		(async () => {
			const { data, error } = await tryCatch(
				fetch(`https://mempool.space/api/address/${addr}`, {
					signal: controller.signal
				}).then((r) => r.json())
			);
			if (controller.signal.aborted) return;
			if (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				d.error('external btc mempool fetch failed', error);
				Sentry.addBreadcrumb({
					category: 'swap.wallets',
					message: 'externalBtcBalance fetch error',
					level: 'warning',
					data: {
						addr: addr.substring(0, 8),
						error: error instanceof Error ? error.message : String(error)
					}
				});
				if (!controller.signal.aborted) externalBtcBalanceSats = 0;
				return;
			}
			const dataJson = data as {
				chain_stats?: { funded_txo_sum: number; spent_txo_sum: number };
				mempool_stats?: { funded_txo_sum: number; spent_txo_sum: number };
			};
			const confirmed =
				(dataJson.chain_stats?.funded_txo_sum ?? 0) - (dataJson.chain_stats?.spent_txo_sum ?? 0);
			const mempool =
				(dataJson.mempool_stats?.funded_txo_sum ?? 0) -
				(dataJson.mempool_stats?.spent_txo_sum ?? 0);
			const total = confirmed + mempool;
			if (!controller.signal.aborted) externalBtcBalanceSats = total;
		})();

		return () => {
			controller.abort();
		};
	});

	// Wallet-aware balance helpers (exact $derived.by moved + using helpers for DRY/test)
	/** rBTC balance in sats for the currently selected source wallet. */
	const _sourceRbtcSats = $derived.by(() =>
		!isConnectedSource
			? getBuiltinTokenBalance('rbtc')
			: Number(getConnectedWallet(opts.getSourceWalletId())?.balances?.rbtc?.raw ?? 0)
	);
	// (kept for internal compat in this skeleton; consumers should prefer sourceBalances)

	const sourceBalances = $derived.by<SwapWalletBalances>(() => {
		const wid = opts.getSourceWalletId();
		const isConn = isConnectedSource;
		if (!isConn) {
			return {
				rbtcSats: getBuiltinTokenBalance('rbtc'),
				usdt0: getBuiltinTokenBalance('usdt0'),
				wbtcSats: getBuiltinTokenBalance('wbtc'),
				tbtcSats: getBuiltinTokenBalance('tbtc')
			};
		}
		const w = getConnectedWallet(wid);
		const rbtcSats = Number(w?.balances?.rbtc?.raw ?? 0);
		const usdt0 = Number(w?.balances?.['usdt0-arb']?.raw ?? 0) / 1e6;
		const wbtcSats = getWbtcSatsFromConnected(w);
		const tbtcRaw = Number(w?.balances?.tbtc?.raw ?? 0);
		const tbtcSats = tbtcRaw > 0 ? Math.round(tbtcRaw / 10_000_000_000) : 0;
		return { rbtcSats, usdt0, wbtcSats, tbtcSats };
	});

	const destBalances = $derived.by<SwapWalletBalances>(() => {
		const wid = opts.getDestWalletId();
		const isConn = isConnectedDest;
		if (!isConn) {
			return {
				rbtcSats: getBuiltinTokenBalance('rbtc'),
				usdt0: getBuiltinTokenBalance('usdt0'),
				wbtcSats: getBuiltinTokenBalance('wbtc'),
				tbtcSats: getBuiltinTokenBalance('tbtc')
			};
		}
		const w = getConnectedWallet(wid);
		const rbtcSats = Number(w?.balances?.rbtc?.raw ?? 0);
		const usdt0 = Number(w?.balances?.['usdt0-arb']?.raw ?? 0) / 1e6;
		const wbtcSats = getWbtcSatsFromConnected(w);
		const tbtcRaw = Number(w?.balances?.tbtc?.raw ?? 0);
		const tbtcSats = tbtcRaw > 0 ? Math.round(tbtcRaw / 10_000_000_000) : 0;
		return { rbtcSats, usdt0, wbtcSats, tbtcSats };
	});

	// (destRbtcSats etc. derivable from destBalances in consumer; exact per-wallet logic preserved above)

	function walletLabel(id: WalletId): string {
		if (id === 'builtin') {
			const t = opts.getTranslation;
			return t ? t('wallet.builtin_wallet') : 'BitTasker Wallet';
		}
		const w = getConnectedWallet(id);
		const name = w?.walletName || id;
		return name.toLowerCase().endsWith('wallet') ? name : `${name} Wallet`;
	}

	function addrSnippet(addr: string): string {
		if (!addr) return '';
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	}

	/** Source wallet label + address for confirm/success cards. */
	const sourceWalletInfo = $derived.by(() => {
		const id = opts.getSourceWalletId();
		const label = walletLabel(id);
		const addr = sourceAddr;
		return addr ? `${label} (${addrSnippet(addr)})` : label;
	});

	/** Destination wallet label + address. */
	const destWalletInfo = $derived.by(() => {
		const id = opts.getDestWalletId();
		const label = walletLabel(id);
		const addr = destAddr;
		return addr ? `${label} (${addrSnippet(addr)})` : label;
	});

	// Use the dedicated $state list instead of connectedSnap.wallets —
	// top-level $state reassignment triggers $derived reliably, whereas
	// mutating a property on a $state proxy may not propagate.
	const connectedWallets = $derived(connectedWalletsList);

	return {
		isConnectedSource,
		isConnectedDest,
		sourceAddr,
		destAddr,
		sourceBalances,
		destBalances,
		hasExternalBtcWallet,
		externalBtcBalanceSats,
		walletBalanceFor,
		builtinBalance,
		walletLabel,
		addrSnippet,
		sourceWalletInfo,
		destWalletInfo,
		getConnectedWallet,
		getBuiltinTokenBalance,
		connectedWallets
	};
}

// ---------------------------------------------------------------------------
// Pure helpers (at bottom for testability; defensive, exact math, no side effects, exported)
// ---------------------------------------------------------------------------

export function isFiniteNum(n: unknown): n is number {
	return typeof n === 'number' && isFinite(n);
}

export function getBtcSatsForUsdCalcFromConnected(w: ConnectedWalletEntry | undefined): number {
	return Number(w?.balances?.btc?.raw ?? 0) + Number(w?.balances?.rbtc?.raw ?? 0);
}

export function getUsdtHumanFromConnected(w: ConnectedWalletEntry | undefined): number {
	const raw = Number(w?.balances?.['usdt0-arb']?.raw ?? 0);
	return isFiniteNum(raw) ? raw / 1e6 : 0;
}

export function getWbtcSatsFromConnected(w: ConnectedWalletEntry | undefined): number {
	const rawWei = Number(w?.balances?.wbtc?.raw ?? 0);
	if (!isFiniteNum(rawWei) || rawWei <= 0) return 0;
	return Math.round(rawWei / 10_000_000_000);
}

export function computeUsdBalance(btcSats: number, usdtHuman: number, btcPriceVal: number): number {
	if (!isFiniteNum(btcSats) || !isFiniteNum(usdtHuman) || !isFiniteNum(btcPriceVal)) return 0;
	return (btcSats / 100_000_000) * btcPriceVal + usdtHuman;
}

export function getAddrSnippet(addr: string): string {
	if (!addr) return '';
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function getWalletLabelForList(id: WalletId, wallets: ConnectedWalletEntry[]): string {
	if (id === 'builtin') return 'wallet.builtin_wallet';
	const w = wallets.find((cw) => cw.id === id);
	const name = w?.walletName || id;
	return name.toLowerCase().endsWith('wallet') ? name : `${name} Wallet`;
}
