/**
 * Gas Abstraction Types
 *
 * EIP-agnostic type definitions for the gas abstraction layer.
 * Supports EIP-7702 (Candide), EIP-4337, and future EIPs without
 * requiring changes in consumers.
 *
 * @module gas-abstraction/types
 */

import type { ethers, TransactionReceipt } from 'ethers';

/**
 * Estimated gas cost for a transaction, denominated in the token
 * that will be used for payment.
 */
export interface GasEstimate {
	/** Gas limit in wei-sized units */
	gasLimit: bigint;
	/** Gas price in wei (or equivalent) */
	gasPrice: bigint;
	/** Total cost in the token's smallest unit (e.g., USDT wei) */
	totalTokenCost: bigint;
	/** Human-readable total cost (e.g., "0.50") */
	formattedTokenCost: string;
	/** Optional fiat-equivalent cost in USD */
	fiatCost?: number;
	/** Reliability of this estimate, from 0.0 (unreliable) to 1.0 (certain) */
	confidence: number;
}

/**
 * Result of executing a transaction with token-based gas payment.
 *
 * Token-based gas execution involves two transactions:
 * - Tx1: Delegation + business logic
 * - Tx2: Cleanup (refund, state reset)
 */
export interface GasExecutionResult {
	/** Hash of the delegation + business transaction (Tx1) */
	tx1Hash: string;
	/** Hash of the cleanup transaction (Tx2) */
	tx2Hash: string;
	/**
	 * Wait for the full transaction lifecycle to complete.
	 * Resolves once both transactions have reached the configured
	 * confirmation depth.
	 */
	waitForCompletion: () => Promise<TransactionReceipt>;
}

/**
 * Health status of a gas abstraction provider and its paymaster contract.
 */
export interface HealthCheckResult {
	/** Whether the underlying RPC provider is responsive */
	providerOk: boolean;
	/** Whether the paymaster contract has sufficient funds */
	paymasterFunded: boolean;
	/** Estimated number of remaining transactions the paymaster can cover */
	paymasterEstimatedRemainingTx: number;
	/** Seconds since the last oracle price update (0 = just updated) */
	oracleStaleness: number;
	/** Whether the system is ready to execute transactions */
	canExecute: boolean;
}

/**
 * EIP-agnostic gas abstraction provider interface.
 *
 * Abstracts token-based gas payment across EIPs (7702, 4337, etc.).
 * Consumers interact solely through this interface; switching EIP
 * backends requires zero consumer changes.
 *
 * Each instance is per-chain (or per-paymaster). Call `supportsChain()`
 * to verify compatibility before use.
 *
 * This provider operates on a per-transaction basis — no persistent sessions.
 */
export interface GasAbstractionProvider {
	/**
	 * Whether this provider uses persistent sessions.
	 * Always `false` — every transaction creates a fresh delegation.
	 */
	readonly isSessionBased: false;

	/**
	 * Estimate gas cost for a transaction, in the token that will be
	 * used for payment.
	 *
	 * @param tx - The unsigned transaction to estimate gas for
	 * @returns Gas cost estimate including token-denominated cost
	 */
	estimateGasInToken(tx: ethers.TransactionRequest): Promise<GasEstimate>;

	/**
	 * Execute a transaction with token-based gas payment.
	 *
	 * Submits two transactions: a delegation + business transaction
	 * (Tx1) and a cleanup transaction (Tx2). The `maxGasSpend` cap
	 * is enforced on-chain by the paymaster.
	 *
	 * @param tx - The unsigned transaction to execute
	 * @param maxGasSpend - User-defined cap on total gas spend
	 *   in the token's smallest unit (e.g., USDT wei)
	 * @returns Execution result with transaction hashes and
	 *   completion handle
	 */
	executeWithTokenGas(
		tx: ethers.TransactionRequest,
		maxGasSpend: bigint
	): Promise<GasExecutionResult>;

	/**
	 * Check provider health and paymaster availability.
	 *
	 * @returns Health status covering RPC connectivity, paymaster
	 *   funding, oracle freshness, and overall readiness
	 */
	healthCheck(): Promise<HealthCheckResult>;

	/**
	 * Does this provider support the given chain?
	 *
	 * @param chainId - EVM chain ID (e.g., 56 for BSC mainnet)
	 * @returns `true` if this provider can handle the chain
	 */
	supportsChain(chainId: number): boolean;
}
