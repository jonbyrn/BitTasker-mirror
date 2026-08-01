import { ethers, Interface } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';
import * as Sentry from '@sentry/sveltekit';
import type { EVMSigner, EVMTransactionResult } from '$lib/services/external-wallet/types';
import {
	AAVE_POOL,
	AAVE_POOL_DATA_PROVIDER,
	WBTC_ARBITRUM,
	USDT0_ARBITRUM,
	POOL_ABI,
	DATA_PROVIDER_ABI,
	GAS_BUFFER_PERCENT,
	GAS_BUFFER_DIVISOR
} from '$lib/config/defi.constants';

// Re-export for backward compatibility (consumers import from aave.service)
export { WBTC_ARBITRUM, USDT0_ARBITRUM };

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

/** Reserve configuration from the Data Provider. All ratio fields are in
 *  basis points (e.g. 7000 = 70 %). */
export interface ReserveConfig {
	decimals: number;
	ltv: number; // basis points
	liquidationThreshold: number; // basis points
	isActive: boolean;
	isFrozen: boolean;
	borrowingEnabled: boolean;
}

/** User account position snapshot returned by `getUserAccountData`. */
export interface UserAccountData {
	totalCollateralUsd: number; // USD, 8 src decimals → human-readable
	totalDebtUsd: number;
	availableBorrowsUsd: number;
	ltv: number; // basis points
	liquidationThreshold: number; // basis points
	healthFactor: number; // 18 src decimals → human-readable
}

/** Live reserve data returned by `getReserveData`.
 *  Rate fields are in RAY (27 decimals) — use the helper methods for
 *  percentage values. */
export interface ReserveData {
	availableLiquidity: bigint;
	totalStableDebt: bigint;
	totalVariableDebt: bigint;
	liquidityRate: bigint; // supply APY, ray
	variableBorrowRate: bigint; // borrow APR, ray
	liquidityIndex: bigint;
	variableBorrowIndex: bigint;
}

// ---------------------------------------------------------------------------
// Ray / Basis-Point Helpers
// ---------------------------------------------------------------------------

const RAY_TO_PERCENT = 1e25; // RAY / 100

/** Convert a rate in RAY (27 decimals) to a percentage (e.g. 3.30 for 3.30 %). */
function rayToPercent(ray: bigint): number {
	return Number(ray) / RAY_TO_PERCENT;
}

/** Convert an 8-decimals USD value to a human-readable number. */
function usd8ToNumber(value: bigint): number {
	return Number(value) / 1e8;
}

/** Convert an 18-decimals value to a human-readable number. */
function wadToNumber(value: bigint): number {
	return Number(value) / 1e18;
}

/** Signer union for full tx support: ethers.Signer for built-in wallet paths,
 * EVMSigner for connected external wallets (Arbitrum etc). Abstraction lives
 * here + caller (WalletSelector + getEvmSigner patterns). */
export type DeFiSigner = ethers.Signer | EVMSigner;

// ---------------------------------------------------------------------------
// AaveService
// ---------------------------------------------------------------------------

export class AaveService {
	private provider: ethers.Provider;

	constructor(provider: ethers.Provider) {
		this.provider = provider;
	}

	private getPool(): ethers.Contract {
		return new ethers.Contract(AAVE_POOL, POOL_ABI, this.provider);
	}

	private getDataProvider(): ethers.Contract {
		return new ethers.Contract(AAVE_POOL_DATA_PROVIDER, DATA_PROVIDER_ABI, this.provider);
	}

	// -- Read Helpers -----------------------------------------------------

