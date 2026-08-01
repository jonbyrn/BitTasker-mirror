import { SvelteMap } from 'svelte/reactivity';
/**
 * DeFi Positions Store (Svelte 5 runes)
 *
 * Single source of truth for on-chain DeFi positions:
 * - Aave lending positions (supplied USDT0 on Arbitrum, accrued value proxy, health factor)
 * - Uniswap V3 LP positions (liquidity, uncollected fees, IL estimate)
 *
 * Supports both built-in wallet (via walletStore arb/rsk address) and connected external wallets
 * (via connectedWalletsStore + WalletSelector id patterns from BorrowStep).
 *
 * Design:
 * - Rune-based (class with $state exported as singleton, like btcPrice rune)
 * - All network reads use tryCatch + Sentry.addBreadcrumb (defi.positions.*)
 * - Defensive: isFinite guards, null checks, offline guards via network-status + navigator, feature flag gates
 * - No `any`; strict typed interfaces only
 * - Public RPC for reads (no signer needed for position queries); matches EarnLendStep/BorrowStep patterns
 * - Cache via lastUpdated + simple staleness skip in refresh
 * - Keyed by walletId ('builtin' | connected wallet id) for multi-wallet support
 * - <500 LOC; co-located interfaces (per CLAUDE typed public APIs)
 *
 * Consumers: EarnLendStep (Aave via WalletSelector + refresh on select/tx), EarnLPStep (Uniswap LP full derive via getUniswapPositionsForWallet + refresh after provide/remove/collect), EarnFlowDrawer, DefiPositionCard, etc.
 *
 * References (full reads completed):
 * - wallet.store.ts (builtin arb balances/address, get( ))
 * - aave.service.ts (AaveService, getUserAccountData, getReserveData, USDT0_ARBITRUM, tryCatch/Sentry patterns)
 * - uniswap.service.ts (UniswapService, PositionInfo, getWbtcUsdt0Pool/getPoolInfo/getPosition, FEE_TIER)
 * - kill-switch.ts (FeatureFlagService, LOAN_FLOW / CONNECTED_WALLETS)
 * - network-status.ts (browserNetworkStatus)
 * - connected-wallets.store.ts (wallets, getEvmSigner facade)
 * - components/wallet/defi/BorrowStep.svelte + WalletSelector (walletId='builtin' | connectedId patterns)
 * - utils/tryCatch.ts
 * - runes/*.svelte.ts (class + $state export pattern)
 * - docs/earn-drawer-audit-report.md + loan-lifecycle-implementation-plan.md (store spec)
 */

import { get } from 'svelte/store';
import { ethers } from 'ethers';
import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { walletStore } from '$lib/stores/wallet.store';
import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
import { browserNetworkStatus } from '$lib/utils/network-status';
import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
import { ARB_PUBLIC_RPC, AAVE_POOL } from '$lib/config/defi.constants';
import {
	UniswapService
	// FEE_TIER unused
	// UniswapServiceType unused
} from '$lib/services/defi/uniswap.service';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('defiPositions');
const STALE_MS = 30_000; // 30s cache before refetch on explicit refresh

// ---------------------------------------------------------------------------
// Typed Interfaces (public API, co-located, no any, defensive shapes)
// ---------------------------------------------------------------------------

/** Aave V3 lending/supply position focused on USDT0 (Earn flow). Health applies if any debt exists on the address. */
export interface AaveLendingPosition {
	readonly walletId: 'builtin' | string;
	readonly address: string;
	/** Current aUSDT0 balance (principal + accrued interest) in human units. */
	suppliedUsdt0: string; // formatted, e.g. '1234.56'
	suppliedUsdt0Raw: bigint;
	/** Approx accrued interest in USD (0 if cannot compute precisely without principal history). */
	accruedUsd: number;
	/** From Aave getUserAccountData (wad → number). >1.0 safe; 1.0 = liquidation. */
	healthFactor: number;
	/** Aggregate collateral USD (may include other supplied assets). */
	totalCollateralUsd: number;
	/** Aggregate debt USD (0 for pure lend positions). */
	totalDebtUsd: number;
	/** Available borrows in USD (from getUserAccountData). */
	availableBorrowsUsd: number;
	/** LTV in basis points (from getUserAccountData). */
	ltv: number;
	/** Liquidation threshold in basis points (from getUserAccountData). */
	liquidationThreshold: number;
	/** BTC price at which this position would be liquidated (HF=1.0). Undefined if no debt. */
	liquidationPriceBtc?: number;
	/** Current BTC price used for liquidation calculation. */
	currentBtcPrice?: number;
	lastUpdated: Date;
	error?: string | null;
}

