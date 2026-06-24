/**
 * use-swap-routes.svelte.ts
 *
 * Svelte 5 rune for dual SmartRouter + resolveRouteAsync swap route orchestration.
 * Extracted per Phase 1 design (docs/wallet/swapform-phase1-logic-extraction-design.md).
 *
 * Responsibilities (exact from design + current SwapForm.svelte post-June-2026 logic):
 * - Own/instantiate (or DI) SmartRouter + asyncRouteResult/smartRoute/routeLoading state.
 * - 400ms debounced $effect: on (amountSats + source/dest/addr/online changes), Promise.allSettled([resolveRouteAsync, smart.getBestRoute]), snapshot inputs, cleanup timer + AbortController.
 * - destinationFor (internal, exposed for debug).
 * - Exact fee/output deriveds with current fallback logic (lines ~749-835 in SwapForm):
 *   - estimatedOutput: prefer smart (with boltz tBTC->USD conv for usdt0 dest), else activeRouteForCalc + fee% + gas deduct (rbtc source) + cross-price convs.
 *   - activeRouteForCalc: null if smartRoute (Smart "handles fee display separately"), else async.routes[0].
 *   - networkFeeSats: smart.gasCostWei ( /1e10 ) > fallback.gasCostWei > compute (rsk/arb gasPrice + limits + eth/btc price conv for arb; isSimpleTransfer special-cases; defaults 65m/30m gwei, 21k/65k/300k/500k limits, 2500/74000 prices).
 *   - totalFeeSats: smart.totalFeeSats > network + (amt * route.totalFeePercent / 100).
 * - getExecutableRoute: special-case hardcoded LI.FI Route for usdt0-arb source (exact from executeSwap), convert Smart? or pick async[0] (design spec; enables retryWithFallback to affect exec).
 * - Proper DI: reactive getters for amountSats/sourceType/destType/sourceAddr/isOnline + optional price/gas (keeps refreshLiveFees + rsx estimate in caller per design wiring example); optional smartRouter/resolveRouteAsyncFn for testability (mock-first, London TDD).
 * - isOnline guard + amount<=0 early clear; AbortSignal support; defensive isFinite/NaN guards; createDebug + Sentry breadcrumbs on key paths; tryCatch ready.
 * - No amount/wallet/execute ownership (callers (wallets+calculator runes) provide via getters); no side effects outside effect; pure helpers exported.
 * - <200 LOC target; typed public API; follows defi-positions + btcPrice + CLAUDE runes patterns (getters for reactivity, $state/$derived.by, browser awareness via effects, single-source).
 *
 * Data deps (passed via opts or DI):
 * - resolveRouteAsync + createInitial + types (route-resolver-async + route-resolver).
 * - SmartRouter + SmartRoute (SmartRouter.ts).
 * - btcPrice rune (or local via getBtcUsdPrice getter; used for convs).
 * - Gas/price feeds from caller (see wiring below).
 *
 * Usage (from design + SwapForm wiring example):
 *   const swapRoutes = useSwapRoutes({
 *     getSourceType: () => sourceType,
 *     getDestType: () => destType,
 *     getAmountSats: () => swapCalc.amountSats,
 *     getSourceAddr: () => swapWallets.sourceAddr,
 *     getIsOnline: () => isOnline,
 *     getBtcUsdPrice: () => btcPrice.price,  // or ethUsdPrice local etc.
 *     getEthUsdPrice: () => ethUsdPrice,
 *     getRskGasWei: () => rskGasPriceWei,
 *     getArbGasWei: () => arbGasPriceWei,
 *     // smartRouter?: new SmartRouter(), resolveRouteAsyncFn? for DI/tests
 *   });
 *   // Then: swapRoutes.estimatedOutput, .networkFeeSats, .totalFeeSats, .activeRouteForCalc, .smartRoute, .getExecutableRoute(), .clearRoutes(), .refreshRoutes(), .routeLoading
 *
 * Testability: High (mock getters + injected routers; fake timers for debounce; settlement order; price=0/NaN edges; amount=0/offline; smart wins vs fallback calc). Unit deriveds standalone. See SwapForm.test.ts mocks + route-resolver* suites.
 *
 * Exact current fallback logic preserved (verified via full reads of SwapForm.svelte:687-859, 749-835, 788-825, 830-835 + SmartRouter + resolveRouteAsync + design).
 *
 * Future: integrate (replace inline in SwapForm), 5-state rune tests (90%+ branch), svelte-autofixer (n/a), npm check/lint, gitnexus_*, etc. per Phase 1.
 *
 * References (all full/targeted reads + greps performed before skeleton):
 * - Design: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/docs/wallet/swapform-phase1-logic-extraction-design.md (esp. §3, API, responsibilities, risks, wiring @410)
 * - Current logic: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/components/wallet/SwapForm.svelte (full structure + targeted 687-1167 + gas/fee/execute sections; also 345-437 for price/gas states)
 * - Services: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/services/SmartRouter.ts (full), /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/services/route-resolver-async.ts (resolveRouteAsync + createInitial + types @686+), /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/services/quote-normalizer.ts (AsyncRouteResult), /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/services/route-resolver.ts (Route/Dest/SourceWallet)
 * - Audit context: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/docs/wallet/swap-drawer-audit-report.md (dual orchestration, fee deriveds)
 * - Test/mocks: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/tests/components/wallet/SwapForm.test.ts
 * - Patterns: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/runes/btcPrice.svelte.ts, /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/stores/defi-positions.store.svelte.ts, CLAUDE.md / AGENTS.md / .cursor/rules/*
 *
 * Absolute path for target: /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/src/lib/runes/use-swap-routes.svelte.ts
 */