	/** Get reserve configuration (LTV, liquidation threshold, frozen status). */
	async getReserveConfig(asset: string): Promise<ReserveConfig> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'getReserveConfig',
			data: { asset }
		});

		const dp = this.getDataProvider();
		const { data, error } = await tryCatch(dp.getReserveConfigurationData(asset));

		if (error || !data) {
			throw new Error(`Failed to get reserve config: ${error?.message}`);
		}

		return {
			decimals: Number(data.decimals),
			ltv: Number(data.ltv),
			liquidationThreshold: Number(data.liquidationThreshold),
			isActive: data.isActive,
			isFrozen: data.isFrozen,
			borrowingEnabled: data.borrowingEnabled
		};
	}

	/** Get live reserve data (rates, liquidity). */
	async getReserveData(asset: string): Promise<ReserveData> {
		const pool = this.getPool();
		const { data, error } = await tryCatch(pool.getReserveData(asset));

		if (error || !data) {
			throw new Error(`Failed to get reserve data: ${error?.message}`);
		}

		return {
			// These fields are not directly returned by getReserveData on
			// Aave V3 — a separate liquidity call would be needed for live
			// supply/debt totals. Returning zero so callers can still use
			// the rate fields without breaking.
			availableLiquidity: 0n,
			totalStableDebt: 0n,
			totalVariableDebt: 0n,
			liquidityRate: data.currentLiquidityRate,
			variableBorrowRate: data.currentVariableBorrowRate,
			liquidityIndex: data.liquidityIndex,
			variableBorrowIndex: data.variableBorrowIndex
		};
	}

	/** Get current variable borrow APR as a percentage (e.g. 3.30 for 3.30 %). */
	async getVariableBorrowAPR(asset: string): Promise<number> {
		const data = await this.getReserveData(asset);
		return rayToPercent(data.variableBorrowRate);
	}

	/** Get current supply APY as a percentage. */
	async getSupplyAPY(asset: string): Promise<number> {
		const data = await this.getReserveData(asset);
		return rayToPercent(data.liquidityRate);
	}

	/** Get user's account data (health factor, collateral, debt). */
	async getUserAccountData(address: string): Promise<UserAccountData> {
		const pool = this.getPool();
		const { data, error } = await tryCatch(pool.getUserAccountData(address));

		if (error || !data) {
			throw new Error(`Failed to get user data: ${error?.message}`);
		}

		return {
			totalCollateralUsd: usd8ToNumber(data.totalCollateralBase),
			totalDebtUsd: usd8ToNumber(data.totalDebtBase),
			availableBorrowsUsd: usd8ToNumber(data.availableBorrowsBase),
			ltv: Number(data.ltv),
			liquidationThreshold: Number(data.currentLiquidationThreshold),
			healthFactor: wadToNumber(data.healthFactor)
		};
	}

	// -- Gas Helpers (for full tx support + connected wallets) -------------

	/**
	 * Estimate gas for a call with 20% buffer. Falls back to default on error
	 * (common for complex DeFi tx where eth_estimateGas reverts pre-approval).
	 * Used by both builtin signer path and EVMSigner tx prep.
	 */
	async estimateGasForCall(
		to: string,
		data: string,
		value: bigint = 0n,
		defaultGas = 300_000n
	): Promise<bigint> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'estimateGasForCall',
			data: { to }
		});

		const { data: gas, error } = await tryCatch(this.provider.estimateGas({ to, data, value }));

		if (error || gas == null) {
			Sentry.addBreadcrumb({
				category: 'defi.aave',
				message: 'estimateGasForCall fallback',
				data: { error: error?.message || 'no gas' }
			});
			return defaultGas;
		}
		return (gas * GAS_BUFFER_PERCENT) / GAS_BUFFER_DIVISOR;
	}

	// -- Write Operations (require a Signer) -------------------------------

	/** Supply tokens to Aave. Requires prior ERC-20 approval.
	 *  signer: DeFiSigner supports ethers.Signer (builtin) and EVMSigner (connected wallets)
	 *  for full tx abstraction. Current impl for ethers; EVMSigner path via *WithEvmSigner overloads. */
	async supply(
		asset: string,
		amount: bigint,
		signer: DeFiSigner
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'supply',
			data: { asset, amount: amount.toString() }
		});

		const ethersSigner = signer as ethers.Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, ethersSigner);
				const addr = await ethersSigner.getAddress();
				return pool.supply(asset, amount, addr, 0);
			})()
		);
		if (error || !tx) {
			const msg = `Aave supply failed for ${asset}: ${error?.message}`;
			Sentry.addBreadcrumb({
				category: 'defi.aave',
				message: 'supply error',
				data: { asset, error: error?.message }
			});
			throw new Error(msg);
		}
		return tx;
	}

	/** Borrow tokens from Aave. Requires prior collateral supply.
	 *  signer: DeFiSigner supports ethers.Signer (builtin) and EVMSigner (connected wallets)
	 *  for full tx abstraction. Current impl for ethers; EVMSigner path via *WithEvmSigner overloads. */
	async borrow(
		asset: string,
		amount: bigint,
		signer: DeFiSigner
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'borrow',
			data: { asset, amount: amount.toString() }
		});

		const ethersSigner = signer as ethers.Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, ethersSigner);
				const addr = await ethersSigner.getAddress();
				// interestRateMode = 2 → VARIABLE (stable rate is deprecated on Arbitrum V3)
				return pool.borrow(asset, amount, 2, 0, addr);
			})()
		);
		if (error || !tx) {
			const msg = `Aave borrow failed for ${asset}: ${error?.message}`;
			Sentry.addBreadcrumb({
				category: 'defi.aave',
				message: 'borrow error',
				data: { asset, error: error?.message }
			});
			throw new Error(msg);
		}
		return tx;
	}

	/** Repay borrowed tokens to Aave. */
	async repay(
		asset: string,
		amount: bigint,
		signer: DeFiSigner
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'repay',
			data: { asset, amount: amount.toString() }
		});

		const ethersSigner = signer as ethers.Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, ethersSigner);
				const addr = await ethersSigner.getAddress();
				return pool.repay(asset, amount, 2, addr);
			})()
		);
		if (error || !tx) {
			const msg = `Aave repay failed for ${asset}: ${error?.message}`;
			Sentry.addBreadcrumb({
				category: 'defi.aave',
				message: 'repay error',
				data: { asset, error: error?.message }
			});
			throw new Error(msg);
		}
		return tx;
	}

	/** Withdraw supplied tokens from Aave. */
	async withdraw(
		asset: string,
		amount: bigint,
		signer: DeFiSigner
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'withdraw',
			data: { asset, amount: amount.toString() }
		});

		const ethersSigner = signer as ethers.Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, ethersSigner);
				const addr = await ethersSigner.getAddress();
				return pool.withdraw(asset, amount, addr);
			})()
		);
		if (error || !tx) {
			const msg = `Aave withdraw failed for ${asset}: ${error?.message}`;
			Sentry.addBreadcrumb({
				category: 'defi.aave',
				message: 'withdraw error',
				data: { asset, error: error?.message }
			});
			throw new Error(msg);
		}
		return tx;
	}

	// -- Connected Wallet (EVMSigner) Tx Paths for Full Support -----------
	// These provide signer abstraction for connected wallets (via getEvmSigner).
	// Use after ERC20 approval where needed. Caller responsible for chain (Arbitrum 42161).

	/** Supply via connected EVMSigner (returns EVM result with hash). */
	async supplyWithEvmSigner(
		asset: string,
		amount: bigint,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'supplyWithEvmSigner',
			data: { asset, amount: amount.toString() }
		});

		const poolIface = new Interface(POOL_ABI);
		const addr = evmSigner.getAddress();
		const data = poolIface.encodeFunctionData('supply', [asset, amount, addr, 0]);

		const gasLimit = await this.estimateGasForCall(AAVE_POOL, data, 0n, 250_000n);

		const txReq = {
			to: AAVE_POOL,
			data,
			value: 0n,
			chainId: 42161
		} as import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		};

		txReq.gasLimit = gasLimit;

		return evmSigner.sendTransaction(txReq);
	}

	/** Borrow via connected EVMSigner. */
	async borrowWithEvmSigner(
		asset: string,
		amount: bigint,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'borrowWithEvmSigner',
			data: { asset, amount: amount.toString() }
		});

		const poolIface = new Interface(POOL_ABI);
		const addr = evmSigner.getAddress();
		const data = poolIface.encodeFunctionData('borrow', [asset, amount, 2, 0, addr]);

		const gasLimit = await this.estimateGasForCall(AAVE_POOL, data, 0n, 300_000n);

		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = {
			to: AAVE_POOL,
			data,
			value: 0n,
			chainId: 42161,
			gasLimit
		};

		return evmSigner.sendTransaction(txReq);
	}

	/** Repay via connected EVMSigner. */
	async repayWithEvmSigner(
		asset: string,
		amount: bigint,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'repayWithEvmSigner',
			data: { asset, amount: amount.toString() }
		});

		const poolIface = new Interface(POOL_ABI);
		const addr = evmSigner.getAddress();
		const data = poolIface.encodeFunctionData('repay', [asset, amount, 2, addr]);

		const gasLimit = await this.estimateGasForCall(AAVE_POOL, data, 0n, 250_000n);

		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = {
			to: AAVE_POOL,
			data,
			value: 0n,
			chainId: 42161,
			gasLimit
		};

		return evmSigner.sendTransaction(txReq);
	}

	/** Withdraw via connected EVMSigner. */
	async withdrawWithEvmSigner(
		asset: string,
		amount: bigint,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'withdrawWithEvmSigner',
			data: { asset, amount: amount.toString() }
		});

		const poolIface = new Interface(POOL_ABI);
		const addr = evmSigner.getAddress();
		const data = poolIface.encodeFunctionData('withdraw', [asset, amount, addr]);

		const gasLimit = await this.estimateGasForCall(AAVE_POOL, data, 0n, 200_000n);

		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = {
			to: AAVE_POOL,
			data,
			value: 0n,
			chainId: 42161,
			gasLimit
		};

		return evmSigner.sendTransaction(txReq);
	}
}

