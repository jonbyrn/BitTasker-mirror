/**
 * use-swap-routes.svelte.ts
 *
 * Svelte 5 rune for swap route orchestration via the Route Engine.
 * Replaces the former dual SmartRouter + resolveRouteAsync system with a
 * single `resolveRoutes()` call that queries all providers in parallel.
 *
 * Responsibilities:
 * - Owns engineResult (RouteEngineResult) + routeLoading state.
 * - 400ms debounced $effect: on (amountSats + source/dest/addr/online changes),
 *   calls resolveRoutes(), snapshots inputs, cleans up timer + AbortController.
 * - destinationFor (internal, exposed for debug).
 * - Fee/output deriveds with fallback logic (gas cost from engine, computed from
 *   route totalFeePercent, gas price/gas limit defaults for rBTC/arb sources).
 * - getExecutableRoute: returns engineResult.recommended or first route.
 * - Proper DI: reactive getters for amountSats/sourceType/destType/sourceAddr/isOnline +
 *   optional price/gas feeds; optional resolveRoutesFn for testability.
 * - isOnline guard + amount<=0 early clear; AbortSignal support; defensive isFinite/NaN
 *   guards; createDebug + Sentry breadcrumbs on key paths.
 * - No amount/wallet/execute ownership (callers provide via getters).
 *
 * Data deps (passed via opts or DI):
 * - resolveRoutes (route-engine).
 * - btcPrice rune (or local via getBtcUsdPrice getter; used for conversions).
 * - Gas/price feeds from caller.
 *
 * Usage:
 *   const swapRoutes = useSwapRoutes({
 *     getSourceType: () => sourceType,
 *     getDestType: () => destType,
 *     getAmountSats: () => swapCalc.amountSats,
 *     getSourceAddr: () => swapWallets.sourceAddr,
 *     getIsOnline: () => isOnline,
 *     getBtcUsdPrice: () => btcPrice.price,
 *     getEthUsdPrice: () => ethUsdPrice,
 *     getRskGasWei: () => rskGasPriceWei,
 *     getArbGasWei: () => arbGasPriceWei,
 *     // resolveRoutesFn?: for DI/tests
 *   });
 *   // Then: swapRoutes.engineResult, .routeLoading, .estimatedOutput,
 *   //       .totalFeeSats, .networkFeeSats, .activeRouteForCalc,
 *   //       .getExecutableRoute(), .clearRoutes(), .refreshRoutes()
 *
 * Absolute path: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/runes/use-swap-routes.svelte.ts
 */

import { resolveRoutes, type RouteEngineResult } from '$lib/services/route-engine';
import type { Route, SourceWallet, Destination } from '$lib/services/route-resolver';
import { createDebug } from '$lib/utils/debug';
import { tryCatch } from '$lib/utils/tryCatch';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('swap-routes');

// ---------------------------------------------------------------------------
/** Destination types (narrowed for Swap; matches SwapForm + design). */
export type DestType = 'usdt0-arb' | 'rbtc-rsk' | 'wbtc-arb' | 'btc-onchain';

/** Empty engine result constant — used for initial state and resets. */
const EMPTY_RESULT: RouteEngineResult = {
	routes: [],
	recommended: null,
	errors: [],
	isLive: false
};

export interface UseSwapRoutesOptions {
	getSourceType: () => SourceWallet;
	getDestType: () => DestType;
	getAmountSats: () => number;
	getSourceAddr: () => string;
	getIsOnline: () => boolean;

	// Gas/price feeds (caller-owned; avoids duplicate polling).
	getBtcUsdPrice?: () => number;
	getEthUsdPrice?: () => number;
	getRskGasWei?: () => bigint;
	getArbGasWei?: () => bigint;

	// Raw source amount in token's smallest unit (for non-BTC tokens like USDT0).
	// When provided, passed to resolveRoutes so providers can use it directly.
	getSourceAmountRaw?: () => string | undefined;