import { SmartRouter } from '$lib/services/SmartRouter';
import type { SmartRoute } from '$lib/services/SmartRouter';
import {
	resolveRouteAsync,
	createInitialAsyncRouteResult,
	type AsyncRouteResult
} from '$lib/services/route-resolver-async';
import type { Route, SourceWallet, Destination, RouteHop } from '$lib/services/route-resolver';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';
// import { tryCatch } from '$lib/utils/tryCatch'; // ready for async wrappers

const d = createDebug('swap-routes');

// ---------------------------------------------------------------------------
/** Destination types (narrowed for Swap; matches SwapForm + design). */
export type DestType = 'usdt0-arb' | 'rbtc-rsk' | 'wbtc-arb' | 'btc-onchain';

export interface UseSwapRoutesOptions {
	getSourceType: () => SourceWallet;
	getDestType: () => DestType;
	getAmountSats: () => number;
	getSourceAddr: () => string;
	getIsOnline: () => boolean;

	// Gas/price feeds (caller-owned refreshLiveFees + cryptoPriceService + onMount/300ms timers per design; avoids dupe).
	// Use btcPrice rune or local $state (see wiring example in design).
	getBtcUsdPrice?: () => number;
	getEthUsdPrice?: () => number;
	getRskGasWei?: () => bigint;
	getArbGasWei?: () => bigint;

	// DI for testability (mock-first / London TDD; SwapForm.test.ts style hoisted mocks).
	smartRouter?: SmartRouter;
	resolveRouteAsyncFn?: typeof resolveRouteAsync;
}

export interface UseSwapRoutes {
	smartRoute: SmartRoute | null;
	asyncRouteResult: AsyncRouteResult;
	routeLoading: boolean;

	// Primary for UI/confirm (exact current deriveds + fallbacks)
	estimatedOutput: string; // human (token frac or USD)
	totalFeeSats: number;
	networkFeeSats: number;
	activeRouteForCalc: Route | null; // null when smart present

	/** Minimum swap amount in sats (from Boltz limits or default for Boltz-eligible pairs). 0 = no minimum. */
	minSwapSats: number;

	// For execute (startSwapChain expects Route; special-cases preserved + Smart conversion per design)
	getExecutableRoute(): Route | null;

	// Control
	clearRoutes(): void;
	refreshRoutes(): void; // forces re-resolution via nonce (no-op if amt<=0)

	// Debug/internal (per design)
	destinationFor(dest: DestType): Destination;
}