// ---------------------------------------------------------------------------
// Pure DeFi Math Utilities
// ---------------------------------------------------------------------------

import type { MaxSafeWithdrawResult, LiquidationPriceResult } from '$lib/types/defi';

export function calculateMaxSafeWithdraw(
	currentCollateralUsd: number,
	currentDebtUsd: number,
	liquidationThresholdBps: number,
	currentHealthFactor: number,
	collateralPriceUsd: number,
	collateralDecimals: number = 8,
	bufferMultiplier: number = 1.05
): MaxSafeWithdrawResult {
	if (
		!isFinite(currentCollateralUsd) ||
		!isFinite(currentDebtUsd) ||
		!isFinite(liquidationThresholdBps) ||
		!isFinite(currentHealthFactor) ||
		!isFinite(collateralPriceUsd) ||
		!isFinite(bufferMultiplier) ||
		!isFinite(collateralDecimals)
	) {
		return {
			maxSafeCollateralUsd: 0,
			maxSafeCollateralAssetAmount: 0n,
			postWithdrawHealthFactor: 0,
			currentHealthFactor: 0,
			buffer: bufferMultiplier,
			isAtRisk: false
		};
	}

	if (currentDebtUsd <= 0) {
		const maxAmount =
			collateralPriceUsd > 0
				? BigInt(Math.floor((currentCollateralUsd / collateralPriceUsd) * 10 ** collateralDecimals))
				: 0n;
		return {
			maxSafeCollateralUsd: Math.max(0, currentCollateralUsd),
			maxSafeCollateralAssetAmount: maxAmount,
			postWithdrawHealthFactor: 999,
			currentHealthFactor,
			buffer: bufferMultiplier,
			isAtRisk: false
		};
	}

	const liqThreshold = liquidationThresholdBps / 10000;
	if (liqThreshold <= 0) {
		return {
			maxSafeCollateralUsd: 0,
			maxSafeCollateralAssetAmount: 0n,
			postWithdrawHealthFactor: 0,
			currentHealthFactor,
			buffer: bufferMultiplier,
			isAtRisk: true
		};
	}

	const maxSafeCollateralUsd = Math.max(
		0,
		currentCollateralUsd - (currentDebtUsd * bufferMultiplier) / liqThreshold
	);

	const maxSafeCollateralAssetAmount =
		collateralPriceUsd > 0
			? BigInt(Math.floor((maxSafeCollateralUsd / collateralPriceUsd) * 10 ** collateralDecimals))
			: 0n;

	const remainingCollateral = currentCollateralUsd - maxSafeCollateralUsd;
	const postWithdrawHf =
		currentDebtUsd > 0 ? (remainingCollateral * liqThreshold) / currentDebtUsd : 999;

	return {
		maxSafeCollateralUsd,
		maxSafeCollateralAssetAmount,
		postWithdrawHealthFactor: postWithdrawHf,
		currentHealthFactor,
		buffer: bufferMultiplier,
		isAtRisk: currentHealthFactor < 1.5
	};
}