	// DI for testability (mock-first / London TDD).
	resolveRoutesFn?: typeof resolveRoutes;
}

export interface UseSwapRoutes {
	/** Full engine result (routes, recommended, errors, isLive). */
	engineResult: RouteEngineResult;

	/** @deprecated Use engineResult.recommended. Kept for backward compat. */
	smartRoute: Route | null;

	/** @deprecated Use engineResult. Kept for backward compat. */
	asyncRouteResult: {
		routes: Route[];
		hardcodedRoutes: Route[];
		providerResults: unknown[];
		isLoading: boolean;
	};

	routeLoading: boolean;

	// Primary for UI/confirm (exact current deriveds + fallbacks)
	estimatedOutput: string; // human (token frac or USD)
	totalFeeSats: number;
	networkFeeSats: number;
	activeRouteForCalc: Route | null;

	/** True when live gas price data is available for the current source type. */
	gasDataAvailable: boolean;

	/** Minimum swap amount in sats (default for Boltz-eligible pairs). 0 = no minimum. */
	minSwapSats: number;

	/** Error translation key when route resolution fails or no routes found. Empty = no error. */
	swapError: string;

	// For execute (startSwapChain expects Route)
	getExecutableRoute(): Route | null;

	// Control
	clearRoutes(): void;
	refreshRoutes(): void; // forces re-resolution via nonce (no-op if amt<=0)

	// Debug/internal
	destinationFor(dest: DestType): Destination;
}