export function useSwapRoutes(opts: UseSwapRoutesOptions): UseSwapRoutes {
	// Reactive state (Svelte 5 runes)
	let smartRoute = $state<SmartRoute | null>(null);
	let asyncRouteResult = $state<AsyncRouteResult>(createInitialAsyncRouteResult());
	let routeLoading = $state(false);

	// Timers + abort for debounce + cleanup (exact from current effect)
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
		} catch {
			return 'rbtc';
		}
	});

	const currentDestType = $derived.by((): DestType => {
		try {
			const d = opts.getDestType?.();
			return (d as DestType) || 'usdt0-arb';
		} catch {
			return 'usdt0-arb';
		}
	});

	const sourceAddr = $derived.by(() => {
		try {
			const a = opts.getSourceAddr?.();
			return typeof a === 'string' ? a : '';
		} catch {
			return '';
		}
	});

	const isOnline = $derived.by(() => {
		try {
			return !!opts.getIsOnline?.();
		} catch {
			return true;
		}
	});

	// Price/gas from DI (defensive; match current defaults in network/estimated)
	const btcUsdPrice = $derived.by(() => {
		try {
			const p = opts.getBtcUsdPrice?.();
			return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0;
		} catch {
			return 0;
		}
	});

	const ethUsdPrice = $derived.by(() => {
		try {
			const p = opts.getEthUsdPrice?.();
			return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0;
		} catch {
			return 0;
		}
	});

	const rskGasPriceWei = $derived.by(() => {
		try {
			const g = opts.getRskGasWei?.();
			return typeof g === 'bigint' && g > 0n ? g : 0n;
		} catch {
			return 0n;
		}
	});

	const arbGasPriceWei = $derived.by(() => {
		try {
			const g = opts.getArbGasWei?.();
			return typeof g === 'bigint' && g > 0n ? g : 0n;
		} catch {
			return 0n;
		}
	});

	// Dual orchestration effect (exact 400ms debounce + Promise.allSettled from SwapForm:702-746 + design)
	$effect(() => {
		// Subscribe to all inputs (amount + types + addr + online + nonce for refresh)
		const amt = amountSats;
		const src = currentSourceType;
		const dst = currentDestType;
		const adr = sourceAddr;
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
			smartRoute = null;
			asyncRouteResult = createInitialAsyncRouteResult();
			routeLoading = false;
			return;
		}

		routeLoading = true;

		// Snapshot at scheduling time (re-entrancy / flip safety; current captures source/addr/sats)
		const snapshotAmt = amt;
		const snapshotSrc = src;
		const snapshotDst = dst;
		const snapshotAdr = adr;

		currentController = new AbortController();

		_routeTimer = setTimeout(async () => {
			if (currentController?.signal.aborted) return;

			const routeDest = destinationFor(snapshotDst);
			const resolveFn = opts.resolveRouteAsyncFn ?? resolveRouteAsync;
			const router = opts.smartRouter ?? new SmartRouter();

			// Dual (Smart experimental/preferred for display; resolve primary + hardcoded fallbacks)
			// Amount as string per resolve sig (current passes num; design: handle coerce)
			const [asyncRes, smartRes] = await Promise.allSettled([
				resolveFn(snapshotSrc, routeDest, String(snapshotAmt), snapshotAdr, {
					signal: currentController?.signal
				}),
				router.getBestRoute(
					snapshotSrc,
					snapshotDst as SourceWallet | 'wbtc-arb' | 'btc-onchain',
					snapshotAmt
				)
			]);

			if (currentController?.signal.aborted) return;

			if (asyncRes.status === 'fulfilled') {
				asyncRouteResult = asyncRes.value;
			} else {
				d.warn('resolveRouteAsync rejected in routes rune', asyncRes.reason);
				// Sentry breadcrumb for production debugging (per CLAUDE + current patterns elsewhere in form)
				Sentry.addBreadcrumb({
					category: 'wallet.swap.routes',
					message: 'resolveRouteAsync failed',
					data: { source: snapshotSrc, dest: snapshotDst, error: String(asyncRes.reason) }
				});
			}

			if (smartRes.status === 'fulfilled' && smartRes.value) {
				smartRoute = smartRes.value;
				d.log(
					'SmartRouter found route: provider=%s fee=%d',
					smartRes.value.provider,
					smartRes.value.totalFeeSats
				);
			} else if (smartRes.status === 'rejected') {
				d.warn('SmartRouter rejected', smartRes.reason);
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

	// destinationFor (exact from SwapForm:689-698; internal but exposed per design)
	function destinationFor(dt: DestType): Destination {
		if (dt === 'btc-onchain') {
			return { type: 'invoice', network: 'onchain', invoice: '' };
		}
		if (dt === 'wbtc-arb') {
			return { type: 'address', chainId: 42161, address: '', asset: 'WBTC' };
		}
		const chainId = dt === 'rbtc-rsk' ? 30 : dt === 'usdt0-arb' ? 42161 : 30;
		return { type: 'address', chainId, address: '' };
	}

	// amountInTokenUnits recovery (for estimatedOutput fallback calc; exact math from form amountSats + amountInTokenUnits)
	// Uses amountSats + source + btcPrice (no direct dep on calculator rune; design opts only getAmountSats)
	const amountInTokenUnits = $derived.by(() => {
		const sats = amountSats;
		if (sats <= 0) return 0;
		const src = currentSourceType;
		const p = btcUsdPrice;
		if (src === 'rbtc') {
			return sats / 100_000_000;
		}
		// usdt0 source: recover from sats (which was derived using price in calculator)
		return p > 0 ? (sats / 100_000_000) * p : 0;
	});

	// activeRouteForCalc (exact comment + logic from SwapForm:779-782)
	const activeRouteForCalc = $derived.by((): Route | null => {
		if (smartRoute) return null; // SmartRouter handles fee display separately
		return asyncRouteResult.routes[0] ?? null;
	});

	// networkFeeSats (exact fallback chain + isSimple + gas math + defaults + logs from SwapForm:788-825)
	const networkFeeSats = $derived.by(() => {
		if (amountSats <= 0) return 0;

		if (smartRoute?.gasCostWei) {
			try {
				const gasWei = BigInt(smartRoute.gasCostWei);
				const sats = Number(gasWei / 10_000_000_000n);
				d.log('networkFeeSats: using gasCostWei from SmartRouter → %d sats', sats);
				return sats;
			} catch (e) {
				d.warn('Failed to parse SmartRouter gasCostWei', e);
			}
		}

		const fallbackRoute = activeRouteForCalc;
		if (fallbackRoute?.gasCostWei) {
			try {
				const gasWei = BigInt(fallbackRoute.gasCostWei);
				return Number(gasWei / 10_000_000_000n);
			} catch (e) {
				d.warn('Failed to parse fallback gasCostWei', e);
			}
		}

		const isSimpleTransfer =
			(currentSourceType === 'rbtc' && currentDestType === 'rbtc-rsk') ||
			(currentSourceType === 'usdt0-arb' && currentDestType === 'usdt0-arb');

		if (currentSourceType === 'rbtc') {
			const gasPrice = rskGasPriceWei > 0n ? rskGasPriceWei : 65_000_000n;
			const gasLimit = isSimpleTransfer ? 21_000n : 500_000n;
			return Number((gasLimit * gasPrice) / 10_000_000_000n);
		}

		if (currentSourceType === 'usdt0-arb') {
			const gasLimit = isSimpleTransfer ? 65_000n : 300_000n;
			const gasPrice = arbGasPriceWei > 0n ? arbGasPriceWei : 30_000_000n;
			const gasCostWei = gasLimit * gasPrice;
			const ethPrice = ethUsdPrice > 0 ? ethUsdPrice : 2500;
			const btcP = btcUsdPrice > 0 ? btcUsdPrice : 74000;
			const gasCostEth = Number(gasCostWei) / 1e18;
			const gasCostSats = ((gasCostEth * ethPrice) / btcP) * 100_000_000;
			return Math.round(Math.max(gasCostSats, 1));
		}

		return 0;
	});

	// totalFeeSats (exact from SwapForm:830-835)
	const totalFeeSats = $derived.by(() => {
		if (smartRoute?.totalFeeSats != null) return smartRoute.totalFeeSats;
		const route = activeRouteForCalc;
		if (!route || amountSats <= 0) return 0;
		return networkFeeSats + Math.round((amountSats * route.totalFeePercent) / 100);
	});

	// minSwapSats — minimum swap amount from Boltz limits (or default for Boltz-eligible pairs).
	// 0 means no minimum applies (direct transfers, LI.FI-only routes).
	const BOLTZ_DEFAULT_MIN_SATS = 2500;
	const minSwapSats = $derived.by(() => {
		// From smart route metadata (Boltz API limits)
		if (smartRoute?.routeMetadata?.limits) {
			const limits = smartRoute.routeMetadata.limits as { min?: number; max?: number };
			if (typeof limits.min === 'number' && limits.min > 0) return Math.ceil(limits.min);
		}
		// Default for Boltz-eligible pairs (rBTC → non-rbtc-rsk destinations)
		if (currentSourceType === 'rbtc' && currentDestType !== 'rbtc-rsk') {
			return BOLTZ_DEFAULT_MIN_SATS;
		}
		// BTC on-chain also goes through Boltz (reverse swap) — same minimum
		if (currentSourceType === 'btc-onchain' && currentDestType !== 'btc-onchain') {
			return BOLTZ_DEFAULT_MIN_SATS;
		}
		return 0;
	});

	// estimatedOutput (exact smart prefer + boltz conv + fallback math from SwapForm:751-774)
	const estimatedOutput = $derived.by(() => {
		if (smartRoute?.estimatedOutput && smartRoute.estimatedOutput !== '0') {
			const out = parseFloat(smartRoute.estimatedOutput);
			if (!Number.isFinite(out)) return '0';
			// Boltz output is in TBTC (≈ BTC), convert to USD for non-BTC destinations
			if (smartRoute.provider === 'boltz' && currentDestType === 'usdt0-arb') {
				return (out * btcUsdPrice).toFixed(2);
			}
			return out.toFixed(6);
		}

		// Compute from fallback route resolver (exact)
		const route = activeRouteForCalc;
		if (!route || amountInTokenUnits <= 0) return '0';
		const fee = 1 - route.totalFeePercent / 100;
		let sourceAmt = amountInTokenUnits;
		// Deduct gas for rBTC source
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

	// getExecutableRoute helper (per design: converts Smart? or picks async[0] or hardcoded lifi-usdt0)
	// Replicates + extends current executeSwap special-case (SwapForm:1046-1069) for Smart support on retry.
	function getExecutableRoute(): Route | null {
		const src = opts.getSourceType(); // fresh read
		const dst = opts.getDestType?.(); // fresh read

		d.log(
			'getExecutableRoute: src=%s dst=%s smartRoute=%s asyncRoutes=%d',
			src,
			dst,
			smartRoute?.provider ?? 'null',
			asyncRouteResult.routes.length
		);

		// wBTC → rBTC: LI.FI cross-chain
		if (src === 'wbtc-arb' && dst === 'rbtc-rsk') {
			return {
				id: 'wbtc-to-rbtc-via-lifi',
				label: 'LI.FI',
				hops: [
					{
						service: 'lifi',
						fromAsset: 'WBTC',
						fromChain: 'arbitrum',
						toAsset: 'RBTC',
						toChain: 'rsk',
						feePercent: 0.3,
						estimatedTimeMin: 2,
						estimatedTimeMax: 5
					}
				],
				totalFeePercent: 0.3,
				estimatedTime: '2-5 min',
				recommended: true
			};
		}

		// wBTC → USDT0: LI.FI same-chain on Arbitrum
		if (src === 'wbtc-arb' && dst === 'usdt0-arb') {
			return {
				id: 'wbtc-to-usdt0-via-lifi',
				label: 'LI.FI',
				hops: [
					{
						service: 'lifi',
						fromAsset: 'WBTC',
						fromChain: 'arbitrum',
						toAsset: 'USDT0',
						toChain: 'arbitrum',
						feePercent: 0.3,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					}
				],
				totalFeePercent: 0.3,
				estimatedTime: '1-2 min',
				recommended: true
			};
		}

		// USDT0 → wBTC: LI.FI same-chain on Arbitrum
		if (src === 'usdt0-arb' && dst === 'wbtc-arb') {
			return {
				id: 'usdt0-to-wbtc-via-lifi',
				label: 'LI.FI',
				hops: [
					{
						service: 'lifi',
						fromAsset: 'USDT0',
						fromChain: 'arbitrum',
						toAsset: 'WBTC',
						toChain: 'arbitrum',
						feePercent: 0.3,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					}
				],
				totalFeePercent: 0.3,
				estimatedTime: '1-2 min',
				recommended: true
			};
		}

		// BTC on-chain → rBTC: Boltz reverse swap
		if (src === 'btc-onchain' && dst === 'rbtc-rsk') {
			return {
				id: 'btc-to-rbtc-via-boltz',
				label: 'Boltz',
				hops: [
					{
						service: 'boltz',
						fromAsset: 'BTC',
						fromChain: 'bitcoin',
						toAsset: 'RBTC',
						toChain: 'rsk',
						feePercent: 0.25,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					}
				],
				totalFeePercent: 0.25,
				estimatedTime: '10-30 min',
				recommended: true
			};
		}

		// BTC on-chain → USDT0: Boltz reverse + LI.FI
		if (src === 'btc-onchain' && dst === 'usdt0-arb') {
			return {
				id: 'btc-to-usdt0-via-boltz-lifi',
				label: 'Boltz → LI.FI',
				hops: [
					{
						service: 'boltz',
						fromAsset: 'BTC',
						fromChain: 'bitcoin',
						toAsset: 'TBTC',
						toChain: 'arbitrum',
						feePercent: 0.25,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'lifi',
						fromAsset: 'TBTC',
						fromChain: 'arbitrum',
						toAsset: 'USDT0',
						toChain: 'arbitrum',
						feePercent: 0.3,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					}
				],
				totalFeePercent: 0.55,
				estimatedTime: '11-35 min',
				recommended: true
			};
		}

		// BTC on-chain → wBTC: Boltz reverse + LI.FI
		if (src === 'btc-onchain' && dst === 'wbtc-arb') {
			return {
				id: 'btc-to-wbtc-via-boltz-lifi',
				label: 'Boltz → LI.FI',
				hops: [
					{
						service: 'boltz',
						fromAsset: 'BTC',
						fromChain: 'bitcoin',
						toAsset: 'TBTC',
						toChain: 'arbitrum',
						feePercent: 0.25,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'lifi',
						fromAsset: 'TBTC',
						fromChain: 'arbitrum',
						toAsset: 'WBTC',
						toChain: 'arbitrum',
						feePercent: 0.5,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					}
				],
				totalFeePercent: 0.75,
				estimatedTime: '11-35 min',
				recommended: true
			};
		}

		// wBTC on Arbitrum from rBTC: 2-hop route via Boltz (RBTC→tBTC) + LI.FI (tBTC→WBTC)
		if (dst === 'wbtc-arb' && src === 'rbtc') {
			return {
				id: 'rbtc-to-wbtc-arb-via-boltz-lifi',
				label: 'Boltz → LI.FI',
				hops: [
					{
						service: 'boltz',
						fromAsset: 'RBTC',
						fromChain: 'rsk',
						toAsset: 'TBTC',
						toChain: 'arbitrum',
						feePercent: 0.1,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					},
					{
						service: 'lifi',
						fromAsset: 'TBTC',
						fromChain: 'arbitrum',
						toAsset: 'WBTC',
						toChain: 'arbitrum',
						feePercent: 0.5,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					}
				],
				totalFeePercent: 0.6,
				estimatedTime: '2-10 min',
				recommended: true
			};
		}

		if (src === 'usdt0-arb' && dst === 'rbtc-rsk') {
			// Two-hop: Symbiosis same-chain (USDT0→tBTC) + Boltz chain swap (tBTC→rBTC)
			// Cheaper than direct LI.FI/Symbiosis cross-chain because Boltz tBTC→rBTC is 1:1.
			return {
				id: 'symbiosis-boltz-usdt0-to-rbtc',
				label: 'Symbiosis → Boltz',
				hops: [
					{
						service: 'symbiosis',
						fromAsset: 'USDT0',
						fromChain: 'arbitrum',
						toAsset: 'TBTC',
						toChain: 'arbitrum',
						feePercent: 0.3,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					},
					{
						service: 'boltz',
						fromAsset: 'TBTC',
						fromChain: 'arbitrum',
						toAsset: 'RBTC',
						toChain: 'rsk',
						feePercent: 0.25,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					}
				],
				totalFeePercent: 0.55,
				estimatedTime: '2-7 min',
				recommended: true
			};
		}

		if (smartRoute) {
			const r = smartToRoute(smartRoute);
			d.log('getExecutableRoute: using smartRoute → %s hops=%d', r.id, r.hops.length);
			return r;
		}
		const fallback = asyncRouteResult.routes[0] ?? null;
		d.log('getExecutableRoute: fallback → %s', fallback?.id ?? 'null');
		return fallback;
	}

	// Conversion helper (for getExecutableRoute when Smart present; enables consistent Route shape for startSwapChain)
	function smartToRoute(s: SmartRoute, _src?: string, _dst?: string): Route {
		const provider = s.provider;

		// Use chains from the SmartRoute if set by the builder. Otherwise derive from asset names.
		function deriveChain(asset: string, fallback: string): string {
			const a = (asset || '').toUpperCase();
			if (a === 'RBTC') return 'rsk';
			if (a === 'BTC') return 'bitcoin';
			if (a === 'TBTC' || a === 'USDT0' || a === 'WBTC') return 'arbitrum';
			return fallback;
		}

		const fromChain = s.fromChain ?? deriveChain(s.fromAsset, 'rsk');
		const toChain = s.toChain ?? deriveChain(s.toAsset, 'rsk');

		// boltz+lifi is a 2-hop route: Boltz chain swap (RBTC→tBTC on Arbitrum) + LI.FI same-chain (tBTC→final asset).
		// The intermediate asset is always TBTC on Arbitrum.
		if (provider === 'boltz+lifi') {
			return {
				id: `smart-${provider}`,
				label: 'Boltz + LI.FI',
				hops: [
					{
						service: 'boltz',
						fromAsset: s.fromAsset,
						fromChain,
						toAsset: 'TBTC',
						toChain: 'arbitrum',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					},
					{
						service: 'lifi',
						fromAsset: 'TBTC',
						fromChain: 'arbitrum',
						toAsset: s.toAsset,
						toChain: 'arbitrum',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5,
						gasCostWei: s.gasCostWei,
						feeCosts: s.feeCosts
					}
				],
				totalFeePercent: 0,
				estimatedTime: `${s.estimatedTimeMinutes || 5} min`,
				recommended: true,
				gasCostWei: s.gasCostWei,
				feeCosts: s.feeCosts
			};
		}

		// symbiosis+boltz is a 2-hop route: Symbiosis same-chain (USDT0→tBTC on Arbitrum) + Boltz chain swap (tBTC→rBTC on RSK).
		if (provider === 'symbiosis+boltz') {
			return {
				id: `smart-${provider}`,
				label: 'Symbiosis → Boltz',
				hops: [
					{
						service: 'symbiosis',
						fromAsset: s.fromAsset,
						fromChain,
						toAsset: 'TBTC',
						toChain: 'arbitrum',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					},
					{
						service: 'boltz',
						fromAsset: 'TBTC',
						fromChain: 'arbitrum',
						toAsset: s.toAsset,
						toChain,
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 5
					}
				],
				totalFeePercent: 0,
				estimatedTime: `${s.estimatedTimeMinutes || 4} min`,
				recommended: true
			};
		}

		const service: RouteHop['service'] =
			provider === 'direct' ? 'direct' : (provider as RouteHop['service']);

		return {
			id: `smart-${provider}`,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			hops: [
				{
					service,
					fromAsset: s.fromAsset,
					fromChain,
					toAsset: s.toAsset,
					toChain,
					feePercent: 0,
					estimatedTimeMin: s.estimatedTimeMinutes || 1,
					estimatedTimeMax: (s.estimatedTimeMinutes || 1) + 1,
					gasCostWei: s.gasCostWei,
					feeCosts: s.feeCosts
				}
			],
			totalFeePercent: 0,
			estimatedTime: `${s.estimatedTimeMinutes || 5} min`,
			recommended: true,
			gasCostWei: s.gasCostWei,
			feeCosts: s.feeCosts
		};
	}

	function clearRoutes(): void {
		if (_routeTimer) {
			clearTimeout(_routeTimer);
			_routeTimer = null;
		}
		if (currentController) {
			currentController.abort();
			currentController = null;
		}
		smartRoute = null;
		asyncRouteResult = createInitialAsyncRouteResult();
		routeLoading = false;
		d.log('clearRoutes');
	}

	function refreshRoutes(): void {
		d.log('refreshRoutes (nonce bump)');
		refreshNonce += 1;
		// Effect re-runs (reads nonce) and re-schedules if amt > 0
	}

	// Public API (reactive primitives + fns; consumers destructure/use in $derived/template)
	return {
		// state
		get smartRoute() {
			return smartRoute;
		},
		get asyncRouteResult() {
			return asyncRouteResult;
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
		get minSwapSats() {
			return minSwapSats;
		},

		getExecutableRoute,
		clearRoutes,
		refreshRoutes,
		destinationFor
	};
}

// Pure helper exports (testable standalone, per design "pure helpers exported")
export function createInitialRoutesState(): {
	smartRoute: SmartRoute | null;
	asyncRouteResult: AsyncRouteResult;
	routeLoading: boolean;
} {
	return {
		smartRoute: null,
		asyncRouteResult: createInitialAsyncRouteResult(),
		routeLoading: false
	};
}