/** Uniswap V3 LP position on known WBTC/USDT0 0.05% pool (or future pairs). IL estimate is approximate vs 1.0 entry ratio. */
export interface UniswapLPPosition {
	readonly walletId: 'builtin' | string;
	readonly address: string;
	readonly tokenId: bigint;
	readonly poolAddress: string;
	liquidity: bigint;
	/** Uncollected fees (tokensOwed from positions()). */
	fees0: bigint; // token0 (usually WBTC)
	fees1: bigint; // token1 (USDT0)
	/** Current tick from pool slot0. */
	currentTick: number;
	/** Estimated IL % vs entry price ratio=1.0 (full-range 50/50 approx). Negative = loss vs HODL. */
	ilEstimatePercent: number;
	lastUpdated: Date;
	error?: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (defensive, testable; no side effects)
// ---------------------------------------------------------------------------

function isFiniteNum(n: unknown): n is number {
	return typeof n === 'number' && isFinite(n);
}

function _safeDiv(a: number, b: number, fallback = 0): number {
	return b > 0 && isFiniteNum(a) && isFiniteNum(b) ? a / b : fallback;
}

/**
 * Approximate IL for concentrated or full-range liquidity vs HODL.
 * r = currentPrice / entryPrice (both in token1 per token0).
 * For 50/50 full range: IL ≈ 2√r / (1+r) - 1
 */
export function estimateImpermanentLossPercent(currentPriceRatio: number): number {
	if (!isFiniteNum(currentPriceRatio) || currentPriceRatio <= 0) return 0;
	const r = currentPriceRatio;
	const il = (2 * Math.sqrt(r)) / (1 + r) - 1;
	return il * 100;
}

/** Convert wad (18 dec) or ray etc to number with guard. */
function wadToNum(v: bigint | number | undefined | null): number {
	if (v == null) return 0;
	const n = typeof v === 'bigint' ? Number(v) / 1e18 : Number(v);
	return isFiniteNum(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Store Implementation (rune class singleton — single source of truth)
// ---------------------------------------------------------------------------

class DefiPositionsStore {
	// Reactive state (Svelte 5 runes — tracked on access in consuming components)
	aavePositions = $state<Map<string, AaveLendingPosition>>(new SvelteMap());
	uniswapPositions = $state<Map<string, UniswapLPPosition>>(new SvelteMap());

	// Per-wallet loading / error / freshness (single source)
	loading = $state<Record<string, boolean>>({});
	errors = $state<Record<string, string | null>>({});
	lastUpdated = $state<Record<string, Date>>({});

	private readonly arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);

	constructor() {
		d.log('DefiPositionsStore initialized (runes)');
	}

	// -----------------------------------------------------------------------
	// Internal: wallet helpers (builtin + connected, BorrowStep/WalletSelector pattern)
	// -----------------------------------------------------------------------

	private getBuiltinAddress(): string | null {
		const s = get(walletStore);
		// Arb DeFi uses the EVM-compatible address (builtin wallet key is shared)
		return s.arb?.address || s.rsk?.address || s.bsc?.address || null;
	}

	private getConnectedAddress(walletId: string): string | null {
		const s = get(connectedWalletsStore);
		const w = s.wallets.find((ww) => ww.id === walletId);
		return w?.address ?? null;
	}

	/** Resolve address for a walletId using patterns from BorrowStep + connected store facade.
	 *  Always checksums the result — ethers v6 rejects addresses with invalid EIP-55 checksums. */
	resolveAddress(walletId: 'builtin' | string): string | null {
		let addr: string | null;
		if (walletId === 'builtin') addr = this.getBuiltinAddress();
		else addr = this.getConnectedAddress(walletId);
		if (!addr) return null;
		try {
			return ethers.getAddress(addr.toLowerCase());
		} catch {
			return addr;
		}
	}

	/** Whether we should allow DeFi ops (loan/earn + connected wallets). */
	private isDeFiEnabled(): boolean {
		return (
			FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW) ||
			FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)
		);
	}