export function calculateBtcLiquidationPrice(
	debtUsd: number,
	collateralBtcAmount: number,
	liquidationThresholdBps: number,
	currentBtcPrice: number
): LiquidationPriceResult {
	if (
		!isFinite(debtUsd) ||
		!isFinite(collateralBtcAmount) ||
		!isFinite(liquidationThresholdBps) ||
		!isFinite(currentBtcPrice)
	) {
		return { liquidationBtcPrice: 0, currentBtcPrice: 0, distancePercent: 0 };
	}

	if (debtUsd <= 0 || collateralBtcAmount <= 0 || currentBtcPrice <= 0) {
		return { liquidationBtcPrice: 0, currentBtcPrice, distancePercent: 100 };
	}

	const liqThreshold = liquidationThresholdBps / 10000;
	if (liqThreshold <= 0) {
		return { liquidationBtcPrice: 0, currentBtcPrice, distancePercent: 0 };
	}

	const liquidationBtcPrice = debtUsd / (collateralBtcAmount * liqThreshold);
	const distancePercent =
		currentBtcPrice > 0 ? ((currentBtcPrice - liquidationBtcPrice) / currentBtcPrice) * 100 : 0;

	return {
		liquidationBtcPrice,
		currentBtcPrice,
		distancePercent: Math.max(-100, distancePercent)
	};
}

