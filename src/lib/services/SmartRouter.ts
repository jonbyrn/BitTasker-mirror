/**
 * Smart Router — Multi-Provider Swap Comparison
 *
 * Queries available swap providers in parallel and returns the single cheapest
 * route for a given asset pair. Falls back gracefully — if a provider is
 * unreachable it is silently skipped.
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { lifiService } from '$lib/services/lifi.service';
import { symbiosisService } from '$lib/services/symbiosis.service';
import { boltzProvider, type BoltzQuote } from '$lib/services/BoltzProvider';
import type { SourceWallet } from '$lib/services/route-resolver';

const debug = createDebug('smart-router');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID_RSK = import.meta.env.VITE_RSK_NETWORK === 'regtest' ? 33 : 30;
const CHAIN_ID_ARB = 42161;

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
const USDT0_ARB_ADDR = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const TBTC_ARB_ADDR = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
const WBTC_ARB_ADDR = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const LIFI_QUOTE_FALLBACK_ADDRESS = '0x0000000000000000000000000000000000000001';

const BOLTZ_TIME_MIN = 5;
const LIFI_TIME_MIN = 2;

const SAT_TO_WEI = BigInt(1e10);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartRoute {
	provider:
		| 'boltz'
		| 'lifi'
		| 'paraswap'
		| 'direct'
		| 'boltz+lifi'
		| 'symbiosis'
		| 'symbiosis+boltz';
	fromAsset: string;
	toAsset: string;
	estimatedOutput: string;
	totalFeeSats: number;
	estimatedTimeMinutes: number;
	gasCostWei?: string;
	feeCosts?: Array<{ name: string; amount: string }>;
	routeMetadata?: Record<string, unknown>;
	fallbackRoutes?: SmartRoute[];
	/** Chain name for the source asset (e.g. 'rsk', 'arbitrum', 'bitcoin'). */
	fromChain?: string;
	/** Chain name for the destination asset (e.g. 'rsk', 'arbitrum', 'bitcoin'). */
	toChain?: string;
	/** Total fee as a percentage (0-100). Computed from totalFeeSats when available. */
	totalFeePercent?: number;
	/** Human-readable estimated time (e.g. '5 min'). Derived from estimatedTimeMinutes. */
	estimatedTime?: string;
}