	private isOnline(): boolean {
		const net = get(browserNetworkStatus);
		if (!net.online) return false;
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
		return true;
	}

	private setLoading(walletId: string, val: boolean): void {
		this.loading = { ...this.loading, [walletId]: val };
	}

	private setError(walletId: string, msg: string | null): void {
		this.errors = { ...this.errors, [walletId]: msg };
	}

	private setLast(walletId: string, d: Date): void {
		this.lastUpdated = { ...this.lastUpdated, [walletId]: d };
	}

	// -----------------------------------------------------------------------
	// Aave Lending Positions (USDT0 supply focused)
	// -----------------------------------------------------------------------

	/**
	 * Refresh Aave lending position for a specific wallet (builtin or connected id).
	 * Uses public RPC + AaveService (matches Earn/Borrow read pattern).
	 * Fetches aggregate health + specific USDT0 supplied via aToken balanceOf.
	 */
	async refreshAavePosition(walletId: 'builtin' | string, force = false): Promise<void> {
		if (!this.isDeFiEnabled()) {
			d.log('LOAN_FLOW / CONNECTED disabled — skipping Aave position refresh');
			return;
		}
		if (!this.isOnline()) {
			this.setError(walletId, 'Offline');
			Sentry.addBreadcrumb({
				category: 'defi.positions',
				message: 'refreshAave skipped (offline)',
				data: { walletId }
			});
			return;
		}

		const address = this.resolveAddress(walletId);
		if (!address) {
			this.setError(walletId, 'No address');
			return;
		}

		// Staleness guard (explicit refresh still honors short cache unless forced)
		const last = this.lastUpdated[walletId];
		if (
			!force &&
			last &&
			Date.now() - last.getTime() < STALE_MS &&
			this.aavePositions.has(walletId)
		) {
			d.log('Aave position fresh, skipping', { walletId });
			return;
		}

		this.setLoading(walletId, true);
		this.setError(walletId, null);

		Sentry.addBreadcrumb({
			category: 'defi.positions',
			message: 'refreshAavePosition start',
			data: { walletId, address: address.slice(0, 6) + '...' }
		});

		const aave = new AaveService(this.arbProvider);

		const [{ data: userData, error: userErr }, { data: reserve, error: resErr }] =
			await Promise.all([
				tryCatch(aave.getUserAccountData(address)),
				// Direct minimal call for aTokenAddress (service getReserveData does not expose it publicly)
				tryCatch(
					new ethers.Contract(
						AAVE_POOL,
						[
							'function getReserveData(address asset) external view returns (tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)'
						],
						this.arbProvider
					).getReserveData(USDT0_ARBITRUM)
				)
			]);

		if (userErr || !userData) {
			const msg = userErr?.message || 'Failed to load Aave user data';
			this.setError(walletId, msg);
			Sentry.addBreadcrumb({
				category: 'defi.positions',
				message: 'refreshAave error',
				level: 'warning',
				data: { walletId, error: msg }
			});
			this.setLoading(walletId, false);
			return;
		}

		// Extract aToken and query balance for precise supplied USDT0 (principal + accrued)
		let suppliedUsdt0 = '0';
		let suppliedRaw = 0n;
		let accruedUsd = 0;

		if (!resErr && reserve) {
			const aTokenAddr: string = reserve.aTokenAddress ?? reserve[8];
			if (aTokenAddr && aTokenAddr !== ethers.ZeroAddress) {
				const aToken = new ethers.Contract(
					aTokenAddr,
					[
						'function balanceOf(address) view returns (uint256)',
						'function decimals() view returns (uint8)'
					],
					this.arbProvider
				);
				const [{ data: bal }, { data: decs }] = await Promise.all([
					tryCatch(aToken.balanceOf(address)),
					tryCatch(aToken.decimals())
				]);
				if (bal) {
					suppliedRaw = bal as bigint;
					const decimals = (decs as number) ?? 6;
					suppliedUsdt0 = ethers.formatUnits(suppliedRaw, decimals);
					// Accrued rough: for pure supply positions, aToken bal already reflects interest.
					// Without principal snapshot we report 0 (future: store entry amount).
					accruedUsd = 0;
				}
			}
		}

		const health = wadToNum(userData.healthFactor);

		let liqPriceBtc: number | undefined;
		let btcPriceVal: number | undefined;
		if (userData.totalDebtUsd > 0 && userData.totalCollateralUsd > 0) {
			try {
				const { btcPrice } = await import('$lib/runes/btcPrice.svelte');
				btcPriceVal = btcPrice.price;
				if (btcPriceVal > 0) {
					const collateralBtc = userData.totalCollateralUsd / btcPriceVal;
					const liqThreshold = (userData.liquidationThreshold ?? 7800) / 10_000;
					if (collateralBtc > 0 && liqThreshold > 0) {
						const raw = userData.totalDebtUsd / (collateralBtc * liqThreshold);
						liqPriceBtc = isFinite(raw) ? raw : undefined;
					}
				}
			} catch {
				btcPriceVal = undefined;
			}
		}

		const pos: AaveLendingPosition = {
			walletId,
			address,
			suppliedUsdt0,
			suppliedUsdt0Raw: suppliedRaw,
			accruedUsd,
			healthFactor: health > 0 ? health : 999,
			totalCollateralUsd: userData.totalCollateralUsd ?? 0,
			totalDebtUsd: userData.totalDebtUsd ?? 0,
			availableBorrowsUsd: userData.availableBorrowsUsd ?? 0,
			ltv: userData.ltv ?? 0,
			liquidationThreshold: userData.liquidationThreshold ?? 0,
			liquidationPriceBtc: liqPriceBtc,
			currentBtcPrice: btcPriceVal,
			lastUpdated: new Date(),
			error: null
		};

		this.aavePositions = new SvelteMap(this.aavePositions).set(walletId, pos);
		this.setLast(walletId, pos.lastUpdated);
		this.setLoading(walletId, false);

		Sentry.addBreadcrumb({
			category: 'defi.positions',
			message: 'refreshAavePosition success',
			data: {
				walletId,
				supplied: suppliedUsdt0,
				hf: pos.healthFactor.toFixed(2),
				collateral: pos.totalCollateralUsd
			}
		});
		d.log('Aave position updated', { walletId, supplied: suppliedUsdt0, hf: pos.healthFactor });
	}

