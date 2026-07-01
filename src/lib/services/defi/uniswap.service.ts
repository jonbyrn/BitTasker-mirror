import {
	Contract,
	Interface,
	ZeroAddress,
	type Provider,
	type Signer,
	type TransactionResponse
} from 'ethers';
import { addBreadcrumb } from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import type { EVMSigner, EVMTransactionResult } from '$lib/services/external-wallet/types';

// ---------------------------------------------------------------------------
// Verified Contract Addresses — Arbitrum
// ---------------------------------------------------------------------------

const UNISWAP_NPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const UNISWAP_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

const WBTC_ARBITRUM = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const USDT0_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

const WBTC_USDT0_POOL_005 = '0x5969efdde3cf5c0d9a88ae51e47d721096a97203';

// ---------------------------------------------------------------------------
// ABIs (read-only + write operations)
// ---------------------------------------------------------------------------

const FACTORY_ABI = [
	'function getPool(address token0, address token1, uint24 fee) external view returns (address)'
] as const;

const NPM_ABI = [
	'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
	'function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
	'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
	'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
	'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
] as const;

const POOL_ABI = [
	'function token0() external view returns (address)',
	'function token1() external view returns (address)',
	'function fee() external view returns (uint24)',
	'function liquidity() external view returns (uint128)',
	'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
] as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PoolInfo {
	address: string;
	token0: string;
	token1: string;
	fee: number;
	liquidity: bigint;
	sqrtPriceX96: bigint;
	tick: number;
}

export interface PositionInfo {
	tokenId: bigint;
	token0: string;
	token1: string;
	fee: number;
	tickLower: number;
	tickUpper: number;
	liquidity: bigint;
	tokensOwed0: bigint;
	tokensOwed1: bigint;
}

export interface MintParams {
	token0: string;
	token1: string;
	fee: number;
	tickLower: number;
	tickUpper: number;
	amount0Desired: bigint;
	amount1Desired: bigint;
	amount0Min: bigint;
	amount1Min: bigint;
	recipient: string;
	deadline: number;
}

// ---------------------------------------------------------------------------
// Fee-tier constants
// ---------------------------------------------------------------------------

/** Fee tiers expressed in hundredths of a basis point (1 bp = 0.01%). */
export const FEE_TIER = {
	LOWEST: 100, // 0.01%
	LOW: 500, // 0.05%
	MEDIUM: 3000, // 0.30%
	HIGH: 10000 // 1.00%
} as const;

/** Full-range tick boundaries for Uniswap V3. */
export const FULL_RANGE = {
	TICK_LOWER: -887272,
	TICK_UPPER: 887272
} as const;

/** Default transaction deadline in seconds (20 minutes). */
export function defaultDeadline(): number {
	return Math.floor(Date.now() / 1000) + 1200;
}