export function useSwapRoutes(opts: UseSwapRoutesOptions): UseSwapRoutes {
	// Reactive state (Svelte 5 runes)
	let engineResult = $state<RouteEngineResult>(EMPTY_RESULT);
	let routeLoading = $state(false);
	let swapError = $state('');

	// Timers + abort for debounce + cleanup
	let _routeTimer: ReturnType<typeof setTimeout> | null = null;
	let currentController: AbortController | null = null;
	let refreshNonce = $state(0);

	// Defensive reactive inputs (track via getters for effect/derived subscription; isFinite guards)
	const amountSats = $derived.by(() => {
		const a = opts.getAmountSats?.();
		return Number.isFinite(a) ? Math.max(0, a as number) : 0;
	});

	const currentSourceType = $derived.by((): SourceWallet => {
		try {
			const s = opts.getSourceType?.();
			return (s as SourceWallet) || 'rbtc';
		} catch (e) {
			d.warn('getSourceType failed', e);
			return 'rbtc';
		}
	});

	const currentDestType = $derived.by((): DestType => {
		try {
			const dt = opts.getDestType?.();
			return (dt as DestType) || 'usdt0-arb';
		} catch (e) {
			d.warn('getDestType failed', e);
			return 'usdt0-arb';
		}
	});

	const sourceAddr = $derived.by(() => {
		try {
			const a = opts.getSourceAddr?.();
			return typeof a === 'string' ? a : '';
		} catch (e) {
			d.warn('getSourceAddr failed', e);
			return '';
		}
	});

	const isOnline = $derived.by(() => {
		try {
			return !!opts.getIsOnline?.();
		} catch (e) {
			d.warn('getIsOnline failed', e);
			return true;
		}
	});

	// Price/gas from DI (defensive; match current defaults in network/estimated)
	const btcUsdPrice = $derived.by(() => {
		try {
			const p = opts.getBtcUsdPrice?.();
			return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0;
		} catch (e) {
			d.warn('getBtcUsdPrice failed', e);
			return 0;
		}
	});

	const ethUsdPrice = $derived.by(() => {
		try {
			const p = opts.getEthUsdPrice?.();
			return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0;
		} catch (e) {
			d.warn('getEthUsdPrice failed', e);
			return 0;
		}
	});

	const rskGasPriceWei = $derived.by(() => {
		try {
			const g = opts.getRskGasWei?.();
			return typeof g === 'bigint' && g > 0n ? g : 0n;
		} catch (e) {
			d.warn('getRskGasWei failed', e);
			return 0n;
		}
	});

	const arbGasPriceWei = $derived.by(() => {
		try {
			const g = opts.getArbGasWei?.();
			return typeof g === 'bigint' && g > 0n ? g : 0n;
		} catch (e) {
			d.warn('getArbGasWei failed', e);
			return 0n;
		}
	});

	/** True when live gas price data is available for the current source type.
	 *  For Arbitrum sources, also requires live ETH and BTC prices (needed for
	 *  wei → sats conversion). Without prices, the fee estimate would be wrong. */
	const gasDataAvailable = $derived.by(() => {
		if (currentSourceType === 'rbtc') {
			return rskGasPriceWei > 0n;
		}
		if (
			currentSourceType === 'wbtc-arb' ||
			currentSourceType === 'tbtc-arb' ||
			currentSourceType === 'usdt0-arb'
		) {
			return arbGasPriceWei > 0n && ethUsdPrice > 0 && btcUsdPrice > 0;
		}
		return false;
	});

	// ---------------------------------------------------------------------------
	// Route resolution effect (400ms debounce + single resolveRoutes call)
	// ---------------------------------------------------------------------------
	$effect(() => {
		// Subscribe to all inputs (amount + types + addr + online + nonce for refresh)
		const amt = amountSats;
		const src = currentSourceType;
		const dst = currentDestType;
		const _adr = sourceAddr;
		const online = isOnline;
		const _nonce = refreshNonce;

		// Cleanup prior
		if (_routeTimer) {
			clearTimeout(_routeTimer);
			_routeTimer = null;
		}
		if (currentController) {
			currentController.abort();
			currentController = null;
		}

		if (amt <= 0 || !online) {
			engineResult = EMPTY_RESULT;
			routeLoading = false;
			swapError = '';
			return;
		}

		routeLoading = true;

		// Snapshot at scheduling time (re-entrancy / flip safety)
		const snapshotAmt = amt;
		const snapshotSrc = src;
		const snapshotDst = dst;
		const snapshotRaw = opts.getSourceAmountRaw?.();

		currentController = new AbortController();

		_routeTimer = setTimeout(async () => {
			if (currentController?.signal.aborted) return;

			const routeDest = destinationFor(snapshotDst);
			const resolveFn = opts.resolveRoutesFn ?? resolveRoutes;

			const { data: result, error } = await tryCatch(
				resolveFn(snapshotSrc, routeDest, snapshotAmt, currentController?.signal, snapshotRaw, ethUsdPrice)
			);

			if (error) {
				if (currentController?.signal.aborted) return;
				d.warn('resolveRoutes failed: %s', error.message);
				Sentry.addBreadcrumb({
					category: 'wallet.swap.routes',
					message: 'resolveRoutes failed',
					data: { source: snapshotSrc, dest: snapshotDst, error: String(error) }
				});
				engineResult = EMPTY_RESULT;
				swapError = 'wallet.swap.error.swap_failed';
			} else if (!currentController?.signal.aborted && result) {
				engineResult = result;
				// Surface error when route resolution succeeded but returned no routes
				if (result.routes.length === 0 && result.errors.length > 0) {
					swapError = 'wallet.swap.error.no_routes';
				} else {
					swapError = '';
				}
				d.log(
					'Resolved %d routes (%d errors), recommended: %s',
					result.routes.length,
					result.errors.length,
					result.recommended?.id ?? 'none'
				);
			}

			routeLoading = false;
		}, 400);

		return () => {
			if (_routeTimer) {
				clearTimeout(_routeTimer);
				_routeTimer = null;
			}
			if (currentController) {
				currentController.abort();
				currentController = null;
			}
		};
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/** Convert DestType to Destination (exact from SwapForm:689-698). */
	function destinationFor(dt: DestType): Destination {
		if (dt === 'btc-onchain') {
			return { type: 'invoice', network: 'onchain', invoice: '' };
		}
		if (dt === 'wbtc-arb') {
			return { type: 'address', chainId: 42161, address: '', asset: 'WBTC' };
		}
		if (dt === 'usdt0-arb') {
			return { type: 'address', chainId: 42161, address: '', asset: 'USDT0' };
		}
		// rbtc-rsk — RSK mainnet chain ID
		return { type: 'address', chainId: 30, address: '' };
	}

	// ---------------------------------------------------------------------------
	// Derived values
	// ---------------------------------------------------------------------------

	// amountInTokenUnits recovery (for estimatedOutput calc; exact math from form)
	const amountInTokenUnits = $derived.by(() => {
		const sats = amountSats;
		if (sats <= 0) return 0;
		const src = currentSourceType;
		const p = btcUsdPrice;
		// All BTC-denominated sources (rbtc, wbtc, tbtc, btc-onchain): sats → BTC
		if (src === 'rbtc' || src === 'wbtc-arb' || src === 'tbtc-arb' || src === 'btc-onchain') {
			return sats / 100_000_000;
		}
		// usdt0 source: recover from sats (which was derived using price in calculator)
		return p > 0 ? (sats / 100_000_000) * p : 0;
	});

	// activeRouteForCalc — the route used for fee/output calculations.
	// Prefers the engine's recommended route, falls back to first available.
	const activeRouteForCalc = $derived.by((): Route | null => {
		return engineResult.recommended ?? engineResult.routes[0] ?? null;
	});

	// networkFeeSats (exact fallback chain + gas math + defaults from SwapForm:788-825)
	const networkFeeSats = $derived.by(() => {
		if (amountSats <= 0) return 0;

		// 1. Try recommended route's gasCostWei — convert to sats based on chain
		const rec = engineResult.recommended;
		if (rec?.gasCostWei) {
			try {
				const gasWei = BigInt(rec.gasCostWei);
				// RBTC gas (RSK): 1 RBTC = 10^18 wei = 10^8 sats → 1 sat = 10^10 wei
				if (currentSourceType === 'rbtc' || currentSourceType === 'btc-onchain') {
					const sats = Number(gasWei / 10_000_000_000n);
					d.log('networkFeeSats: RBTC gasCostWei → %d sats', sats);
					return sats;
				}
				// ETH gas (Arbitrum): convert wei → ETH → USD → BTC → sats
				// Can't compute without live prices — return 0 (gasDataAvailable will be false)
				if (ethUsdPrice <= 0 || btcUsdPrice <= 0) return 0;
				const gasCostEth = Number(gasWei) / 1e18;
				const sats = Math.round(((gasCostEth * ethUsdPrice) / btcUsdPrice) * 100_000_000);
				d.log('networkFeeSats: ETH gasCostWei → %d sats (eth=%.6f)', sats, gasCostEth);
				return Math.max(sats, 1);
			} catch (e) {
				d.warn('Failed to parse recommended gasCostWei', e);
			}
		}

		// 2. Try any route with gasCostWei — same chain-aware conversion
		const fallbackRoute = activeRouteForCalc;
		if (fallbackRoute?.gasCostWei) {
			try {
				const gasWei = BigInt(fallbackRoute.gasCostWei);
				if (currentSourceType === 'rbtc' || currentSourceType === 'btc-onchain') {
					return Number(gasWei / 10_000_000_000n);
				}
				// Can't compute ETH gas without live prices
				if (ethUsdPrice <= 0 || btcUsdPrice <= 0) return 0;
				const gasCostEth = Number(gasWei) / 1e18;
				return Math.round(Math.max(((gasCostEth * ethUsdPrice) / btcUsdPrice) * 100_000_000, 1));
			} catch (e) {
				d.warn('Failed to parse fallback gasCostWei', e);
			}
		}

		// 3. Compute from gas price and limits
		const isSimpleTransfer =
			(currentSourceType === 'rbtc' && currentDestType === 'rbtc-rsk') ||
			(currentSourceType === 'usdt0-arb' && currentDestType === 'usdt0-arb') ||
			(currentSourceType === 'wbtc-arb' && currentDestType === 'wbtc-arb');

		if (currentSourceType === 'rbtc') {
			const gasPrice = rskGasPriceWei > 0n ? rskGasPriceWei : 65_000_000n;
			const gasLimit = isSimpleTransfer ? 21_000n : 500_000n;
			return Number((gasLimit * gasPrice) / 10_000_000_000n);
		}

		if (
			currentSourceType === 'usdt0-arb' ||
			currentSourceType === 'wbtc-arb' ||
			currentSourceType === 'tbtc-arb'
		) {
			// Can't compute ETH gas without live prices — gasDataAvailable will be false
			if (ethUsdPrice <= 0 || btcUsdPrice <= 0) return 0;
			const gasLimit = isSimpleTransfer ? 65_000n : 300_000n;
			const gasPrice = arbGasPriceWei > 0n ? arbGasPriceWei : 30_000_000n;
			const gasCostWei = gasLimit * gasPrice;
			const gasCostEth = Number(gasCostWei) / 1e18;
			const gasCostSats = ((gasCostEth * ethUsdPrice) / btcUsdPrice) * 100_000_000;
			return Math.round(Math.max(gasCostSats, 1));
		}

		return 0;
	});

	// isCrossChain — true when source and destination are on different chains.
	// Used to decide whether to add networkFeeSats on top of provider output.
	const isCrossChain = $derived.by(() => {
		const route = activeRouteForCalc;
		if (!route) return false;
		// If any hop crosses a chain boundary, it's cross-chain
		return route.hops.some((h) => h.fromChain !== h.toChain);
	});

	// totalFeeSats — total cost of the swap in sats (protocol fee + gas fee).
	// When the provider gives outputAmount, compute protocol fee as: input USD − output USD.
	// For multi-hop cross-chain routes (e.g. Boltz→UniV3), the source-chain gas (RSK)
	// is NOT reflected in the provider's output, so we add networkFeeSats.
	// For single-hop cross-chain routes (e.g. LI.FI Direct), the provider's output
	// already has ALL costs deducted (bridge fee + gas), so adding networkFeeSats
	// would double-count the source-chain gas.
	const totalFeeSats = $derived.by(() => {
		const route = activeRouteForCalc;
		if (!route || amountSats <= 0) return 0;

		// Provider-computed output: protocol fee = input value − output value
		if (route.outputAmount && route.outputDecimals !== undefined && btcUsdPrice > 0) {
			const raw = Number(route.outputAmount);
			if (isFinite(raw) && raw > 0) {
				const inputUsd = (amountSats / 100_000_000) * btcUsdPrice;

				let outputUsd: number;
				if (
					currentDestType === 'rbtc-rsk' ||
					currentDestType === 'wbtc-arb' ||
					currentDestType === 'btc-onchain'
				) {
					outputUsd = (raw / 10 ** route.outputDecimals) * btcUsdPrice;
				} else if (route.outputDecimals === 6) {
					outputUsd = raw / 1e6; // USDT0/USDC: micro-units → USD
				} else {
					outputUsd = (raw / 10 ** route.outputDecimals) * btcUsdPrice;
				}

				const protocolFeeUsd = Math.max(0, inputUsd - outputUsd);
				const protocolFeeSats = Math.round((protocolFeeUsd / btcUsdPrice) * 100_000_000);

				// For multi-hop cross-chain routes, hop1's source-chain gas is NOT in
				// the output (e.g. Boltz→UniV3: RSK gas not reflected in USDT0 output).
				// For single-hop cross-chain routes, the output already includes ALL
				// costs (e.g. LI.FI Direct: RSK gas deducted from output).
				const isMultiHop = route.hops.length > 1;
				// Include hop2 destination-chain gas (e.g., Arbitrum ETH gas for Uniswap V3 swap)
				let hop2GasSats = 0;
				if (isMultiHop && route.hop2GasCostWei && ethUsdPrice > 0 && btcUsdPrice > 0) {
					try {
						const hop2GasWei = BigInt(route.hop2GasCostWei);
						const hop2GasEth = Number(hop2GasWei) / 1e18;
						hop2GasSats = Math.round(((hop2GasEth * ethUsdPrice) / btcUsdPrice) * 100_000_000);
					} catch { /* ignore parse errors */ }
				}
				const total =
					isCrossChain && isMultiHop ? protocolFeeSats + networkFeeSats + hop2GasSats : protocolFeeSats;

				// If USD-based fee rounds to 0 but the route reports a nonzero fee percent,
				// the price feeds disagree. Fall back to feePercent-based computation so the
				// user still sees a fee (e.g. Symbiosis flat $0.75 on cross-chain RBTC).
				if (total === 0 && route.totalFeePercent > 0) {
					const isMultiHop = route.hops.length > 1;
					const bridgeFee = Math.round((amountSats * route.totalFeePercent) / 100);
					return isCrossChain && isMultiHop ? networkFeeSats + bridgeFee : bridgeFee;
				}
				return total;
			}
		}

		// Fallback: network gas + bridge fee percent (legacy / same-currency paths)
		// For multi-hop cross-chain: add networkFeeSats (source-chain gas not in output).
		// For single-hop cross-chain: output already includes gas, don't double-count.
		const isMultiHop = route.hops.length > 1;
		if (isCrossChain && isMultiHop) {
			let hop2GasSats = 0;
			if (route.hop2GasCostWei && ethUsdPrice > 0 && btcUsdPrice > 0) {
				try {
					const hop2GasWei = BigInt(route.hop2GasCostWei);
					const hop2GasEth = Number(hop2GasWei) / 1e18;
					hop2GasSats = Math.round(((hop2GasEth * ethUsdPrice) / btcUsdPrice) * 100_000_000);
				} catch { /* ignore parse errors */ }
			}
			return networkFeeSats + Math.round((amountSats * route.totalFeePercent) / 100) + hop2GasSats;
		}
		return Math.round((amountSats * route.totalFeePercent) / 100);
	});

	// minSwapSats — minimum swap amount for Boltz-eligible pairs.
	// 0 means no minimum applies (direct transfers, LI.FI-only routes).
	const BOLTZ_DEFAULT_MIN_SATS = 2500;
	const minSwapSats = $derived.by(() => {
		// Hard minimums for Boltz-eligible source types
		if (currentSourceType === 'rbtc' && currentDestType !== 'rbtc-rsk') {
			return BOLTZ_DEFAULT_MIN_SATS;
		}
		// BTC on-chain also goes through Boltz (reverse swap) — same minimum
		if (currentSourceType === 'btc-onchain' && currentDestType !== 'btc-onchain') {
			return BOLTZ_DEFAULT_MIN_SATS;
		}
		// Dynamic: if any resolved route uses Boltz, enforce minimum
		const hasBoltzRoute = engineResult.routes.some((r) =>
			r.hops.some((h) => h.service === 'boltz')
		);
		if (hasBoltzRoute) {
			return BOLTZ_DEFAULT_MIN_SATS;
		}
		return 0;
	});

	// estimatedOutput — output amount in the unit expected by SwapForm display.
	// For bitcoin-denominated destinations: returns BTC (e.g. 0.001234)
	// For USD-denominated destinations: returns USD (e.g. 15.87)
	// Uses route.outputAmount + outputDecimals from providers when available (authoritative).
	const estimatedOutput = $derived.by(() => {
		const route = activeRouteForCalc;
		if (!route || amountInTokenUnits <= 0) return '0';

		// Prefer provider-computed outputAmount (from live API quote)
		if (route.outputAmount && route.outputDecimals !== undefined) {
			const raw = Number(route.outputAmount);
			if (!isFinite(raw) || raw <= 0) return '0';

			if (
				currentDestType === 'rbtc-rsk' ||
				currentDestType === 'wbtc-arb' ||
				currentDestType === 'btc-onchain'
			) {
				// BTC-denominated dest: convert to BTC
				return (raw / 10 ** route.outputDecimals).toFixed(8);
			}
			// USD-denominated dest: convert to USD
			if (route.outputDecimals === 6) {
				// USDT0/USDC: raw is micro-units → USD
				return (raw / 1e6).toFixed(2);
			}
			// Other: convert smallest unit → BTC → USD
			const btcAmt = raw / 10 ** route.outputDecimals;
			return (btcAmt * btcUsdPrice).toFixed(2);
		}

		// Fallback: compute from fee percent (legacy paths)
		const fee = 1 - route.totalFeePercent / 100;
		let sourceAmt = amountInTokenUnits;
		if (currentSourceType === 'rbtc') {
			sourceAmt = Math.max(0, sourceAmt - networkFeeSats / 100_000_000);
		}
		let output = sourceAmt * fee;
		if (currentSourceType === 'rbtc' && currentDestType === 'usdt0-arb') {
			output = output * btcUsdPrice;
		} else if (currentSourceType === 'usdt0-arb' && currentDestType === 'rbtc-rsk') {
			output = btcUsdPrice > 0 ? output / btcUsdPrice : 0;
		}
		return output.toFixed(6);
	});

	// ---------------------------------------------------------------------------
	// getExecutableRoute — returns the engine's recommended or first available route
	// ---------------------------------------------------------------------------
	function getExecutableRoute(): Route | null {
		const route = engineResult.recommended ?? engineResult.routes[0] ?? null;
		d.log(
			'getExecutableRoute: src=%s dst=%s recommended=%s routes=%d → %s',
			opts.getSourceType(),
			opts.getDestType?.() ?? '?',
			engineResult.recommended?.id ?? 'null',
			engineResult.routes.length,
			route?.id ?? 'null'
		);
		return route;
	}

	// ---------------------------------------------------------------------------
	// Control
	// ---------------------------------------------------------------------------

	function clearRoutes(): void {
		if (_routeTimer) {
			clearTimeout(_routeTimer);
			_routeTimer = null;
		}
		if (currentController) {
			currentController.abort();
			currentController = null;
		}
		engineResult = EMPTY_RESULT;
		routeLoading = false;
		swapError = '';
		d.log('clearRoutes');
	}

	function refreshRoutes(): void {
		d.log('refreshRoutes (nonce bump)');
		refreshNonce += 1;
		// Effect re-runs (reads nonce) and re-schedules if amt > 0
	}

	// ---------------------------------------------------------------------------
	// Public API (reactive primitives + fns; consumers use in $derived/template)
	// ---------------------------------------------------------------------------
	return {
		// New engine API
		get engineResult() {
			return engineResult;
		},

		// Backward compat: smartRoute was SmartRoute | null, now returns Route | null
		get smartRoute() {
			return engineResult.recommended;
		},

		// Backward compat: asyncRouteResult shape
		get asyncRouteResult() {
			return {
				routes: engineResult.routes,
				hardcodedRoutes: [] as Route[],
				providerResults: [] as unknown[],
				isLoading: routeLoading
			};
		},

		get routeLoading() {
			return routeLoading;
		},

		// deriveds (exact current)
		get estimatedOutput() {
			return estimatedOutput;
		},
		get totalFeeSats() {
			return totalFeeSats;
		},
		get networkFeeSats() {
			return networkFeeSats;
		},
		get activeRouteForCalc() {
			return activeRouteForCalc;
		},
		get gasDataAvailable() {
			return gasDataAvailable;
		},
		get minSwapSats() {
			return minSwapSats;
		},
		get swapError() {
			return swapError;
		},

		getExecutableRoute,
		clearRoutes,
		refreshRoutes,
		destinationFor
	};
}

// Pure helper exports (testable standalone)
export function createInitialRoutesState(): {
	engineResult: RouteEngineResult;
	routeLoading: boolean;
} {
	return {
		engineResult: EMPTY_RESULT,
		routeLoading: false
	};
}