	// -----------------------------------------------------------------------
	// Uniswap LP Positions
	// -----------------------------------------------------------------------

	/**
	 * Load / refresh a specific Uniswap V3 position by its NFT tokenId for a wallet.
	 * IL estimate computed vs entry ratio=1.0 (caller should track entry price for accuracy).
	 * Matches uniswap.service.ts patterns + tryCatch/Sentry.
	 */
	async refreshUniswapPosition(walletId: 'builtin' | string, tokenId: bigint): Promise<void> {
		if (!this.isDeFiEnabled()) return;
		if (!this.isOnline()) {
			this.setError(walletId, 'Offline');
			return;
		}

		const address = this.resolveAddress(walletId);
		if (!address) {
			this.setError(walletId, 'No address');
			return;
		}

		const key = `${walletId}:${tokenId.toString()}`;
		const last = this.lastUpdated[key];
		if (last && Date.now() - last.getTime() < STALE_MS) return;

		this.setLoading(key, true);
		this.setError(key, null);

		Sentry.addBreadcrumb({
			category: 'defi.positions',
			message: 'refreshUniswapPosition start',
			data: { walletId, tokenId: tokenId.toString() }
		});

		const uni = new UniswapService(this.arbProvider);

		const { data: pos, error: posErr } = await tryCatch(uni.getPosition(tokenId));
		if (posErr || !pos) {
			const msg = posErr?.message || 'Position not found';
			this.setError(key, msg);
			this.setLoading(key, false);
			return;
		}

		// Current price ratio from pool (for IL)
		let il = 0;
		const poolInfo = await tryCatch(uni.getWbtcUsdt0Pool());
		if (poolInfo.data) {
			// sqrtPriceX96 → price (token1 / token0). For WBTC(8)/USDT0(6) rough ratio.
			const sqrt = Number(poolInfo.data.sqrtPriceX96) / 2 ** 96;
			const priceRatio = sqrt * sqrt; // approx
			il = estimateImpermanentLossPercent(priceRatio);
		}

		const lpPos: UniswapLPPosition = {
			walletId,
			address,
			tokenId,
			poolAddress: poolInfo.data?.address ?? '0x5969efdde3cf5c0d9a88ae51e47d721096a97203',
			liquidity: pos.liquidity,
			fees0: pos.tokensOwed0,
			fees1: pos.tokensOwed1,
			currentTick: 0, // poolInfo would give; omitted for brevity in v1
			ilEstimatePercent: il,
			lastUpdated: new Date(),
			error: null
		};

		this.uniswapPositions = new SvelteMap(this.uniswapPositions).set(key, lpPos);
		this.setLast(key, lpPos.lastUpdated);
		this.setLoading(key, false);

		Sentry.addBreadcrumb({
			category: 'defi.positions',
			message: 'refreshUniswapPosition success',
			data: { walletId, tokenId: tokenId.toString(), liquidity: pos.liquidity.toString(), il }
		});
	}