/** Signer union for full tx support (parity with aave.service). */
export type DeFiSigner = Signer | EVMSigner;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class UniswapService {
	private provider: Provider;

	constructor(provider: Provider) {
		this.provider = provider;
	}

	// -----------------------------------------------------------------------
	// Read-only helpers
	// -----------------------------------------------------------------------

	/**
	 * Check if a Uniswap V3 pool exists for a token pair at the given
	 * fee tier. Returns the pool address or `null` when no pool has
	 * been created yet.
	 */
	async getPool(token0: string, token1: string, fee: number): Promise<string | null> {
		const factory = new Contract(UNISWAP_FACTORY, FACTORY_ABI, this.provider);
		const { data, error } = await tryCatch(factory.getPool(token0, token1, fee));

		if (error) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'getPool failed',
				level: 'warning',
				data: { error: error.message }
			});
			return null;
		}

		return data === ZeroAddress ? null : data;
	}

	/**
	 * Retrieve rich pool metadata: tokens, fee, current tick, sqrt price,
	 * and active liquidity.
	 */
	async getPoolInfo(poolAddress: string): Promise<PoolInfo> {
		const pool = new Contract(poolAddress, POOL_ABI, this.provider);

		// ethers v6 preserves tuple field names via ethers.Result
		const [token0, token1, feeRaw, liquidity, slot0] = await Promise.all([
			pool.token0() as Promise<string>,
			pool.token1() as Promise<string>,
			pool.fee() as Promise<bigint>,
			pool.liquidity() as Promise<bigint>,
			pool.slot0()
		]);

		return {
			address: poolAddress,
			token0,
			token1,
			fee: Number(feeRaw),
			liquidity,
			sqrtPriceX96: slot0.sqrtPriceX96 as bigint,
			tick: Number(slot0.tick as bigint)
		};
	}

	/**
	 * Get the details of a specific liquidity position by its NFT
	 * token ID.
	 *
	 * @throws if the position does not exist or the call reverts
	 */
	async getPosition(tokenId: bigint): Promise<PositionInfo> {
		const npm = new Contract(UNISWAP_NPM, NPM_ABI, this.provider);
		const { data, error } = await tryCatch(npm.positions(tokenId));

		if (error || !data) {
			throw new Error(`Position not found (tokenId ${tokenId}): ${error?.message}`);
		}

		return {
			tokenId,
			token0: data.token0,
			token1: data.token1,
			fee: Number(data.fee as bigint),
			tickLower: Number(data.tickLower as bigint),
			tickUpper: Number(data.tickUpper as bigint),
			liquidity: data.liquidity as bigint,
			tokensOwed0: data.tokensOwed0 as bigint,
			tokensOwed1: data.tokensOwed1 as bigint
		};
	}

	// -----------------------------------------------------------------------
	// Gas Helpers (for full tx support + connected wallets, parity with aave)
	// -----------------------------------------------------------------------

	/**
	 * Estimate gas for a call with 20% buffer. Falls back to default.
	 * Replaces previous hardcoded gasLimits for better tx reliability.
	 */
	async estimateGasForCall(
		to: string,
		data: string,
		value: bigint = 0n,
		defaultGas = 500_000n
	): Promise<bigint> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'estimateGasForCall',
			level: 'info',
			data: { to }
		});

		const { data: gas, error } = await tryCatch(this.provider.estimateGas({ to, data, value }));

		if (error || gas == null) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'estimateGasForCall fallback',
				level: 'warning',
				data: { error: error?.message || 'no gas' }
			});
			return defaultGas;
		}
		return (gas * 120n) / 100n; // 20% buffer
	}

	// -----------------------------------------------------------------------
	// Write operations (require signer)
	// -----------------------------------------------------------------------

	/**
	 * Add liquidity to a Uniswap V3 pool by minting a new position.
	 *
	 * @returns the transaction response; the emitted event includes the
	 *   token ID, liquidity amount, and actual token amounts used.
	 */
	async addLiquidity(params: MintParams, signer: DeFiSigner): Promise<TransactionResponse> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'addLiquidity — minting new position',
			level: 'info',
			data: {
				token0: params.token0,
				token1: params.token1,
				fee: params.fee,
				tickLower: params.tickLower,
				tickUpper: params.tickUpper,
				amount0Desired: params.amount0Desired.toString(),
				amount1Desired: params.amount1Desired.toString(),
				recipient: params.recipient,
				deadline: params.deadline
			}
		});

		const ethersSigner = signer as Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const npm = new Contract(UNISWAP_NPM, NPM_ABI, ethersSigner);
				// Use dynamic gas helper (no more hardcoded)
				const iface = new Interface(NPM_ABI);
				const data = iface.encodeFunctionData('mint', [params]);
				const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 600_000n);
				return npm.mint(params, { gasLimit: gas }) as Promise<TransactionResponse>;
			})()
		);
		if (error || !tx) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'addLiquidity error',
				level: 'error',
				data: { error: error?.message }
			});
			throw new Error(`Uniswap addLiquidity failed: ${error?.message}`);
		}
		return tx;
	}

	/** Add additional liquidity to an existing position (token ID). */
	async increaseLiquidity(
		tokenId: bigint,
		amount0Desired: bigint,
		amount1Desired: bigint,
		amount0Min: bigint,
		amount1Min: bigint,
		deadline: number,
		signer: DeFiSigner
	): Promise<TransactionResponse> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'increaseLiquidity',
			level: 'info',
			data: {
				tokenId: tokenId.toString(),
				amount0Desired: amount0Desired.toString(),
				amount1Desired: amount1Desired.toString()
			}
		});

		const ethersSigner = signer as Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const npm = new Contract(UNISWAP_NPM, NPM_ABI, ethersSigner);
				const args = { tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline };
				const iface = new Interface(NPM_ABI);
				const data = iface.encodeFunctionData('increaseLiquidity', [args]);
				const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 600_000n);
				return npm.increaseLiquidity(args, { gasLimit: gas }) as Promise<TransactionResponse>;
			})()
		);
		if (error || !tx) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'increaseLiquidity error',
				level: 'error',
				data: { error: error?.message }
			});
			throw new Error(`Uniswap increaseLiquidity failed: ${error?.message}`);
		}
		return tx;
	}

	/**
	 * Remove liquidity from a position. The withdrawn liquidity is
	 * returned to the caller as token0 / token1 amounts.
	 */
	async removeLiquidity(
		tokenId: bigint,
		liquidity: bigint,
		amount0Min: bigint,
		amount1Min: bigint,
		deadline: number,
		signer: DeFiSigner
	): Promise<TransactionResponse> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'removeLiquidity',
			level: 'info',
			data: {
				tokenId: tokenId.toString(),
				liquidity: liquidity.toString()
			}
		});

		const ethersSigner = signer as Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const npm = new Contract(UNISWAP_NPM, NPM_ABI, ethersSigner);
				const args = { tokenId, liquidity, amount0Min, amount1Min, deadline };
				const iface = new Interface(NPM_ABI);
				const data = iface.encodeFunctionData('decreaseLiquidity', [args]);
				const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 400_000n);
				return npm.decreaseLiquidity(args, { gasLimit: gas }) as Promise<TransactionResponse>;
			})()
		);
		if (error || !tx) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'removeLiquidity error',
				level: 'error',
				data: { error: error?.message }
			});
			throw new Error(`Uniswap removeLiquidity failed: ${error?.message}`);
		}
		return tx;
	}

	/**
	 * Collect accrued trading fees from a position. The position must
	 * exist and the signer must be the owner (or approved).
	 */
	async collectFees(
		tokenId: bigint,
		recipient: string,
		signer: DeFiSigner
	): Promise<TransactionResponse> {
		// First fetch the position to know how many fees are owed.
		const pos = await this.getPosition(tokenId);

		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'collectFees',
			level: 'info',
			data: {
				tokenId: tokenId.toString(),
				recipient,
				tokensOwed0: pos.tokensOwed0.toString(),
				tokensOwed1: pos.tokensOwed1.toString()
			}
		});

		const ethersSigner = signer as Signer;
		const { data: tx, error } = await tryCatch(
			(async () => {
				const npm = new Contract(UNISWAP_NPM, NPM_ABI, ethersSigner);
				const args = {
					tokenId,
					recipient,
					amount0Max: pos.tokensOwed0,
					amount1Max: pos.tokensOwed1
				};
				const iface = new Interface(NPM_ABI);
				const data = iface.encodeFunctionData('collect', [args]);
				const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 300_000n);
				return npm.collect(args, { gasLimit: gas }) as Promise<TransactionResponse>;
			})()
		);
		if (error || !tx) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'collectFees error',
				level: 'error',
				data: { error: error?.message }
			});
			throw new Error(`Uniswap collectFees failed: ${error?.message}`);
		}
		return tx;
	}

	// -----------------------------------------------------------------------
	// Convenience: WBTC / USDT0
	// -----------------------------------------------------------------------

	/**
	 * Get info for the pre-deployed WBTC / USDT0 0.05% pool on Arbitrum,
	 * or `null` if the pool cannot be fetched (network error, etc.).
	 */
	async getWbtcUsdt0Pool(): Promise<PoolInfo | null> {
		const { data: pool, error } = await tryCatch(
			this.getPool(WBTC_ARBITRUM, USDT0_ARBITRUM, FEE_TIER.LOW)
		);

		if (error || !pool) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'getWbtcUsdt0Pool not found',
				level: 'warning',
				data: { error: error?.message }
			});
			return null;
		}

		const { data: info, error: infoErr } = await tryCatch(this.getPoolInfo(pool));

		if (infoErr) {
			addBreadcrumb({
				category: 'defi.uniswap',
				message: 'getWbtcUsdt0Pool info read failed',
				level: 'warning',
				data: { error: infoErr.message }
			});
			return null;
		}

		return info;
	}

	// -----------------------------------------------------------------------
	// Static helpers
	// -----------------------------------------------------------------------

	/** Compute a sensible default deadline 20 minutes from now. */
	static defaultDeadline(): number {
		return defaultDeadline();
	}

	/** The known WBTC/USDT0 0.05% pool on Arbitrum. */
	static get WBTC_USDT0_POOL_005(): string {
		return WBTC_USDT0_POOL_005;
	}

	static get WBTC_ARBITRUM(): string {
		return WBTC_ARBITRUM;
	}

	static get USDT0_ARBITRUM(): string {
		return USDT0_ARBITRUM;
	}

	// -- Connected Wallet (EVMSigner) Tx Paths for Full Support (parity with aave) --

	/** addLiquidity via EVMSigner (connected wallet abstraction). */
	async addLiquidityWithEvmSigner(
		params: MintParams,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'addLiquidityWithEvmSigner',
			level: 'info',
			data: { token0: params.token0, token1: params.token1 }
		});
		const iface = new Interface(NPM_ABI);
		const data = iface.encodeFunctionData('mint', [params]);
		const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 650_000n);
		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = { to: UNISWAP_NPM, data, value: 0n, chainId: 42161, gasLimit: gas };
		return evmSigner.sendTransaction(txReq);
	}

	/** increaseLiquidity via EVMSigner. */
	async increaseLiquidityWithEvmSigner(
		tokenId: bigint,
		amount0Desired: bigint,
		amount1Desired: bigint,
		amount0Min: bigint,
		amount1Min: bigint,
		deadline: number,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'increaseWithEvmSigner',
			level: 'info',
			data: { tokenId: tokenId.toString() }
		});
		const args = { tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline };
		const iface = new Interface(NPM_ABI);
		const data = iface.encodeFunctionData('increaseLiquidity', [args]);
		const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 650_000n);
		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = { to: UNISWAP_NPM, data, value: 0n, chainId: 42161, gasLimit: gas };
		return evmSigner.sendTransaction(txReq);
	}

	/** removeLiquidity via EVMSigner. */
	async removeLiquidityWithEvmSigner(
		tokenId: bigint,
		liquidity: bigint,
		amount0Min: bigint,
		amount1Min: bigint,
		deadline: number,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'removeWithEvmSigner',
			level: 'info',
			data: { tokenId: tokenId.toString() }
		});
		const args = { tokenId, liquidity, amount0Min, amount1Min, deadline };
		const iface = new Interface(NPM_ABI);
		const data = iface.encodeFunctionData('decreaseLiquidity', [args]);
		const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 450_000n);
		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = { to: UNISWAP_NPM, data, value: 0n, chainId: 42161, gasLimit: gas };
		return evmSigner.sendTransaction(txReq);
	}

	/** collectFees via EVMSigner. */
	async collectFeesWithEvmSigner(
		tokenId: bigint,
		recipient: string,
		evmSigner: EVMSigner
	): Promise<EVMTransactionResult> {
		const pos = await this.getPosition(tokenId);
		addBreadcrumb({
			category: 'defi.uniswap',
			message: 'collectWithEvmSigner',
			level: 'info',
			data: { tokenId: tokenId.toString() }
		});
		const args = { tokenId, recipient, amount0Max: pos.tokensOwed0, amount1Max: pos.tokensOwed1 };
		const iface = new Interface(NPM_ABI);
		const data = iface.encodeFunctionData('collect', [args]);
		const gas = await this.estimateGasForCall(UNISWAP_NPM, data, 0n, 350_000n);
		const txReq: import('$lib/services/external-wallet/types').EVMTransactionRequest & {
			gasLimit?: bigint;
		} = { to: UNISWAP_NPM, data, value: 0n, chainId: 42161, gasLimit: gas };
		return evmSigner.sendTransaction(txReq);
	}
}
