import { ethers } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';
import * as Sentry from '@sentry/sveltekit';

// ---------------------------------------------------------------------------
// Contract Addresses (Arbitrum One)
// ---------------------------------------------------------------------------

const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
const AAVE_POOL_DATA_PROVIDER = '0x243Aa95cAC2a25651eda86e80bEe66114413c43b';

// Token addresses on Arbitrum
export const WBTC_ARBITRUM = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
export const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

// ---------------------------------------------------------------------------
// ABIs (minimal — only the functions we need)
// ---------------------------------------------------------------------------

const POOL_ABI = [
	'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
	'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external',
	'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)',
	'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
	'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
	'function getReserveData(address asset) external view returns (tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)'
];

const DATA_PROVIDER_ABI = [
	'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)'
];

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

	// -- Write Operations (require a Signer) -------------------------------

	/** Supply tokens to Aave. Requires prior ERC-20 approval. */
	async supply(
		asset: string,
		amount: bigint,
		signer: ethers.Signer
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'supply',
			data: { asset, amount: amount.toString() }
		});

		const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, signer);
		const addr = await signer.getAddress();
		return pool.supply(asset, amount, addr, 0);
	}

	/** Borrow tokens from Aave. Requires prior collateral supply. */
	async borrow(
		asset: string,
		amount: bigint,
		signer: ethers.Signer
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'borrow',
			data: { asset, amount: amount.toString() }
		});

		const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, signer);
		const addr = await signer.getAddress();
		// interestRateMode = 2 → VARIABLE (stable rate is deprecated on Arbitrum V3)
		return pool.borrow(asset, amount, 2, 0, addr);
	}

	/** Repay borrowed tokens to Aave. */
	async repay(
		asset: string,
		amount: bigint,
		signer: ethers.Signer
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'repay',
			data: { asset, amount: amount.toString() }
		});

		const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, signer);
		const addr = await signer.getAddress();
		return pool.repay(asset, amount, 2, addr);
	}

	/** Withdraw supplied tokens from Aave. */
	async withdraw(
		asset: string,
		amount: bigint,
		signer: ethers.Signer
	): Promise<ethers.TransactionResponse> {
		Sentry.addBreadcrumb({
			category: 'defi.aave',
			message: 'withdraw',
			data: { asset, amount: amount.toString() }
		});

		const pool = new ethers.Contract(AAVE_POOL, POOL_ABI, signer);
		const addr = await signer.getAddress();
		return pool.withdraw(asset, amount, addr);
	}
}