	// -----------------------------------------------------------------------
	// Public refresh / invalidate (single source of truth updates)
	// -----------------------------------------------------------------------

	/** Refresh Aave for builtin + all currently connected wallets (defensive). */
	async refreshAllAave(): Promise<void> {
		const promises: Promise<void>[] = [];
		promises.push(this.refreshAavePosition('builtin'));

		const connected = get(connectedWalletsStore).wallets;
		for (const w of connected) {
			// Only EVM wallets that could hold Arb positions (heuristic: has balances or any chain)
			if (
				w.chainIds?.some((c) => c === 42161) ||
				Object.keys(w.balances).some((k) => k.includes('arb'))
			) {
				promises.push(this.refreshAavePosition(w.id));
			}
		}
		await Promise.allSettled(promises);
	}

	/** Invalidate cached position(s) for a wallet (forces next refresh). */
	invalidate(walletId?: string): void {
		if (!walletId) {
			this.aavePositions = new SvelteMap();
			this.uniswapPositions = new SvelteMap();
			this.lastUpdated = {};
			return;
		}
		const nextAave = new SvelteMap(this.aavePositions);
		nextAave.delete(walletId);
		this.aavePositions = nextAave;

		// Also clear any LP keys for this wallet
		const nextLp = new SvelteMap<string, UniswapLPPosition>();
		for (const [k, v] of this.uniswapPositions) {
			if (!k.startsWith(walletId + ':')) nextLp.set(k, v);
		}
		this.uniswapPositions = nextLp;

		const nextLast = { ...this.lastUpdated };
		delete nextLast[walletId];
		Object.keys(nextLast).forEach((k) => {
			if (k.startsWith(walletId + ':')) delete nextLast[k];
		});
		this.lastUpdated = nextLast;
	}

	/**
	 * Helper for consumers (e.g. EarnLPStep): returns reactive array of Uniswap LP positions
	 * for a specific walletId (filters the internal keyed map). Supports multi-wallet via WalletSelector.
	 * Used to fully replace local $state stand-ins in LP UI.
	 */
	getUniswapPositionsForWallet(walletId: 'builtin' | string): UniswapLPPosition[] {
		const prefix = `${walletId}:`;
		const res: UniswapLPPosition[] = [];
		for (const [k, v] of this.uniswapPositions) {
			if (k.startsWith(prefix)) res.push(v);
		}
		// Newest tokenIds first (numeric desc on bigint)
		return res.sort((a, b) => (b.tokenId > a.tokenId ? 1 : b.tokenId < a.tokenId ? -1 : 0));
	}
}

export const defiPositions = new DefiPositionsStore();

// Re-export pure helpers for tests / consumers
export { estimateImpermanentLossPercent as calculateIL };
