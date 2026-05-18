/**
 * EIP-7702 Gas Abstraction Provider — Phase 2.2
 *
 * Implements the `GasAbstractionProvider` interface over the Candide
 * EIP-7702 delegation manager. Each instance is bound to a single chain.
 *
 * Uses BSC RPC from the stablecoin registry to construct the ethers provider.
 * Delegates gas estimation and execution to `EIP7702DelegationManager`.
 *
 * @see USDT Integration Plan §2.2
 */

import { JsonRpcProvider } from 'ethers';
import type { ethers } from 'ethers';
import { EIP7702DelegationManager } from './eip7702-delegation-manager';
import { getStablecoinConfig, getSupportedChainIds } from '$lib/services/stablecoin-registry';
import { tryCatch } from '$lib/utils/tryCatch';
import type {
	GasAbstractionProvider,
	GasEstimate,
	GasExecutionResult,
	HealthCheckResult
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many seconds of oracle staleness are tolerated before failing. */
const ORACLE_STALENESS_FAIL_THRESHOLD_SEC = 3600; // 1 hour

// ---------------------------------------------------------------------------
// EIP7702GasProvider
// ---------------------------------------------------------------------------

/**
 * Gas abstraction provider backed by Candide's EIP-7702 delegation flow.
 *
 * Every transaction creates a fresh delegation — there are no persistent
 * sessions. The provider is per-chain; call `supportsChain()` to verify
 * compatibility before use.
 */
export class EIP7702GasProvider implements GasAbstractionProvider {
	/** @inheritdoc */
	readonly isSessionBased = false as const;

	/** The EVM chain ID this provider targets. */
	public readonly chainId: number;

	/** The underlying ethers JSON-RPC provider. */
	private readonly provider: JsonRpcProvider;

	/** The EIP-7702 delegation manager. */
	private readonly manager: EIP7702DelegationManager;

	/**
	 * @param chainId - EVM chain ID (e.g. 56 for BSC mainnet)
	 * @param provider - Optional pre-configured provider for testing/dependency injection
	 *
	 * @throws {Error} If the chain is not in the stablecoin registry, or if
	 *   the registry has no RPC URLs configured for the chain
	 */
	constructor(chainId: number, provider?: JsonRpcProvider) {
		this.chainId = chainId;

		if (provider !== undefined) {
			this.provider = provider;
		} else {
			const config = getStablecoinConfig(chainId);
			if (config === undefined) {
				throw new Error(
					`Chain ${chainId} is not supported by the stablecoin registry. ` +
						'Use supportsChain() to check compatibility before construction.'
				);
			}

			if (config.rpcUrls.length === 0) {
				throw new Error(`Chain ${chainId} has no RPC URLs configured in the stablecoin registry.`);
			}

			// Use the first (primary) RPC URL
			this.provider = new JsonRpcProvider(config.rpcUrls[0]);
		}

		this.manager = new EIP7702DelegationManager({ provider: this.provider, chainId: this.chainId });
	}

	// -----------------------------------------------------------------------
	// GasAbstractionProvider implementation
	// -----------------------------------------------------------------------

	/**
	 * Estimate the gas cost of a transaction denominated in the gas token
	 * (e.g. USDT).
	 *
	 * Delegates to the delegation manager's `estimateGasCost()` and formats
	 * the result into a `GasEstimate` that consumers can use for display and
	 * cap-setting.
	 *
	 * @param tx - The unsigned transaction to estimate
	 * @returns A gas estimate including token-denominated cost and formatting
	 */
	async estimateGasInToken(tx: ethers.TransactionRequest): Promise<GasEstimate> {
		const { data: estimate, error } = await tryCatch(this.manager.estimateGasCost(tx));

		if (error !== null || estimate === null) {
			throw new Error(`Failed to estimate gas cost: ${error?.message ?? 'unknown error'}`, {
				cause: error ?? undefined
			});
		}

		// Build a human-readable cost string by dividing by 10^18 (USDT on BSC uses 18 decimals)
		const decimals = 18n;
		const divisor = 10n ** decimals;
		const integerPart = estimate.totalTokenCost / divisor;
		const fractionPart = estimate.totalTokenCost % divisor;
		const fractionStr = fractionPart.toString().padStart(18, '0').replace(/0+$/, '') || '0';
		const formattedCost = `${integerPart}.${fractionStr}`;

		return {
			gasLimit: estimate.gasLimit,
			gasPrice: estimate.gasPrice,
			totalTokenCost: estimate.totalTokenCost,
			formattedTokenCost: formattedCost,
			confidence: estimate.confidence ?? 0.95
		};
	}

	/**
	 * Execute a transaction with USDT-based gas payment.
	 *
	 * Submits a delegation + business transaction (Tx1) followed by a
	 * cleanup transaction (Tx2). The `maxGasSpend` cap is enforced on-chain
	 * by the paymaster.
	 *
	 * @param tx - The unsigned transaction to execute
	 * @param maxGasSpend - User-defined cap on total gas spend in the
	 *   token's smallest unit (USDT wei)
	 * @returns Execution result with both transaction hashes and a
	 *   completion handle
	 */
	async executeWithTokenGas(
		tx: ethers.TransactionRequest,
		maxGasSpend: bigint
	): Promise<GasExecutionResult> {
		const { data: result, error } = await tryCatch(
			this.manager.executeWithTokenGas(tx, maxGasSpend)
		);

		if (error !== null || result === null) {
			throw new Error(
				`Failed to execute transaction with token gas: ${error?.message ?? 'unknown error'}`,
				{ cause: error ?? undefined }
			);
		}

		return {
			tx1Hash: result.tx1Hash,
			tx2Hash: result.tx2Hash,
			waitForCompletion: result.waitForCompletion
		};
	}

	/**
	 * Check the health of the gas abstraction system.
	 *
	 * Verifies:
	 * - RPC provider is responsive (can fetch a block number)
	 * - Paymaster is funded (has sufficient BNB deposit)
	 * - Paymaster is not paused
	 * - Oracle price feed is not stale
	 *
	 * @returns A comprehensive health check result
	 */
	async healthCheck(): Promise<HealthCheckResult> {
		let providerOk = false;
		let paymasterFunded = false;
		let paymasterEstimatedRemainingTx = 0;
		let oracleStaleness = 0;
		let canExecute = false;

		// 1. Check RPC connectivity by fetching the latest block number
		const { data: blockNumber, error: blockError } = await tryCatch(this.provider.getBlockNumber());

		if (blockError !== null || blockNumber === null) {
			return {
				providerOk: false,
				paymasterFunded: false,
				paymasterEstimatedRemainingTx: 0,
				oracleStaleness: -1,
				canExecute: false
			};
		}

		providerOk = blockNumber > 0;

		// 2. Check paymaster health via the delegation manager
		const { data: paymasterHealth, error: paymasterError } = await tryCatch(
			this.manager.checkPaymasterHealth()
		);

		if (paymasterError === null && paymasterHealth !== null) {
			paymasterFunded = paymasterHealth.funded;
			paymasterEstimatedRemainingTx = paymasterHealth.estimatedRemainingTx;
			oracleStaleness = paymasterHealth.oracleStalenessSeconds;
		}

		// 3. Compute overall readiness
		const oracleAcceptable = oracleStaleness < ORACLE_STALENESS_FAIL_THRESHOLD_SEC;
		canExecute = providerOk && paymasterFunded && oracleAcceptable;

		return {
			providerOk,
			paymasterFunded,
			paymasterEstimatedRemainingTx,
			oracleStaleness,
			canExecute
		};
	}

	/**
	 * Does this provider support the given chain?
	 *
	 * Checks the stablecoin registry for the chain ID.
	 *
	 * @param chainId - EVM chain ID
	 * @returns `true` if the chain is registered and has paymaster configuration
	 */
	supportsChain(chainId: number): boolean {
		const config = getStablecoinConfig(chainId);
		if (config === undefined) {
			return false;
		}
		return config.paymaster !== undefined && config.rpcUrls.length > 0;
	}

	/**
	 * Return all chain IDs supported by this provider.
	 */
	static getSupportedChainIds(): number[] {
		return getSupportedChainIds();
	}
}