export function calculateProjectedHealthFactor(
	currentCollateralUsd: number,
	currentDebtUsd: number,
	liquidationThresholdBps: number,
	actionDeltaCollateralUsd: number = 0,
	actionDeltaDebtUsd: number = 0
): number {
	if (
		!isFinite(currentCollateralUsd) ||
		!isFinite(currentDebtUsd) ||
		!isFinite(liquidationThresholdBps) ||
		!isFinite(actionDeltaCollateralUsd) ||
		!isFinite(actionDeltaDebtUsd)
	) {
		return 0;
	}

	const newCollateral = Math.max(0, currentCollateralUsd + actionDeltaCollateralUsd);
	const newDebt = Math.max(0, currentDebtUsd + actionDeltaDebtUsd);

	if (newDebt <= 0) return 999;

	const liqThreshold = liquidationThresholdBps / 10000;
	if (liqThreshold <= 0) return 0;

	const hf = (newCollateral * liqThreshold) / newDebt;
	return isFinite(hf) ? Math.max(0, hf) : 0;
}

export function calculateLtv(debtUsd: number, collateralUsd: number): number {
	if (!isFinite(debtUsd) || !isFinite(collateralUsd) || collateralUsd <= 0 || debtUsd < 0) {
		return 0;
	}

	return (debtUsd / collateralUsd) * 10000;
}

export function deriveHealthStatus(healthFactor: number): 'safe' | 'monitor' | 'risk' {
	if (Number.isNaN(healthFactor) || healthFactor < 0) return 'risk';
	if (healthFactor >= 2) return 'safe';
	if (healthFactor >= 1.5) return 'monitor';
	return 'risk';
}