type RouteBuilder = () => Promise<SmartRoute | null>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class SmartRouter {
	private boltz = boltzProvider;

	async getBestRoute(
		fromAsset: SourceWallet,
		toAsset: SourceWallet | 'wbtc-arb' | 'btc-onchain',
		amountSats: number
	): Promise<SmartRoute | null> {
		debug.log('getBestRoute: %s -> %s (%d sats)', fromAsset, toAsset, amountSats);

		const builders = new Map<string, RouteBuilder>();

		// Same asset — direct wallet route (no swap needed)
		if (fromAsset === toAsset) {
			builders.set('direct', () => this.buildDirectRoute(fromAsset, toAsset, amountSats));
			return this.pickBest(builders);
		}

		// rBTC / USDT0 → BTC-onchain: Boltz chain swap via tBTC
		if ((fromAsset === 'rbtc' || fromAsset === 'usdt0-arb') && toAsset === 'btc-onchain') {
			builders.set('boltz', () => this.buildBoltzRoute(amountSats));
			return this.pickBest(builders);
		}

		// rBTC / USDT0 → wBTC on Arbitrum: 2-hop Boltz (RBTC→tBTC) + LI.FI (tBTC→WBTC)
		if ((fromAsset === 'rbtc' || fromAsset === 'usdt0-arb') && toAsset === 'wbtc-arb') {
			builders.set('boltz+lifi', () => this.buildBoltzLifiWbtcRoute(amountSats));
			return this.pickBest(builders);
		}

		// rBTC → USDT0 on Arbitrum: Boltz chain swap (RBTC→tBTC) + LI.FI (tBTC→USDT0) + Symbiosis
		if (fromAsset === 'rbtc' && toAsset === 'usdt0-arb') {
			builders.set('boltz+lifi', () => this.buildBoltzLifiUsdtFromRbtcRoute(amountSats));
			builders.set('lifi', () => this.buildLifiRoute(amountSats));
			builders.set('symbiosis', () =>
				this.buildSymbiosisRoute(
					amountSats,
					'RBTC',
					'rsk',
					CHAIN_ID_RSK,
					NATIVE_TOKEN,
					18,
					'USDT0',
					'arbitrum',
					CHAIN_ID_ARB,
					USDT0_ARB_ADDR,
					6
				)
			);
		}

		// USDT0 → rBTC: 2-hop via Symbiosis same-chain (USDT0→tBTC) + Boltz chain swap (tBTC→rBTC)
		// This is cheaper than direct LI.FI/Symbiosis because Boltz tBTC→rBTC is 1:1 with minimal fees.
		if (fromAsset === 'usdt0-arb' && toAsset === 'rbtc') {
			builders.set('symbiosis+boltz', () => this.buildSymbiosisBoltzRbtcRoute(amountSats));
			builders.set('boltz', () => this.buildBoltzLinkedRoute(amountSats));
			builders.set('lifi', () => this.buildReverseLifiRoute(amountSats));
			builders.set('symbiosis', () =>
				this.buildSymbiosisRoute(
					amountSats,
					'USDT0',
					'arbitrum',
					CHAIN_ID_ARB,
					USDT0_ARB_ADDR,
					6,
					'RBTC',
					'rsk',
					CHAIN_ID_RSK,
					NATIVE_TOKEN,
					18
				)
			);
		}

		// wBTC → rBTC: LI.FI + Symbiosis cross-chain (Arbitrum→RSK)
		if (fromAsset === 'wbtc-arb' && (toAsset as unknown as string) === 'rbtc-rsk') {
			builders.set('lifi', () => this.buildLifiWbtcToRbtcRoute(amountSats));
			builders.set('symbiosis', () =>
				this.buildSymbiosisRoute(
					amountSats,
					'WBTC',
					'arbitrum',
					CHAIN_ID_ARB,
					WBTC_ARB_ADDR,
					8,
					'RBTC',
					'rsk',
					CHAIN_ID_RSK,
					NATIVE_TOKEN,
					18
				)
			);
		}

		// wBTC → USDT0: LI.FI + Symbiosis same-chain on Arbitrum
		if (fromAsset === 'wbtc-arb' && toAsset === 'usdt0-arb') {
			builders.set('lifi', () =>
				this.buildLifiSameChainRoute(amountSats, WBTC_ARB_ADDR, USDT0_ARB_ADDR, 8, 'WBTC', 'USDT0')
			);
			builders.set('symbiosis', () =>
				this.buildSymbiosisRoute(
					amountSats,
					'WBTC',
					'arbitrum',
					CHAIN_ID_ARB,
					WBTC_ARB_ADDR,
					8,
					'USDT0',
					'arbitrum',
					CHAIN_ID_ARB,
					USDT0_ARB_ADDR,
					6
				)
			);
		}

		// USDT0 → wBTC: LI.FI + Symbiosis same-chain on Arbitrum
		if (fromAsset === 'usdt0-arb' && toAsset === 'wbtc-arb') {
			builders.set('lifi', () =>
				this.buildLifiSameChainRoute(amountSats, USDT0_ARB_ADDR, WBTC_ARB_ADDR, 8, 'USDT0', 'WBTC')
			);
			builders.set('symbiosis', () =>
				this.buildSymbiosisRoute(
					amountSats,
					'USDT0',
					'arbitrum',
					CHAIN_ID_ARB,
					USDT0_ARB_ADDR,
					6,
					'WBTC',
					'arbitrum',
					CHAIN_ID_ARB,
					WBTC_ARB_ADDR,
					8
				)
			);
		}

		// BTC on-chain → rBTC: Boltz reverse swap
		if (fromAsset === 'btc-onchain' && (toAsset as unknown as string) === 'rbtc-rsk') {
			builders.set('boltz', () => this.buildBoltzReverseRoute(amountSats));
		}

		// BTC on-chain → USDT0: Boltz reverse (BTC→tBTC) + LI.FI (tBTC→USDT0 on Arb)
		if (fromAsset === 'btc-onchain' && toAsset === 'usdt0-arb') {
			builders.set('boltz+lifi', () => this.buildBoltzLifiUsdtRoute(amountSats));
		}

		// BTC on-chain → wBTC: Boltz reverse (BTC→tBTC) + LI.FI (tBTC→WBTC on Arb)
		if (fromAsset === 'btc-onchain' && toAsset === 'wbtc-arb') {
			builders.set('boltz+lifi', () => this.buildBoltzLifiWbtcFromBtcRoute(amountSats));
		}

		return this.pickBest(builders);
	}

	// -----------------------------------------------------------------------
	// Private — route builders
	// -----------------------------------------------------------------------

	private async pickBest(builders: Map<string, RouteBuilder>): Promise<SmartRoute | null> {
		if (builders.size === 0) return null;

		const entries = Array.from(builders.entries());
		const results = await Promise.allSettled(entries.map(([, fn]) => fn()));

		const candidates: SmartRoute[] = [];

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const [provider] = entries[i];

			if (result.status === 'fulfilled' && result.value !== null) {
				candidates.push(result.value);
				debug.log(
					'%s route: fee=%d output=%s',
					provider,
					result.value.totalFeeSats,
					result.value.estimatedOutput
				);
			} else {
				const reason =
					result.status === 'rejected'
						? `rejected: ${result.reason?.message ?? 'unknown'}`
						: 'returned null';
				debug.warn('%s route unavailable: %s', provider, reason);
			}
		}

		if (candidates.length === 0) {
			debug.warn('No routes available for this pair');
			return null;
		}

		candidates.sort((a, b) => a.totalFeeSats - b.totalFeeSats);
		const best = candidates[0];
		if (candidates.length > 1) best.fallbackRoutes = candidates.slice(1);
		return best;
	}

	private async buildBoltzRoute(amountSats: number): Promise<SmartRoute | null> {
		const { data: quote, error } = await tryCatch(this.boltz.getQuote(amountSats));
		if (error || !quote) {
			if (error) debug.warn('Boltz getQuote failed: %s', error.message);
			return null;
		}
		return boltzQuoteToRoute(quote, amountSats);
	}

	private async buildLifiRoute(amountSats: number): Promise<SmartRoute | null> {
		const amountWei = String(BigInt(amountSats) * SAT_TO_WEI);
		const { data: route, error } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_RSK,
				toChain: CHAIN_ID_ARB,
				fromToken: NATIVE_TOKEN,
				toToken: USDT0_ARB_ADDR,
				fromAmount: amountWei,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);
		if (error || !route) {
			if (error) debug.warn('LI.FI failed: %s', error.message);
			return null;
		}
		return lifiQuoteToSmartRoute(route, 'rBTC', 'USDT0', 1_000_000);
	}

	private async buildReverseLifiRoute(amountSats: number): Promise<SmartRoute | null> {
		const amountUsdtRaw = String(Math.round(((amountSats * 73_000) / 100_000_000) * 1_000_000));
		const { data: route, error } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_RSK,
				fromToken: USDT0_ARB_ADDR,
				toToken: NATIVE_TOKEN,
				fromAmount: amountUsdtRaw,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);
		if (error || !route) {
			if (error) debug.warn('LI.FI reverse failed: %s', error.message);
			return null;
		}
		// LI.FI toAmount for rBTC is in wei (18 decimals) → divide by 1e10 for sats-equivalent
		return lifiQuoteToSmartRoute(route, 'USDT0', 'rBTC', 1e10);
	}

	/**
	 * Boltz linked swap: USDT0 → tBTC (DEX) → Lightning (submarine) → rBTC (reverse).
	 * Estimates fees from both Boltz swap endpoints without creating the swaps.
	 */
	private async buildBoltzLinkedRoute(amountSats: number): Promise<SmartRoute | null> {
		// Fetch submarine (TBTC→LN) and reverse (LN→RBTC) fees from actual API
		const [subResult, revResult] = await Promise.allSettled([
			fetchSubmarineFee(amountSats), // TBTC → Lightning: 0.5% + miner
			fetchReverseFee() // Lightning → RBTC: 0.25% + 185 sats
		]);

		if (subResult.status !== 'fulfilled' || !subResult.value) return null;
		if (revResult.status !== 'fulfilled' || !revResult.value) return null;

		const submarineFeeSats = subResult.value;
		const reverseFeeSats = revResult.value;

		// DEX cost (USDT0→tBTC on Arbitrum) — negligible, Paraswap does ~0.01%
		const dexFeeSats = 5; // ~$0.004 at current rate

		const totalFeeSats = submarineFeeSats + reverseFeeSats + dexFeeSats;
		const outputSats = Math.max(0, amountSats - totalFeeSats);
		const tbtcAmount = outputSats / 100_000_000;

		return {
			provider: 'boltz',
			fromAsset: 'USDT0',
			toAsset: 'rBTC',
			fromChain: 'arbitrum',
			toChain: 'rsk',
			estimatedOutput: String(tbtcAmount),
			totalFeeSats,
			estimatedTimeMinutes: BOLTZ_TIME_MIN,
			routeMetadata: {
				submarineFee: submarineFeeSats,
				reverseFee: reverseFeeSats,
				dexFee: dexFeeSats,
				outputSats
			}
		};
	}

	/**
	 * 2-hop route: Boltz chain swap (RBTC→tBTC on Arbitrum) + LI.FI same-chain (tBTC→WBTC on Arbitrum).
	 * Fetches real Boltz fees and LI.FI quote for tBTC→WBTC, then combines.
	 */
	private async buildBoltzLifiWbtcRoute(amountSats: number): Promise<SmartRoute | null> {
		// Step 1: Boltz RBTC→TBTC chain swap quote
		const { data: boltzQuote, error: boltzErr } = await tryCatch(this.boltz.getQuote(amountSats));
		if (boltzErr || !boltzQuote) {
			if (boltzErr) debug.warn('Boltz quote failed for wBTC route: %s', boltzErr.message);
			return null;
		}

		// After Boltz chain swap, received tBTC = amountSats - boltzQuote.totalFeeSats
		const tbtcOutputSats = Math.max(0, amountSats - boltzQuote.totalFeeSats);

		// Step 2: LI.FI tBTC→WBTC same-chain on Arbitrum
		// tBTC has 18 decimals on Arbitrum, WBTC has 8 decimals
		const tbtcWei = String(BigInt(tbtcOutputSats) * BigInt(1e10)); // sats → wei (18 decimals)
		const { data: lifiRoute, error: lifiErr } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_ARB,
				fromToken: TBTC_ARB_ADDR,
				toToken: WBTC_ARB_ADDR,
				fromAmount: tbtcWei,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);

		if (lifiErr || !lifiRoute) {
			if (lifiErr) debug.warn('LI.FI tBTC→WBTC quote failed: %s', lifiErr.message);
			// Return Boltz-only route with tBTC output if LI.FI fails
			const outputSats = Math.max(0, amountSats - boltzQuote.totalFeeSats);
			return {
				provider: 'boltz',
				fromAsset: 'RBTC',
				toAsset: 'WBTC',
				fromChain: 'rsk',
				toChain: 'arbitrum',
				estimatedOutput: String(outputSats / 100_000_000),
				totalFeeSats: boltzQuote.totalFeeSats,
				estimatedTimeMinutes: BOLTZ_TIME_MIN,
				routeMetadata: { warning: 'LI.FI tBTC→WBTC unavailable, output in tBTC', boltzQuote }
			};
		}

		// LI.FI estimate.toAmount is WBTC with 8 decimals
		const rawWbtcOutput = lifiRoute.estimate?.toAmount ?? '0';
		const lifiOutputSats = Math.round(Number(rawWbtcOutput)); // WBTC uses 8 decimals = satoshi equivalent
		const totalFeeSats = boltzQuote.totalFeeSats + Math.max(0, tbtcOutputSats - lifiOutputSats);

		// Get gas cost from LI.FI
		const gasCostWei = lifiRoute.estimate?.gasCosts?.[0]?.amount;

		return {
			provider: 'boltz+lifi',
			fromAsset: 'RBTC',
			toAsset: 'WBTC',
			fromChain: 'rsk',
			toChain: 'arbitrum',
			estimatedOutput: String(lifiOutputSats / 100_000_000),
			totalFeeSats,
			estimatedTimeMinutes: BOLTZ_TIME_MIN + LIFI_TIME_MIN,
			gasCostWei,
			feeCosts: lifiRoute.estimate?.feeCosts?.map((fc) => ({ name: fc.name, amount: fc.amount })),
			routeMetadata: {
				boltzFee: boltzQuote.totalFeeSats,
				lifiFee: totalFeeSats - boltzQuote.totalFeeSats,
				tbtcOutputSats,
				wbtcOutputSats: lifiOutputSats
			}
		};
	}

	/**
	 * 2-hop route: Boltz chain swap (RBTC→tBTC on Arbitrum) + LI.FI same-chain (tBTC→USDT0 on Arbitrum).
	 * Same pattern as buildBoltzLifiWbtcRoute but targets USDT0 instead of WBTC.
	 */
	private async buildBoltzLifiUsdtFromRbtcRoute(amountSats: number): Promise<SmartRoute | null> {
		// Step 1: Boltz RBTC→TBTC chain swap quote
		const { data: boltzQuote, error: boltzErr } = await tryCatch(this.boltz.getQuote(amountSats));
		if (boltzErr || !boltzQuote) {
			if (boltzErr) debug.warn('Boltz quote failed for USDT0 route: %s', boltzErr.message);
			return null;
		}

		// After Boltz chain swap, received tBTC = amountSats - boltzQuote.totalFeeSats
		const tbtcOutputSats = Math.max(0, amountSats - boltzQuote.totalFeeSats);

		// Step 2: LI.FI tBTC→USDT0 same-chain on Arbitrum
		// tBTC has 18 decimals on Arbitrum, USDT0 has 6 decimals
		const tbtcWei = String(BigInt(tbtcOutputSats) * BigInt(1e10)); // sats → wei (18 decimals)
		const { data: lifiRoute, error: lifiErr } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_ARB,
				fromToken: TBTC_ARB_ADDR,
				toToken: USDT0_ARB_ADDR,
				fromAmount: tbtcWei,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);

		if (lifiErr || !lifiRoute) {
			if (lifiErr) debug.warn('LI.FI tBTC→USDT0 quote failed: %s', lifiErr.message);
			// Return Boltz-only route with tBTC output if LI.FI fails
			const outputSats = Math.max(0, amountSats - boltzQuote.totalFeeSats);
			return {
				provider: 'boltz+lifi',
				fromAsset: 'RBTC',
				toAsset: 'TBTC',
				fromChain: 'rsk',
				toChain: 'arbitrum',
				estimatedOutput: String(outputSats / 100_000_000),
				totalFeeSats: boltzQuote.totalFeeSats,
				estimatedTimeMinutes: BOLTZ_TIME_MIN,
				routeMetadata: { warning: 'LI.FI tBTC→USDT0 unavailable, output in tBTC', boltzQuote }
			};
		}

		// LI.FI estimate.toAmount is USDT0 with 6 decimals
		const rawUsdtOutput = lifiRoute.estimate?.toAmount ?? '0';
		const lifiOutputSats = Math.round(Number(rawUsdtOutput)); // USDT0 6 dec → micro-USDT ≈ sats
		const totalFeeSats = boltzQuote.totalFeeSats + Math.max(0, tbtcOutputSats - lifiOutputSats);

		// Get gas cost from LI.FI
		const gasCostWei = lifiRoute.estimate?.gasCosts?.[0]?.amount;

		return {
			provider: 'boltz+lifi',
			fromAsset: 'RBTC',
			toAsset: 'USDT0',
			fromChain: 'rsk',
			toChain: 'arbitrum',
			estimatedOutput: (lifiOutputSats / 1_000_000).toFixed(2), // USDT0 in USD
			totalFeeSats,
			estimatedTimeMinutes: BOLTZ_TIME_MIN + LIFI_TIME_MIN,
			gasCostWei,
			feeCosts: lifiRoute.estimate?.feeCosts?.map((fc) => ({ name: fc.name, amount: fc.amount })),
			routeMetadata: {
				boltzFee: boltzQuote.totalFeeSats,
				lifiFee: totalFeeSats - boltzQuote.totalFeeSats,
				tbtcOutputSats,
				usdt0OutputMicro: lifiOutputSats
			}
		};
	}

	/**
	 * 2-hop route: Symbiosis same-chain (USDT0→tBTC on Arbitrum) + Boltz chain swap (tBTC→rBTC on RSK).
	 *
	 * This is the cheapest route for USDT0→rBTC because:
	 * - Symbiosis does a same-chain DEX swap (USDT0→tBTC) with low slippage
	 * - Boltz does a 1:1 chain swap (tBTC→rBTC) with only 0.25% + ~69 sats miner fee
	 *
	 * Direct LI.FI/Symbiosis cross-chain routes charge $2-3 flat bridge fees which
	 * are proportionally expensive for smaller amounts.
	 */
	private async buildSymbiosisBoltzRbtcRoute(amountSats: number): Promise<SmartRoute | null> {
		const SYMBIOSIS_TIME_MIN = 1;

		// Step 1: Symbiosis same-chain quote (USDT0 → tBTC on Arbitrum)
		// amountSats is in BTC sats equivalent; convert to USDT0 micro-units (6 decimals)
		const usdt0Amount = String(Math.round((amountSats / 100_000_000) * 1e6));
		const { data: symQuote, error: symErr } = await tryCatch(
			symbiosisService.getQuote({
				tokenAmountIn: {
					address: USDT0_ARB_ADDR,
					chainId: CHAIN_ID_ARB,
					symbol: 'USDT0',
					decimals: 6,
					amount: usdt0Amount
				},
				tokenOut: {
					address: TBTC_ARB_ADDR,
					chainId: CHAIN_ID_ARB,
					symbol: 'tBTC',
					decimals: 18
				},
				slippage: 50,
				from: LIFI_QUOTE_FALLBACK_ADDRESS,
				to: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);

		if (symErr || !symQuote?.tokenAmountOut?.amount) {
			if (symErr) debug.warn('Symbiosis USDT0→tBTC quote failed: %s', symErr.message);
			return null;
		}

		// Parse tBTC output (18 decimals → sats)
		const tbtcOutputSats = Math.round(Number(symQuote.tokenAmountOut.amount) / 1e10);
		if (tbtcOutputSats <= 0) return null;

		// Step 2: Boltz chain swap quote (tBTC → rBTC)
		const { data: boltzQuote, error: boltzErr } = await tryCatch(
			this.boltz.getQuote(tbtcOutputSats)
		);
		if (boltzErr || !boltzQuote) {
			if (boltzErr) debug.warn('Boltz tBTC→rBTC quote failed: %s', boltzErr.message);
			return null;
		}

		const rBtcOutputSats = Math.max(0, tbtcOutputSats - boltzQuote.totalFeeSats);
		const totalFeeSats = Math.max(0, amountSats - rBtcOutputSats);
		const symFeeSats = amountSats - tbtcOutputSats;

		return {
			provider: 'symbiosis+boltz',
			fromAsset: 'USDT0',
			toAsset: 'rBTC',
			fromChain: 'arbitrum',
			toChain: 'rsk',
			estimatedOutput: (rBtcOutputSats / 100_000_000).toFixed(8),
			totalFeeSats,
			estimatedTimeMinutes: SYMBIOSIS_TIME_MIN + BOLTZ_TIME_MIN,
			routeMetadata: {
				hop1: 'Symbiosis same-chain (USDT0→tBTC on Arbitrum)',
				hop2: 'Boltz chain swap (tBTC→rBTC)',
				symbiosisFee: symFeeSats,
				boltzFee: boltzQuote.totalFeeSats,
				tbtcOutputSats,
				rBtcOutputSats
			}
		};
	}

	/** wBTC (Arbitrum) → rBTC (RSK) via LI.FI cross-chain */
	private async buildLifiWbtcToRbtcRoute(amountSats: number): Promise<SmartRoute | null> {
		const amountWei = String(BigInt(amountSats) * SAT_TO_WEI); // WBTC 8 dec → sats, then to wei for LI.FI
		const { data: route, error } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_RSK,
				fromToken: WBTC_ARB_ADDR,
				toToken: NATIVE_TOKEN,
				fromAmount: amountWei,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);
		if (error || !route) {
			if (error) debug.warn('LI.FI WBTC→RBTC failed: %s', error.message);
			return null;
		}
		return lifiQuoteToSmartRoute(route, 'WBTC', 'rBTC', 1e10);
	}

	/** Same-chain LI.FI swap on Arbitrum (WBTC↔USDT0) */
	private async buildLifiSameChainRoute(
		amountSats: number,
		fromToken: string,
		toToken: string,
		outputDecimals: number,
		fromAsset: string,
		toAsset: string
	): Promise<SmartRoute | null> {
		// Input in sats. For WBTC (8 dec) sats = smallest unit. For USDT0 (6 dec) convert sats → USDT0 units.
		const isFromWbtc = fromToken === WBTC_ARB_ADDR;
		const fromAmount = isFromWbtc
			? String(BigInt(amountSats)) // WBTC sats = smallest unit
			: String(BigInt(Math.round((amountSats / 100_000_000) * 1_000_000))); // sats → USDT0 (6 dec)

		const { data: route, error } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_ARB,
				fromToken,
				toToken,
				fromAmount,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);
		if (error || !route) {
			if (error) debug.warn('LI.FI same-chain %s→%s failed: %s', fromAsset, toAsset, error.message);
			return null;
		}
		const divisor = outputDecimals === 8 ? 1e8 : 1e6;
		return lifiQuoteToSmartRoute(route, fromAsset, toAsset, divisor);
	}

	/** BTC on-chain → rBTC via Boltz reverse swap */
	private async buildBoltzReverseRoute(amountSats: number): Promise<SmartRoute | null> {
		const feeSats = await fetchReverseFee();
		if (feeSats <= 0) return null;
		const outputSats = Math.max(0, amountSats - feeSats);
		return {
			provider: 'boltz',
			fromAsset: 'BTC',
			toAsset: 'RBTC',
			fromChain: 'bitcoin',
			toChain: 'rsk',
			estimatedOutput: String(outputSats / 100_000_000),
			totalFeeSats: feeSats,
			estimatedTimeMinutes: 10, // Bitcoin confirmation + Boltz claim
			routeMetadata: { reverseFee: feeSats, outputSats }
		};
	}

	/** BTC on-chain → USDT0: Boltz reverse (BTC→tBTC) + LI.FI (tBTC→USDT0 on Arbitrum) */
	private async buildBoltzLifiUsdtRoute(amountSats: number): Promise<SmartRoute | null> {
		const feeSats = await fetchReverseFee();
		if (feeSats <= 0) return null;
		const tbtcOutputSats = Math.max(0, amountSats - feeSats);

		// LI.FI tBTC→USDT0 same-chain on Arbitrum
		const tbtcWei = String(BigInt(tbtcOutputSats) * SAT_TO_WEI);
		const { data: lifiRoute, error: lifiErr } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_ARB,
				fromToken: TBTC_ARB_ADDR,
				toToken: USDT0_ARB_ADDR,
				fromAmount: tbtcWei,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);

		if (lifiErr || !lifiRoute) {
			if (lifiErr) debug.warn('LI.FI tBTC→USDT0 failed: %s', lifiErr.message);
			// Boltz-only fallback: output is tBTC (not USDT0)
			return {
				provider: 'boltz',
				fromAsset: 'BTC',
				toAsset: 'TBTC',
				fromChain: 'bitcoin',
				toChain: 'arbitrum',
				estimatedOutput: String(tbtcOutputSats / 100_000_000),
				totalFeeSats: feeSats,
				estimatedTimeMinutes: 10,
				routeMetadata: { warning: 'LI.FI unavailable, output in tBTC', reverseFee: feeSats }
			};
		}

		const rawUsdtOutput = lifiRoute.estimate?.toAmount ?? '0';
		const lifiOutputUsdt = Number(rawUsdtOutput) / 1_000_000; // 6 decimals
		// Approximate USDT0→sats conversion (USDT0 ≈ $1, use conservative BTC price)
		const approxBtcPrice = 73_000; // fallback; live price used in display layer
		const lifiOutputSats = Math.round(lifiOutputUsdt * (100_000_000 / approxBtcPrice));
		const lifiFeeSats = Math.max(0, tbtcOutputSats - lifiOutputSats);
		const totalFee = feeSats + lifiFeeSats;
		const gasCostWei = lifiRoute.estimate?.gasCosts?.[0]?.amount;

		return {
			provider: 'boltz+lifi',
			fromAsset: 'BTC',
			toAsset: 'USDT0',
			fromChain: 'bitcoin',
			toChain: 'arbitrum',
			estimatedOutput: lifiOutputUsdt.toFixed(2),
			totalFeeSats: totalFee,
			estimatedTimeMinutes: 10 + LIFI_TIME_MIN,
			gasCostWei,
			feeCosts: lifiRoute.estimate?.feeCosts?.map((fc) => ({ name: fc.name, amount: fc.amount })),
			routeMetadata: { boltzFee: feeSats, lifiFee: lifiFeeSats, tbtcOutputSats }
		};
	}

	/** BTC on-chain → wBTC: Boltz reverse (BTC→tBTC) + LI.FI (tBTC→WBTC on Arbitrum) */
	private async buildBoltzLifiWbtcFromBtcRoute(amountSats: number): Promise<SmartRoute | null> {
		const feeSats = await fetchReverseFee();
		if (feeSats <= 0) return null;
		const tbtcOutputSats = Math.max(0, amountSats - feeSats);

		// LI.FI tBTC→WBTC same-chain on Arbitrum
		const tbtcWei = String(BigInt(tbtcOutputSats) * SAT_TO_WEI);
		const { data: lifiRoute, error: lifiErr } = await tryCatch(
			lifiService.getQuote({
				fromChain: CHAIN_ID_ARB,
				toChain: CHAIN_ID_ARB,
				fromToken: TBTC_ARB_ADDR,
				toToken: WBTC_ARB_ADDR,
				fromAmount: tbtcWei,
				fromAddress: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);

		if (lifiErr || !lifiRoute) {
			if (lifiErr) debug.warn('LI.FI tBTC→WBTC failed: %s', lifiErr.message);
			return {
				provider: 'boltz',
				fromAsset: 'BTC',
				toAsset: 'TBTC',
				fromChain: 'bitcoin',
				toChain: 'arbitrum',
				estimatedOutput: String(tbtcOutputSats / 100_000_000),
				totalFeeSats: feeSats,
				estimatedTimeMinutes: 10,
				routeMetadata: { warning: 'LI.FI unavailable, output in tBTC', reverseFee: feeSats }
			};
		}

		const rawWbtcOutput = lifiRoute.estimate?.toAmount ?? '0';
		const lifiOutputSats = Math.round(Number(rawWbtcOutput)); // WBTC 8 dec = sats
		const lifiFeeSats = Math.max(0, tbtcOutputSats - lifiOutputSats);
		const totalFee = feeSats + lifiFeeSats;
		const gasCostWei = lifiRoute.estimate?.gasCosts?.[0]?.amount;

		return {
			provider: 'boltz+lifi',
			fromAsset: 'BTC',
			toAsset: 'WBTC',
			fromChain: 'bitcoin',
			toChain: 'arbitrum',
			estimatedOutput: String(lifiOutputSats / 100_000_000),
			totalFeeSats: totalFee,
			estimatedTimeMinutes: 10 + LIFI_TIME_MIN,
			gasCostWei,
			feeCosts: lifiRoute.estimate?.feeCosts?.map((fc) => ({ name: fc.name, amount: fc.amount })),
			routeMetadata: {
				boltzFee: feeSats,
				lifiFee: lifiFeeSats,
				tbtcOutputSats,
				wbtcOutputSats: lifiOutputSats
			}
		};
	}

	/**
	 * Generic Symbiosis cross-chain quote builder.
	 * Fetches a live quote from Symbiosis API and converts to SmartRoute.
	 * Works for any EVM↔EVM pair (RSK, Arbitrum, BSC, etc.) including same-chain.
	 */
	private async buildSymbiosisRoute(
		amountSats: number,
		fromAsset: string,
		fromChain: string,
		fromChainId: number,
		fromTokenAddr: string,
		fromDecimals: number,
		toAsset: string,
		toChain: string,
		toChainId: number,
		toTokenAddr: string,
		toDecimals: number
	): Promise<SmartRoute | null> {
		// Convert sats to input token's smallest unit
		let fromAmount: string;
		if (fromDecimals === 18) {
			// RBTC: sats → wei (×1e10)
			fromAmount = (BigInt(amountSats) * BigInt(1e10)).toString();
		} else if (fromDecimals === 8) {
			// WBTC: sats already = smallest unit
			fromAmount = String(amountSats);
		} else {
			// USDT0 (6 dec): sats → USDT units (sats/1e8 * 1e6 = sats/100)
			fromAmount = String(Math.round((amountSats / 100_000_000) * Math.pow(10, fromDecimals)));
		}

		const { data: quote, error } = await tryCatch(
			symbiosisService.getQuote({
				tokenAmountIn: {
					address: fromTokenAddr,
					chainId: fromChainId,
					symbol: fromAsset,
					decimals: fromDecimals,
					amount: fromAmount
				},
				tokenOut: {
					address: toTokenAddr,
					chainId: toChainId,
					symbol: toAsset,
					decimals: toDecimals
				},
				from: LIFI_QUOTE_FALLBACK_ADDRESS,
				to: LIFI_QUOTE_FALLBACK_ADDRESS
			})
		);

		if (error || !quote) {
			if (error) debug.warn('Symbiosis %s→%s failed: %s', fromAsset, toAsset, error.message);
			return null;
		}

		// Parse output amount
		const rawOutput = quote.tokenAmountOut?.amount ?? '0';
		let outputHuman: string;
		let outputSats: number;
		if (toDecimals === 18) {
			// Output in wei → convert to BTC (÷1e10 for sats-equivalent)
			outputSats = Math.round(Number(rawOutput) / 1e10);
			outputHuman = (outputSats / 100_000_000).toFixed(6);
		} else if (toDecimals === 8) {
			// WBTC: output in smallest unit = sats
			outputSats = Number(rawOutput);
			outputHuman = (outputSats / 100_000_000).toFixed(6);
		} else {
			// USDT0 (6 dec): output in micro-USDT
			const usdtAmount = Number(rawOutput) / Math.pow(10, toDecimals);
			outputSats = 0; // Can't convert to sats without price
			outputHuman = usdtAmount.toFixed(2);
		}

		// Fee estimate: input sats - output sats (approximate)
		const feeSats = Math.max(0, amountSats - outputSats);

		// Gas cost from tx data (if available)
		const gasLimit = (quote.tx as Record<string, unknown> | undefined)?.gasLimit;

		return {
			provider: 'symbiosis',
			fromAsset,
			toAsset,
			estimatedOutput: outputHuman,
			totalFeeSats: feeSats,
			estimatedTimeMinutes: quote.estimatedTime ? Math.round(quote.estimatedTime / 60) : 3,
			routeMetadata: {
				symbiosisFee: quote.fee,
				outputSats,
				gasLimit,
				fromChain,
				toChain
			}
		};
	}

	private async buildDirectRoute(
		_fromAsset: string,
		_toAsset: string,
		amountSats: number
	): Promise<SmartRoute | null> {
		return {
			provider: 'direct',
			fromAsset: _fromAsset,
			toAsset: _toAsset,
			estimatedOutput: String(amountSats / 100_000_000),
			totalFeeSats: 0,
			estimatedTimeMinutes: 0
		};
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function boltzQuoteToRoute(quote: BoltzQuote, amountSats: number): SmartRoute {
	const outputSats = Math.max(0, amountSats - quote.totalFeeSats);
	return {
		provider: 'boltz',
		fromAsset: quote.fromAsset,
		toAsset: quote.toAsset,
		// Don't set fromChain/toChain here — boltzQuoteToRoute doesn't know the target chain.
		// The SmartRouter callers set them based on the pair context.
		estimatedOutput: String(outputSats / 100_000_000),
		totalFeeSats: quote.totalFeeSats,
		estimatedTimeMinutes: BOLTZ_TIME_MIN,
		routeMetadata: {
			rate: quote.rate,
			protocolFeePercent: quote.protocolFeePercent,
			minerFeeSats: quote.minerFeeSats,
			limits: quote.limits,
			outputSats
		}
	};
}

function lifiQuoteToSmartRoute(
	route: {
		estimate?: {
			toAmount?: string;
			gasCosts?: Array<{ amount: string }>;
			feeCosts?: Array<{ name: string; amount: string }>;
		};
		id?: string;
	},
	fromAsset: string,
	toAsset: string,
	divisor: number
): SmartRoute {
	const rawOutput = route.estimate?.toAmount ?? '0';
	const humanOutput = (Number(rawOutput) / divisor).toFixed(6);

	let totalFeeSats = 0;
	const gasCostWei = route.estimate?.gasCosts?.[0]?.amount;
	if (gasCostWei) {
		try {
			totalFeeSats += Number(BigInt(gasCostWei) / SAT_TO_WEI);
		} catch {
			debug.warn('Could not parse LI.FI gas cost: %s', gasCostWei);
		}
	}

	return {
		provider: 'lifi',
		fromAsset,
		toAsset,
		estimatedOutput: humanOutput,
		totalFeeSats,
		estimatedTimeMinutes: LIFI_TIME_MIN,
		gasCostWei,
		feeCosts: route.estimate?.feeCosts?.map((fc) => ({ name: fc.name, amount: fc.amount })),
		routeMetadata: { providerRouteId: route.id }
	};
}

/** Fetch submarine swap fee (TBTC → Lightning) from Boltz API. Returns sats. */
async function fetchSubmarineFee(amountSats: number): Promise<number> {
	const resp = await fetch(
		(import.meta.env.VITE_BOLTZ_API_URL || 'https://api.boltz.exchange/v2') + '/swap/submarine'
	);
	if (!resp.ok) return 50; // fallback
	const data = (await resp.json()) as Record<
		string,
		Record<string, { fees: { percentage: number; minerFees: number } }>
	>;
	const pair = data['TBTC']?.['BTC'];
	if (!pair) return 50;
	const percentageFeeSats = Math.round((pair.fees.percentage / 100) * amountSats);
	return percentageFeeSats + pair.fees.minerFees + 50;
}

/** Fetch reverse swap fee (Lightning → RBTC) from Boltz API. Returns sats. */
async function fetchReverseFee(): Promise<number> {
	const resp = await fetch(
		(import.meta.env.VITE_BOLTZ_API_URL || 'https://api.boltz.exchange/v2') + '/swap/reverse'
	);
	if (!resp.ok) return 200; // fallback
	const data = (await resp.json()) as Record<
		string,
		Record<string, { fees: { percentage: number; minerFees: { claim: number; lockup: number } } }>
	>;
	const pair = data['BTC']?.['RBTC'];
	if (!pair) return 200;
	return pair.fees.minerFees.claim + pair.fees.minerFees.lockup;
}
