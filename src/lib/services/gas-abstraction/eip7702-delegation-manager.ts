/**
 * EIP7702DelegationManager — Phase 2.1
 *
 * Full lifecycle manager for EIP-7702 delegation-based gas abstraction on BSC.
 *
 * **Core responsibilities:**
 * - Typed state machine (9 states) with exhaustive transition validation
 * - Pure financial functions for gas estimation and balance validation
 * - Orchestration of the two-transaction flow (Tx1: delegation + business, Tx2: cleanup)
 * - Persistent journal integration via DelegationJournal
 * - Hidden BNB emergency fallback when paymaster is unavailable
 * - On-chain-first delegation recovery
 * - Sentry breadcrumb logging at every state transition
 *
 * **State machine:**
 * ```
 * IDLE -> AUTH_SIGNING -> AUTH_SIGNED -> TX1_SUBMITTED -> TX1_MINED
 *     -> CLEANUP_NEEDED -> TX2_SUBMITTED -> TX2_MINED -> IDLE
 * TX1_MINED --(timeout/error)--> RECOVERY_NEEDED
 * TX2_MINED --(timeout/error)--> RECOVERY_NEEDED
 * RECOVERY_NEEDED -> TX2_SUBMITTED (recovery path)
 * ```
 *
 * **Gas deduction model:**
 * Paymaster deducts total gas for BOTH Tx1+Tx2 atomically at Tx1 submission time.
 * This ensures sufficient USDT is reserved for cleanup before business logic executes.
 *
 * @module gas-abstraction/eip7702-delegation-manager
 */

import type { ethers, TransactionReceipt, TransactionRequest } from 'ethers';
import { JsonRpcProvider } from 'ethers';
import {
	addEntry,
	updateEntry,
	getIncompleteDelegations,
	type DelegationJournalInput
} from '$lib/services/delegation-journal';
import { getStablecoinConfig, type StablecoinConfig } from '$lib/services/stablecoin-registry';
import { tryCatch } from '$lib/utils/tryCatch';
import { logDelegationBreadcrumb, logDelegationError } from './sentry-breadcrumbs';
import type { GasExecutionResult } from './types';

// ===========================================================================
// Public types
// ===========================================================================

/**
 * Delegation lifecycle states.
 *
 * Maps to the state machine defined in USDT Integration Plan Section 2.1.
 */
export type DelegationState =
	| 'IDLE'
	| 'AUTH_SIGNING'
	| 'AUTH_SIGNED'
	| 'TX1_SUBMITTED'
	| 'TX1_MINED'
	| 'CLEANUP_NEEDED'
	| 'TX2_SUBMITTED'
	| 'TX2_MINED'
	| 'RECOVERY_NEEDED';

/**
 * Parameters for {@link estimateGasCost}.
 */
export interface GasCostParams {
	/** Gas limit for the business transaction (Tx1), from eth_estimateGas */
	gasLimit: bigint;
	/** Gas limit for the cleanup transaction (Tx2); fixed ~21,000 for code clear */
	cleanupGasLimit: bigint;
	/** Current gas price in wei from eth_gasPrice (p90 trailing) */
	gasPrice: bigint;
	/** USDT/BNB exchange rate from paymaster oracle (18 decimals) */
	usdtPerBnb: bigint;
	/** Buffer in basis points (e.g. 1200 = 20% buffer) */
	bufferBps: number;
}

/**
 * Result of {@link estimateGasCost}.
 */
export interface GasCostEstimate {
	/** Total gas in wei (BNB) for both Tx1 and Tx2 */
	totalGasWei: bigint;
	/** Total cost in USDT smallest unit before buffer */
	totalUsdtCost: bigint;
	/** Total cost with buffer applied (before user cap). */
	costWithBuffer: bigint;
	/** Confidence in the estimate (0-1), based on oracle staleness */
	confidence: number;
}

/**
 * Parameters for {@link validateGasCost}.
 */
export interface GasValidationParams {
	/** User's total USDT balance in smallest unit */
	usdtBalance: bigint;
	/** Transaction amount in smallest unit (e.g. USDT wei) */
	transferAmount: bigint;
	/** Estimated gas cost from {@link estimateGasCost}, capped at user-defined max */
	estimatedGas: bigint;
}

/**
 * Result of {@link validateGasCost}.
 */
export interface GasValidationResult {
	/** Whether the user has sufficient funds for amount + gas */
	sufficient: boolean;
	/** The shortfall amount, or null if sufficient */
	shortfall: bigint | null;
	/** Total required = transferAmount + estimatedGas */
	requiredTotal: bigint;
}

/**
 * Health status of the paymaster and gas infrastructure.
 */
export interface PaymasterHealth {
	/** Whether the paymaster contract has sufficient BNB deposit */
	funded: boolean;
	/** Estimated number of remaining transactions the paymaster can sponsor */
	estimatedRemainingTx: number;
	/** Seconds since the last oracle price update */
	oracleStalenessSeconds: number;
}

/**
 * Pluggable submitter for the EIP-7702 UserOperation (Tx1).
 * Phase 2.2 (Candide AbstractionKit) provides the real implementation.
 */
export type Tx1Submitter = (
	tx: TransactionRequest,
	maxGasSpend: bigint
) => Promise<{ txHash: string; receipt: TransactionReceipt | null }>;

/**
 * Pluggable submitter for the cleanup UserOperation (Tx2).
 * Phase 2.2 (Candide AbstractionKit) provides the real implementation.
 */
export type Tx2Submitter = () => Promise<{ txHash: string; receipt: TransactionReceipt | null }>;

/**
 * Configuration for the DelegationManager constructor.
 */
export interface DelegationManagerConfig {
	/** EVM chain ID (e.g. 56 for BSC mainnet) */
	chainId: number;
	/** Optional pre-configured JSON-RPC provider */
	provider?: JsonRpcProvider;
	/**
	 * Optional pluggable Tx1 submitter (EIP-7702 UserOperation).
	 * When provided, overrides the default stub.
	 * Set by Phase 2.2 (Candide AbstractionKit integration).
	 */
	tx1Submitter?: Tx1Submitter;
	/**
	 * Optional pluggable Tx2 submitter (cleanup UserOperation).
	 * When provided, overrides the default stub.
	 * Set by Phase 2.2 (Candide AbstractionKit integration).
	 */
	tx2Submitter?: Tx2Submitter;
	/**
	 * Optional wallet for the hidden BNB fallback path.
	 * When the paymaster is unavailable and the user has BNB,
	 * this wallet is used to sign and submit a direct EIP-1559
	 * transaction (no EIP-7702 delegation).
	 *
	 * SECURITY: The caller owns the lifecycle of this wallet.
	 * The manager only uses it as a last resort when all other
	 * gas payment paths have been exhausted.
	 */
	bnbFallbackWallet?: ethers.Wallet;
	/**
	 * Optional override for the USDT/BNB oracle rate (18 decimals).
	 * When set, overrides the hardcoded fallback rate.
	 * Phase 2.6 replaces this with on-chain oracle queries.
	 */
	oracleRateOverride?: bigint;
}

/**
 * Result of on-chain delegation recovery.
 */
export interface RecoveryResult {
	/** Whether the recovery was successful */
	recovered: boolean;
	/** Cleanup transaction hash (only set when Tx2 was submitted) */
	tx2Hash?: string;
	/** Human-readable reason explaining the outcome */
	reason: string;
}

/**
 * Internal tracking state for an in-progress delegation lifecycle.
 * Persisted to Capacitor Preferences via DelegationJournal.
 */
interface DelegationSession {
	journalEntryId: string | null;
	currentState: DelegationState;
	tx1Hash: string | null;
	tx2Hash: string | null;
}

// ===========================================================================
// Constants
// ===========================================================================

/**
 * Fixed gas limit for the cleanup transaction (Tx2).
 * Clearing delegation code to address(0) is a simple code store,
 * consuming approximately 21,000 gas (standard EOA tx cost).
 */
const DEFAULT_CLEANUP_GAS_LIMIT = 21_000n;

/** Default buffer in basis points: 1200 = 20% buffer. */
const DEFAULT_BUFFER_BPS = 1200;

/** BNB decimals for conversion calculations. */
const BNB_DECIMALS = 18n;

/** Delay between BNB fallback retry attempts in milliseconds. */
const BNB_FALLBACK_RETRY_DELAY_MS = 2_000;

/** Expected empty code response for a pure EOA. */
const EMPTY_CODE = '0x';

/** Block confirmations for Tx receipt finality. */
const DEFAULT_CONFIRMATIONS = 1;

/** Gas limit for a standard EOA transfer (21,000) used as BNB fallback gas margin. */
const STANDARD_TX_GAS = 21_000n;

// ===========================================================================
// State machine
// ===========================================================================

/**
 * Valid state transitions for the delegation lifecycle.
 *
 * Maps each source state to the set of reachable destination states.
 */
const VALID_TRANSITIONS: Record<DelegationState, readonly DelegationState[]> = {
	IDLE: ['AUTH_SIGNING', 'RECOVERY_NEEDED'],
	AUTH_SIGNING: ['AUTH_SIGNED'],
	AUTH_SIGNED: ['TX1_SUBMITTED'],
	TX1_SUBMITTED: ['TX1_MINED', 'RECOVERY_NEEDED'],
	TX1_MINED: ['CLEANUP_NEEDED', 'RECOVERY_NEEDED'],
	CLEANUP_NEEDED: ['TX2_SUBMITTED'],
	TX2_SUBMITTED: ['TX2_MINED', 'RECOVERY_NEEDED'],
	TX2_MINED: ['IDLE', 'RECOVERY_NEEDED'],
	RECOVERY_NEEDED: ['TX2_SUBMITTED', 'CLEANUP_NEEDED']
} as const;

/**
 * Return all valid destination states reachable from the given state.
 * Pure function -- deterministic for a given input.
 *
 * @param state - The current delegation state
 * @returns An array of valid next states (empty if state is unknown)
 */
export function getValidTransitions(state: DelegationState): readonly DelegationState[] {
	return VALID_TRANSITIONS[state] ?? [];
}

/**
 * Check whether a transition between two states is valid.
 * Pure function -- deterministic for a given input.
 *
 * @param from - The current state
 * @param to - The desired next state
 * @returns `true` if the transition is valid
 */
export function isValidTransition(from: DelegationState, to: DelegationState): boolean {
	const valid = VALID_TRANSITIONS[from];
	return valid !== undefined && valid.includes(to);
}

/**
 * Assert that a state transition is valid. Throws if invalid.
 * Used as an exhaustive guard in switch statements.
 *
 * @param from - The current state
 * @param to - The desired next state
 * @throws {DelegationManagerError} If the transition is invalid
 */
export function assertValidTransition(from: DelegationState, to: DelegationState): void {
	if (!isValidTransition(from, to)) {
		throw new DelegationManagerError(
			`Invalid state transition: ${from} -> ${to}. Valid transitions from ${from}: [${getValidTransitions(from).join(', ')}]`,
			'INVALID_STATE_TRANSITION'
		);
	}
}

// ===========================================================================
// Custom error
// ===========================================================================

export class DelegationManagerError extends Error {
	public readonly code: string;
	public readonly state?: DelegationState;

	constructor(message: string, code: string = 'DELEGATION_MANAGER_ERROR', state?: DelegationState) {
		super(message);
		this.name = 'DelegationManagerError';
		this.code = code;
		this.state = state;
	}
}

// ===========================================================================
// Pure financial functions
// ===========================================================================

/**
 * Estimate the total gas cost for a USDT gas transaction (both Tx1 + Tx2).
 *
 * Pure function -- no side effects, deterministic output for a given input.
 * All numeric operations use BigInt for precision.
 *
 * **Formula:**
 * ```
 * totalGasWei = (gasLimit + cleanupGasLimit) * gasPrice
 * totalUsdtCost = totalGasWei * usdtPerBnb / 10^18
 * costWithBuffer = totalUsdtCost * bufferBps / 10000
 * ```
 *
 * @param params - Gas estimation parameters
 * @returns The gas cost estimate
 *
 * @example
 * ```ts
 * const estimate = estimateGasCost({
 *   gasLimit: 65000n,
 *   cleanupGasLimit: 21000n,
 *   gasPrice: 1000000000n, // 1 gwei
 *   usdtPerBnb: 500000000000000000n, // 500 USDT/BNB (18 decimals)
 *   bufferBps: 1200 // 20% buffer
 * });
 * ```
 */
export function estimateGasCost(params: GasCostParams): GasCostEstimate {
	const { gasLimit, cleanupGasLimit, gasPrice, usdtPerBnb, bufferBps } = params;

	// Validate inputs
	if (gasLimit < 0n) {
		throw new DelegationManagerError('gasLimit must not be negative', 'INVALID_GAS_LIMIT');
	}
	if (cleanupGasLimit < 0n) {
		throw new DelegationManagerError(
			'cleanupGasLimit must not be negative',
			'INVALID_CLEANUP_GAS_LIMIT'
		);
	}
	if (gasPrice < 0n) {
		throw new DelegationManagerError('gasPrice must not be negative', 'INVALID_GAS_PRICE');
	}
	if (usdtPerBnb < 0n) {
		throw new DelegationManagerError('usdtPerBnb must not be negative', 'INVALID_USDT_PER_BNB');
	}
	if (bufferBps < 1000 || bufferBps > 5000) {
		throw new DelegationManagerError(
			`bufferBps must be between 1000 and 5000, got ${bufferBps}`,
			'INVALID_BUFFER'
		);
	}

	// Total gas = business gas (Tx1) + cleanup gas (Tx2)
	const totalGas = gasLimit + cleanupGasLimit;

	// Total gas in wei (BNB)
	const totalGasWei = totalGas * gasPrice;

	// Convert to USDT: wei * usdtPerBnb / 10^18
	const divisor = 10n ** BNB_DECIMALS;
	const totalUsdtCost = divisor > 0n ? (totalGasWei * usdtPerBnb) / divisor : 0n;

	// Apply buffer bufferBps / 10000
	const costWithBuffer = (totalUsdtCost * BigInt(bufferBps)) / 10000n;

	// Confidence heuristic:
	// - bufferBps <= 1500 (15%): high confidence (fresh oracle)
	// - bufferBps <= 3000 (30%): medium confidence
	// - bufferBps >  3000: low confidence (stale oracle or high volatility)
	let confidence: number;
	if (bufferBps <= 1500) {
		confidence = 0.95;
	} else if (bufferBps <= 3000) {
		confidence = 0.8;
	} else {
		confidence = 0.6;
	}

	return {
		totalGasWei,
		totalUsdtCost,
		costWithBuffer,
		confidence
	};
}

/**
 * Validate that a user's USDT balance is sufficient to cover the transfer
 * amount plus the estimated maximum gas cost.
 *
 * Pure function -- no side effects, deterministic output for a given input.
 *
 * **Formula:**
 * ```
 * requiredTotal = transferAmount + estimatedGas
 * sufficient = usdtBalance >= requiredTotal
 * ```
 *
 * @param params - Validation parameters
 * @returns Validation result with shortfall calculation
 *
 * @example
 * ```ts
 * const result = validateGasCost({
 *   usdtBalance: 500_000000n,     // 500 USDT
 *   transferAmount: 100_000000n,  // 100 USDT
 *   estimatedGas: 0_020000n       // 0.02 USDT (capped estimate)
 * });
 * // { sufficient: true, shortfall: null, requiredTotal: 100_020000n }
 * ```
 */
export function validateGasCost(params: GasValidationParams): GasValidationResult {
	const { usdtBalance, transferAmount, estimatedGas } = params;

	// Validate inputs
	if (usdtBalance < 0n) {
		throw new DelegationManagerError('usdtBalance must not be negative', 'INVALID_BALANCE');
	}
	if (transferAmount < 0n) {
		throw new DelegationManagerError('transferAmount must not be negative', 'INVALID_AMOUNT');
	}
	if (estimatedGas < 0n) {
		throw new DelegationManagerError('estimatedGas must not be negative', 'INVALID_ESTIMATE');
	}

	const requiredTotal = transferAmount + estimatedGas;
	const sufficient = usdtBalance >= requiredTotal;
	const shortfall = sufficient ? null : requiredTotal - usdtBalance;

	return {
		sufficient,
		shortfall,
		requiredTotal
	};
}

// ===========================================================================
// Gas cost formatting
// ===========================================================================

/**
 * Format a raw token cost (smallest unit) into a human-readable string.
 * Pure function -- deterministic for a given input.
 *
 * @param rawCost - Cost in the token's smallest unit (e.g. USDT wei)
 * @param decimals - Number of decimal places (18 for USDT on BSC)
 * @returns Formatted string (e.g. "0.02")
 */
export function formatTokenCost(rawCost: bigint, decimals: number = 18): string {
	if (rawCost < 0n) {
		throw new DelegationManagerError('rawCost must not be negative', 'INVALID_COST');
	}
	if (decimals < 0) {
		throw new DelegationManagerError('decimals must not be negative', 'INVALID_DECIMALS');
	}

	if (rawCost === 0n) {
		return '0';
	}

	const divisor = 10n ** BigInt(decimals);
	const integerPart = rawCost / divisor;
	const fractionPart = rawCost % divisor;

	if (fractionPart === 0n) {
		return integerPart.toString();
	}

	// Pad and trim trailing zeros from fraction
	const fractionStr = fractionPart.toString().padStart(decimals, '0').replace(/0+$/, '');

	return `${integerPart.toString()}.${fractionStr}`;
}

// ===========================================================================
// EIP7702DelegationManager
// ===========================================================================

/**
 * Manages the full EIP-7702 delegation lifecycle.
 *
 * **Orchestration:**
 * 1. Estimate gas cost (pure function)
 * 2. Validate user balance can cover amount + gas (pure function)
 * 3. Transition through state machine with journal persistence at each step
 * 4. Submit Tx1 (delegation + business logic) via the configured submitter
 * 5. Wait for Tx1 confirmation
 * 6. Submit Tx2 (cleanup) via the configured submitter
 * 7. Wait for Tx2 confirmation
 * 8. Verify EOA state via getCode()
 * 9. Return to IDLE
 *
 * **Recovery:**
 * - On-chain state (getCode) is always the source of truth
 * - DelegationJournal serves as a recovery hint
 * - If delegation code is found on-chain, submits Tx2 to clear it
 * - Hidden BNB fallback activates when paymaster is unavailable
 *
 * @example
 * ```ts
 * const manager = new EIP7702DelegationManager({
 *   chainId: 56,
 *   provider: new JsonRpcProvider('https://bsc-dataseed1.binance.org')
 * });
 *
 * // Execute a USDT transfer with gas abstraction
 * const result = await manager.executeWithTokenGas(
 *   { to: '0x...', data: '0x...' },
 *   500000000000000000n // 0.50 USDT max gas cap
 * );
 * ```
 */
export class EIP7702DelegationManager {
	/** The JSON-RPC provider for on-chain interaction. */
	private readonly provider: JsonRpcProvider;

	/** The EVM chain ID this manager operates on. */
	private readonly chainId: number;

	/** Cached stablecoin configuration for the chain. */
	private readonly chainConfig: StablecoinConfig;

	/** Optional pluggable Tx1 submitter (set by Phase 2.2). */
	private readonly tx1Submitter?: Tx1Submitter;

	/** Optional pluggable Tx2 submitter (set by Phase 2.2). */
	private readonly tx2Submitter?: Tx2Submitter;

	/** Optional wallet for the BNB fallback path. */
	private readonly bnbFallbackWallet?: ethers.Wallet;

	/** Optional override for the USDT/BNB oracle rate. */
	private readonly oracleRateOverride?: bigint;

	/** Internal session state tracking. */
	private session: DelegationSession = {
		journalEntryId: null,
		currentState: 'IDLE',
		tx1Hash: null,
		tx2Hash: null
	};

	// -----------------------------------------------------------------------
	// Construction
	// -----------------------------------------------------------------------

	/**
	 * @param config - Configuration object
	 *
	 * @throws {DelegationManagerError} If the chain is not in the stablecoin
	 *   registry or has no RPC URLs configured
	 */
	constructor(config: DelegationManagerConfig) {
		const resolvedChainId = config.chainId;

		const chainConfig = getStablecoinConfig(resolvedChainId);
		if (chainConfig === undefined) {
			throw new DelegationManagerError(
				`Chain ${resolvedChainId} is not supported by the stablecoin registry.`,
				'CHAIN_NOT_SUPPORTED'
			);
		}
		this.chainConfig = chainConfig;
		this.chainId = resolvedChainId;

		if (config.provider !== undefined) {
			this.provider = config.provider;
		} else {
			if (chainConfig.rpcUrls.length === 0) {
				throw new DelegationManagerError(
					`Chain ${resolvedChainId} has no RPC URLs configured.`,
					'NO_RPC_URLS'
				);
			}
			this.provider = new JsonRpcProvider(chainConfig.rpcUrls[0]);
		}

		// Store pluggable submitter functions (Phase 2.2)
		this.tx1Submitter = config.tx1Submitter;
		this.tx2Submitter = config.tx2Submitter;

		// Store BNB fallback wallet
		this.bnbFallbackWallet = config.bnbFallbackWallet;

		// Store oracle rate override
		this.oracleRateOverride = config.oracleRateOverride;
	}

	// -----------------------------------------------------------------------
	// Public accessors
	// -----------------------------------------------------------------------

	/**
	 * Return the current delegation state.
	 */
	getState(): DelegationState {
		return this.session.currentState;
	}

	/**
	 * Return the journal entry ID for the active session, if any.
	 */
	getJournalEntryId(): string | null {
		return this.session.journalEntryId;
	}

	/**
	 * Return a read-only snapshot of the active session.
	 */
	getSessionSnapshot(): Readonly<DelegationSession> {
		return { ...this.session };
	}

	// -----------------------------------------------------------------------
	// Gas estimation
	// -----------------------------------------------------------------------

	/**
	 * Estimate the gas cost for a transaction using EIP-7702 delegation.
	 *
	 * Fetches the current gas price from the RPC, retrieves the USDT/BNB
	 * oracle rate, and computes the total cost including the 20% buffer.
	 *
	 * **The estimate covers BOTH Tx1 (delegation + business) and Tx2 (cleanup)**
	 * because the paymaster deducts total gas atomically at Tx1 submission time.
	 *
	 * @param tx - The unsigned transaction to estimate gas for
	 * @returns A gas cost estimate with metadata
	 */
	async estimateGasCost(tx: ethers.TransactionRequest): Promise<{
		gasLimit: bigint;
		gasPrice: bigint;
		totalTokenCost: bigint;
		confidence: number;
	}> {
		// 1. Fetch current gas price
		const { data: feeData, error: feeError } = await tryCatch(this.provider.getFeeData());
		if (feeError !== null || feeData === null) {
			throw new DelegationManagerError(
				`Failed to fetch gas price: ${feeError?.message ?? 'unknown error'}`,
				'GAS_PRICE_FETCH_FAILED'
			);
		}

		// Use maxFeePerGas (EIP-1559) or fall back to gasPrice
		const gasPrice: bigint =
			feeData.maxFeePerGas !== null ? feeData.maxFeePerGas : (feeData.gasPrice ?? 0n);

		if (gasPrice <= 0n) {
			throw new DelegationManagerError('Gas price is zero or unavailable', 'ZERO_GAS_PRICE');
		}

		// 2. Estimate gas limit for the business transaction (Tx1)
		const { data: estimatedGasLimit, error: estimateError } = await tryCatch(
			this.provider.estimateGas(tx)
		);
		if (estimateError !== null || estimatedGasLimit === null) {
			throw new DelegationManagerError(
				`Failed to estimate gas limit: ${estimateError?.message ?? 'unknown error'}`,
				'GAS_LIMIT_ESTIMATE_FAILED'
			);
		}

		// 3. Get oracle rate (USDT/BNB). For now, use a placeholder.
		// In Phase 2.6, this will query the on-chain paymaster oracle.
		// For estimation purposes, we use a reasonable fallback rate.
		const { data: oracleRate, error: oracleError } = await tryCatch(this.fetchOracleRate());

		// If oracle is unavailable, we cannot provide an estimate
		if (oracleError !== null || oracleRate === null || oracleRate <= 0n) {
			throw new DelegationManagerError(
				`Failed to fetch USDT/BNB oracle rate: ${oracleError?.message ?? 'oracle returned zero'}`,
				'ORACLE_FETCH_FAILED'
			);
		}

		// 4. Compute the estimate using the pure function
		const estimate = estimateGasCost({
			gasLimit: estimatedGasLimit,
			cleanupGasLimit: DEFAULT_CLEANUP_GAS_LIMIT,
			gasPrice,
			usdtPerBnb: oracleRate,
			bufferBps: DEFAULT_BUFFER_BPS
		});

		logDelegationBreadcrumb('AUTH_SIGNING', {
			gasLimit: estimatedGasLimit.toString(),
			gasPrice: gasPrice.toString(),
			totalTokenCost: estimate.costWithBuffer.toString(),
			confidence: estimate.confidence
		});

		return {
			gasLimit: estimatedGasLimit,
			gasPrice,
			totalTokenCost: estimate.costWithBuffer,
			confidence: estimate.confidence
		};
	}

	// -----------------------------------------------------------------------
	// Full lifecycle execution
	// -----------------------------------------------------------------------

	/**
	 * Execute a transaction with USDT-based gas payment (EIP-7702 delegation).
	 *
	 * Orchestrates the full two-transaction flow:
	 * 1. Estimates gas cost for both Tx1 + Tx2
	 * 2. Validates the user's USDT balance
	 * 3. Signs the EIP-7702 authorization
	 * 4. Submits Tx1 (delegation + business logic)
	 * 5. Waits for Tx1 confirmation
	 * 6. Verifies Tx1 succeeded
	 * 7. Submits Tx2 (cleanup)
	 * 8. Waits for Tx2 confirmation
	 * 9. Verifies EOA state (getCode === '0x')
	 * 10. Returns to IDLE
	 *
	 * **Hidden BNB fallback:** If paymaster-based submission fails and the user
	 * has BNB balance, silently retries with direct BNB gas (EIP-1559).
	 *
	 * @param tx - The unsigned transaction to execute
	 * @param maxGasSpend - User-defined cap on total gas spend in USDT smallest unit
	 * @returns Execution result with transaction hashes and completion handle
	 */
	async executeWithTokenGas(
		tx: ethers.TransactionRequest,
		maxGasSpend: bigint
	): Promise<GasExecutionResult> {
		// Validate that no session is already in progress
		if (this.session.currentState !== 'IDLE') {
			throw new DelegationManagerError(
				`Cannot start new execution: current state is ${this.session.currentState}. ` +
					'Wait for the current delegation to complete or call recoverDelegation().',
				'SESSION_IN_PROGRESS'
			);
		}

		// Create journal entry for this session
		const senderAddress =
			tx.from !== undefined && typeof tx.from === 'string' ? tx.from.toLowerCase() : 'unknown';

		const journalInput: DelegationJournalInput = {
			chainId: this.chainId,
			status: 'AUTH_SIGNING',
			senderAddress,
			recipientAddress:
				tx.to !== undefined && typeof tx.to === 'string' ? tx.to.toLowerCase() : 'unknown',
			amount: '0',
			tokenSymbol: 'USDT',
			tx1Hash: null,
			tx2Hash: null
		};

		const { data: journalEntry, error: journalError } = await tryCatch(addEntry(journalInput));
		if (journalError !== null || journalEntry === null) {
			throw new DelegationManagerError(
				`Failed to create journal entry: ${journalError?.message ?? 'unknown error'}`,
				'JOURNAL_CREATE_FAILED'
			);
		}

		this.session.journalEntryId = (journalEntry as Record<string, unknown>).id as string;

		try {
			return await this.executeWithJournal(tx, maxGasSpend);
		} catch (err) {
			// If execution failed after chain side-effects, transition to RECOVERY_NEEDED
			if (this.session.currentState !== 'IDLE') {
				await this.transitionTo('RECOVERY_NEEDED', {
					error: err instanceof Error ? err.message : String(err)
				});
			}
			throw err;
		}
	}

	/**
	 * Internal execution flow with an active journal entry.
	 * Split from executeWithTokenGas for clean error boundary handling.
	 */
	private async executeWithJournal(
		tx: TransactionRequest,
		maxGasSpend: bigint
	): Promise<GasExecutionResult> {
		// Derive sender address from tx for EOA state verification
		const senderAddress =
			tx.from !== undefined && typeof tx.from === 'string' ? tx.from.toLowerCase() : 'unknown';

		// Step 1: Estimate gas cost for the transaction
		const { data: estimate, error: estimateError } = await tryCatch(this.estimateGasCost(tx));
		if (estimateError !== null || estimate === null) {
			await this.transitionTo('RECOVERY_NEEDED', {
				error: `Gas estimation failed: ${estimateError?.message ?? 'unknown error'}`
			});
			throw new DelegationManagerError(
				`Gas estimation failed: ${estimateError?.message ?? 'unknown error'}`,
				'ESTIMATION_FAILED'
			);
		}

		// Apply user-defined max cap
		const cappedGas =
			estimate.totalTokenCost <= maxGasSpend ? estimate.totalTokenCost : maxGasSpend;

		logDelegationBreadcrumb('AUTH_SIGNING', {
			totalTokenCost: estimate.totalTokenCost.toString(),
			cappedGas: cappedGas.toString(),
			maxGasSpend: maxGasSpend.toString(),
			confidence: estimate.confidence
		});

		// Step 2: Validate balance (handled by caller with actual balance)

		// Step 3: Transition to AUTH_SIGNING
		await this.transitionTo('AUTH_SIGNING');

		// Step 4: Sign EIP-7702 authorization
		// NOTE: The actual signing requires a RestrictedSigner which is set up
		// by the eip7702-provider (Phase 2.2). In this phase, signing is delegated
		// to the submitter via executeWithTokenGas.
		await this.transitionTo('AUTH_SIGNED');

		// Step 5-6: Submit Tx1 (delegation + business logic) and wait for confirmation
		const tx1Result = await this.submitAndWaitForTx1(tx, cappedGas);
		this.session.tx1Hash = tx1Result.txHash;
		await this.updateJournalEntry({ tx1Hash: tx1Result.txHash });
		logDelegationBreadcrumb('TX1_SUBMITTED', { tx1Hash: tx1Result.txHash });

		// Wait for Tx1 to be mined
		const tx1Receipt = await this.waitForTransaction(tx1Result.txHash);
		this.session.currentState = 'TX1_MINED';
		await this.transitionTo('TX1_MINED', { tx1BlockNumber: tx1Receipt?.blockNumber });

		// Step 7: Verify Tx1 succeeded
		if (tx1Receipt !== null && tx1Receipt.status !== undefined && tx1Receipt.status === 0) {
			await this.transitionTo('RECOVERY_NEEDED', {
				error: 'Tx1 reverted. Check receipt for details.',
				tx1Hash: tx1Result.txHash
			});
			throw new DelegationManagerError(
				`Tx1 reverted: ${tx1Result.txHash}. The delegation may be in an incomplete state. Run recoverDelegation() to resolve.`,
				'TX1_REVERTED'
			);
		}

		// Step 8-9: Submit Tx2 (cleanup) and wait for confirmation
		await this.transitionTo('CLEANUP_NEEDED');
		const tx2Result = await this.submitAndWaitForTx2();
		this.session.tx2Hash = tx2Result.txHash;
		await this.updateJournalEntry({ tx2Hash: tx2Result.txHash });
		logDelegationBreadcrumb('TX2_SUBMITTED', { tx2Hash: tx2Result.txHash });

		// Wait for Tx2 to be mined
		const tx2Receipt = await this.waitForTransaction(tx2Result.txHash);
		this.session.currentState = 'TX2_MINED';

		// Step 10: Verify Tx2 succeeded and EOA state is restored
		if (tx2Receipt !== null && tx2Receipt.status !== undefined && tx2Receipt.status === 0) {
			await this.transitionTo('RECOVERY_NEEDED', {
				error: 'Tx2 reverted. EOA state may still be delegated.',
				tx2Hash: tx2Result.txHash
			});
			throw new DelegationManagerError(
				`Tx2 reverted: ${tx2Result.txHash}. EOA state may still be delegated. Run recoverDelegation() to resolve.`,
				'TX2_REVERTED'
			);
		}

		// Step 11: Verify EOA state
		const { data: code, error: codeError } = await tryCatch(this.provider.getCode(senderAddress));
		if (codeError !== null || code === null) {
			await this.transitionTo('RECOVERY_NEEDED', {
				error: `Failed to verify EOA state: ${codeError?.message ?? 'getCode returned null'}`
			});
			throw new DelegationManagerError(
				`Failed to verify EOA state after cleanup: ${codeError?.message ?? 'unknown error'}. Run recoverDelegation() to resolve.`,
				'EOA_VERIFY_FAILED'
			);
		}

		if (code !== EMPTY_CODE) {
			await this.transitionTo('RECOVERY_NEEDED', {
				error: 'EOA state not restored after Tx2 cleanup',
				code
			});
			throw new DelegationManagerError(
				`Account at ${senderAddress} still has non-empty code after cleanup (${code}). Run recoverDelegation() to resolve.`,
				'EOA_NOT_RESTORED'
			);
		}

		// Step 12: Success -- return to IDLE
		await this.transitionTo('TX2_MINED');
		await this.transitionTo('IDLE');

		/**
		 * Pre-resolved waitForCompletion function.
		 * Returns the Tx2 receipt which confirms the full lifecycle is complete.
		 */
		const waitForCompletion = async (): Promise<TransactionReceipt> => {
			if (tx2Receipt !== null) {
				return tx2Receipt;
			}
			const receipt = await this.waitForTransaction(tx2Result.txHash);
			if (receipt === null) {
				throw new DelegationManagerError(
					`Tx2 ${tx2Result.txHash} not found on chain after waiting.`,
					'TX2_RECEIPT_NOT_FOUND'
				);
			}
			return receipt;
		};

		return {
			tx1Hash: tx1Result.txHash,
			tx2Hash: tx2Result.txHash,
			waitForCompletion
		};
	}

	// -----------------------------------------------------------------------
	// Tx submission (to be implemented by eip7702-provider in Phase 2.2)
	// -----------------------------------------------------------------------

	/**
	 * Submit the delegation + business transaction (Tx1).
	 *
	 * This method creates and submits an EIP-7702 UserOperation via the
	 * Candide bundler. The paymaster sponsors the operation and deducts
	 * the total gas cost for BOTH Tx1 + Tx2 atomically.
	 *
	 * **Phase 2.2 integration:** The eip7702-provider will override or
	 * replace this method to use the Candide AbstractionKit's
	 * `Calibur7702Account` and `CandidePaymaster` classes.
	 *
	 * @param tx - The unsigned business transaction
	 * @param maxGasSpend - Capped gas spend in USDT smallest unit
	 * @returns The transaction hash and optional receipt
	 */
	protected async submitAndWaitForTx1(
		tx: TransactionRequest,
		maxGasSpend: bigint
	): Promise<{ txHash: string; receipt: TransactionReceipt | null }> {
		// If a pluggable submitter is configured (Phase 2.2 Candide SDK), use it
		if (this.tx1Submitter !== undefined) {
			return this.tx1Submitter(tx, maxGasSpend);
		}

		// Otherwise, try the BNB fallback if a wallet is available
		if (this.bnbFallbackWallet !== undefined) {
			const bnbTxHash = await this.attemptBnbFallback(tx);
			if (bnbTxHash !== null) {
				return { txHash: bnbTxHash, receipt: null };
			}
		}

		// No submitter configured -- throw with clear instructions
		throw new DelegationManagerError(
			'EIP-7702 UserOperation submission is not yet implemented. ' +
				'Pass a tx1Submitter in DelegationManagerConfig (Phase 2.2, Candide AbstractionKit) ' +
				'or configure bnbFallbackWallet for direct BNB gas payment. ' +
				'See requirements/usdt-integration-plan.md Section 11.4 for the SDK API.',
			'TX_SUBMIT_NOT_IMPLEMENTED',
			this.session.currentState
		);
	}

	/**
	 * Submit the cleanup transaction (Tx2).
	 *
	 * Creates a UserOperation that sets delegation code to address(0),
	 * restoring the account to pure EOA state.
	 *
	 * @returns The transaction hash and optional receipt
	 */
	protected async submitAndWaitForTx2(): Promise<{
		txHash: string;
		receipt: TransactionReceipt | null;
	}> {
		// If a pluggable submitter is configured (Phase 2.2 Candide SDK), use it
		if (this.tx2Submitter !== undefined) {
			return this.tx2Submitter();
		}

		// No submitter configured -- throw with clear instructions
		throw new DelegationManagerError(
			'EIP-7702 cleanup transaction submission is not yet implemented. ' +
				'Pass a tx2Submitter in DelegationManagerConfig (Phase 2.2, Candide AbstractionKit). ' +
				'See requirements/usdt-integration-plan.md Section 11.4 for the SDK API.',
			'TX_SUBMIT_NOT_IMPLEMENTED',
			this.session.currentState
		);
	}

	/**
	 * Attempt the hidden BNB fallback for a failed transaction.
	 *
	 * When the paymaster is unavailable and the user has BNB, silently retry
	 * with a direct EIP-1559 transaction signed by the BNB fallback wallet.
	 *
	 * The transaction is signed and submitted directly via `eth_sendRawTransaction`,
	 * bypassing the EIP-7702 delegation/paymaster infrastructure entirely.
	 *
	 * SECURITY: The BNB fallback wallet must be provided in the constructor config.
	 * The wallet is only used as a last resort when all other gas payment paths
	 * have been exhausted. The manager never exposes the wallet externally.
	 *
	 * @param tx - The transaction to sign and submit
	 * @returns The transaction hash if successfully submitted, or null
	 */
	protected async attemptBnbFallback(tx: TransactionRequest): Promise<string | null> {
		// Only proceed if a BNB fallback wallet is configured
		if (this.bnbFallbackWallet === undefined) {
			return null;
		}

		// 1. Determine the sender address from the wallet
		const fromAddress = this.bnbFallbackWallet.address;

		// 2. Fetch the nonce if not provided in tx
		let nonce: number;
		if (tx.nonce !== undefined) {
			if (typeof tx.nonce === 'number') {
				nonce = tx.nonce;
			} else if (typeof tx.nonce === 'bigint') {
				nonce = Number(tx.nonce);
				if (nonce > Number.MAX_SAFE_INTEGER) {
					return null;
				}
			} else if (typeof tx.nonce === 'string') {
				nonce = parseInt(tx.nonce, 10);
				if (isNaN(nonce)) {
					return null;
				}
			} else {
				return null;
			}
		} else {
			const { data: fetchedNonce, error: nonceError } = await tryCatch(
				this.provider.getTransactionCount(fromAddress)
			);
			if (nonceError !== null || fetchedNonce === null) {
				return null;
			}
			nonce = fetchedNonce;
		}

		// 3. Fetch fee data
		const { data: feeData, error: feeError } = await tryCatch(this.provider.getFeeData());
		if (feeError !== null || feeData === null) {
			return null;
		}

		const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
		const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? maxFeePerGas / 2n;
		if (maxFeePerGas <= 0n) {
			return null;
		}

		// 4. Check if the wallet has enough BNB for gas
		const { data: bnbBalance, error: balanceError } = await tryCatch(
			this.provider.getBalance(fromAddress)
		);
		if (balanceError !== null || bnbBalance === null || bnbBalance <= 0n) {
			return null;
		}

		const gasLimit =
			tx.gasLimit !== undefined && typeof tx.gasLimit === 'bigint' ? tx.gasLimit : STANDARD_TX_GAS;
		const requiredGas = gasLimit * maxFeePerGas;

		if (bnbBalance < requiredGas) {
			logDelegationBreadcrumb('RECOVERY_NEEDED', {
				bnbFallback: 'insufficient BNB for gas',
				balance: bnbBalance.toString(),
				required: requiredGas.toString()
			});
			return null;
		}

		// 5. Build the complete transaction request
		const chainId = this.chainId;

		const completeTx: ethers.TransactionRequest = {
			...tx,
			from: fromAddress,
			nonce,
			gasLimit,
			maxFeePerGas,
			maxPriorityFeePerGas,
			type: 2, // EIP-1559
			chainId,
			value: tx.value ?? 0n,
			data: tx.data ?? '0x'
		};

		// 6. Sign and submit the transaction
		const { data: signedTx, error: signError } = await tryCatch(
			this.bnbFallbackWallet.signTransaction(completeTx)
		);
		if (signError !== null || signedTx === null) {
			logDelegationBreadcrumb('RECOVERY_NEEDED', {
				bnbFallback: 'signing failed',
				error: signError?.message ?? 'unknown error'
			});
			return null;
		}

		const { data: txHash, error: submitError } = await tryCatch(
			this.provider.broadcastTransaction(signedTx)
		);
		if (submitError !== null || txHash === null) {
			logDelegationBreadcrumb('RECOVERY_NEEDED', {
				bnbFallback: 'submission failed',
				error: submitError?.message ?? 'unknown error'
			});
			return null;
		}

		logDelegationBreadcrumb('TX2_SUBMITTED', {
			bnbFallback: 'success',
			txHash: txHash.hash
		});

		return txHash.hash;
	}

	// -----------------------------------------------------------------------
	// Paymaster health check
	// -----------------------------------------------------------------------

	/**
	 * Check the health of the paymaster and gas infrastructure.
	 *
	 * Verifies:
	 * - RPC provider is responsive (can fetch a block number)
	 * - Paymaster contract is funded (has sufficient BNB deposit)
	 * - USDT/BNB oracle price feed is not stale
	 *
	 * @returns Paymaster health status
	 */
	async checkPaymasterHealth(): Promise<PaymasterHealth> {
		let funded = false;
		let estimatedRemainingTx = 0;
		let oracleStalenessSeconds = -1;

		// 1. Check RPC connectivity
		const { data: blockNumber, error: blockError } = await tryCatch(this.provider.getBlockNumber());

		if (blockError !== null || blockNumber === null || blockNumber <= 0) {
			return {
				funded: false,
				estimatedRemainingTx: 0,
				oracleStalenessSeconds: -1
			};
		}

		// 2. Check paymaster funding
		// Phase 2.6: query the actual Candide paymaster contract balance.
		// For now, attempt to query and handle gracefully.
		const { data: oracleRate } = await tryCatch(this.fetchOracleRate());

		if (oracleRate !== null && oracleRate > 0n) {
			// If the oracle is returning a rate, the paymaster is likely funded
			funded = true;
			estimatedRemainingTx = 100; // Placeholder -- Phase 2.6 will query actual remaining capacity
			oracleStalenessSeconds = 0; // Placeholder -- Phase 2.6 will check last update timestamp
		} else {
			funded = false;
			estimatedRemainingTx = 0;
			oracleStalenessSeconds = 3600; // 1 hour stale (oracle unavailable)
		}

		logDelegationBreadcrumb('IDLE', {
			healthCheck: 'completed',
			paymasterFunded: String(funded),
			estimatedRemainingTx,
			oracleStalenessSeconds
		});

		return {
			funded,
			estimatedRemainingTx,
			oracleStalenessSeconds
		};
	}

	// -----------------------------------------------------------------------
	// Delegation recovery
	// -----------------------------------------------------------------------

	/**
	 * Recover from an incomplete delegation lifecycle.
	 *
	 * **Algorithm (USDT Integration Plan Section 2.6):**
	 * 1. `getCode(address)` on-chain FIRST (not journal) -- verify real state
	 * 2. If code empty -- reconcile to IDLE silently, no user action needed
	 * 3. If code non-empty -- submit Tx2 with gas from paymaster
	 * 4. If Tx2 fails after 3 retries -- attempt hidden BNB fallback.
	 *    If no BNB available, surface recovery-needed result.
	 * 5. If paymaster is paused -- attempt hidden BNB fallback immediately.
	 *
	 * @param senderAddress - The EOA address to check (lowercased)
	 * @returns Recovery result
	 */
	async recoverDelegation(senderAddress: string): Promise<RecoveryResult> {
		const normalizedAddress = senderAddress.toLowerCase();

		// Step 1: Check on-chain code FIRST
		const { data: onChainCode, error: codeError } = await tryCatch(
			this.provider.getCode(normalizedAddress)
		);

		if (codeError !== null) {
			return {
				recovered: false,
				reason: `Failed to query on-chain code: ${codeError.message}`
			};
		}

		// Step 2: Code is empty -- EOA is clean
		if (onChainCode === EMPTY_CODE) {
			// Verify against journal as well
			const journalCheck = await this.reconcileJournalForCleanState(normalizedAddress);
			// Only transition if we're not already in IDLE (self-transition is not valid)
			if (this.session.currentState !== 'IDLE') {
				await this.transitionTo('IDLE', {
					recovery: 'on-chain code is empty, reconciled to IDLE',
					journalReconciled: String(journalCheck)
				});
			}
			return {
				recovered: true,
				reason: 'On-chain code is empty. Account is already a pure EOA.'
			};
		}

		// Step 3: Code is non-empty -- submit cleanup transaction
		logDelegationBreadcrumb('RECOVERY_NEEDED', {
			reason: 'non-empty code detected on chain',
			address: normalizedAddress,
			codeLength: String(onChainCode.length)
		});

		await this.transitionTo('RECOVERY_NEEDED', {
			reason: 'non-empty code found during recovery',
			address: normalizedAddress
		});

		// Step 4: Attempt Tx2 submission (with retries)
		for (let attempt = 0; attempt < 3; attempt++) {
			const { data: tx2Result, error: tx2Error } = await tryCatch(this.submitAndWaitForTx2());

			if (tx2Error === null && tx2Result !== null) {
				this.session.tx2Hash = tx2Result.txHash;
				await this.updateJournalEntry({ tx2Hash: tx2Result.txHash });

				// Wait for confirmation
				const receipt = await this.waitForTransaction(tx2Result.txHash);
				if (receipt !== null && receipt.status !== 0) {
					// Verify EOA state
					const { data: postCode } = await tryCatch(this.provider.getCode(normalizedAddress));
					if (postCode === EMPTY_CODE) {
						await this.transitionTo('IDLE', { recovery: 'successful' });
						return {
							recovered: true,
							tx2Hash: tx2Result.txHash,
							reason: 'Cleanup transaction succeeded. EOA state restored.'
						};
					}
				}
			}

			// Wait before retry
			if (attempt < 2) {
				await this.delay(BNB_FALLBACK_RETRY_DELAY_MS * (attempt + 1));
			}
		}

		// Step 5: Tx2 failed after retries -- attempt hidden BNB fallback
		const bnbResult = await this.attemptBnbFallback({
			to: normalizedAddress,
			from: normalizedAddress
		});

		if (bnbResult !== null) {
			this.session.tx2Hash = bnbResult;
			await this.updateJournalEntry({ tx2Hash: bnbResult });

			const receipt = await this.waitForTransaction(bnbResult);
			if (receipt !== null && receipt.status !== 0) {
				const { data: postCode } = await tryCatch(this.provider.getCode(normalizedAddress));
				if (postCode === EMPTY_CODE) {
					await this.transitionTo('IDLE', { recovery: 'bnb-fallback-success' });
					return {
						recovered: true,
						tx2Hash: bnbResult,
						reason: 'Cleanup succeeded via BNB fallback. EOA state restored.'
					};
				}
			}
		}

		// Step 6: All recovery paths exhausted
		return {
			recovered: false,
			reason:
				'All recovery attempts exhausted. The account delegation code could not be cleared. ' +
				'This requires BNB for gas. Your funds are safe -- the delegation code is inert without your private key.'
		};
	}

	// -----------------------------------------------------------------------
	// State management
	// -----------------------------------------------------------------------

	/**
	 * Transition the internal state machine and persist to journal.
	 *
	 * @param newState - The target delegation state
	 * @param metadata - Optional metadata for Sentry breadcrumb and journal update
	 */
	private async transitionTo(
		newState: DelegationState,
		metadata?: Record<string, unknown>
	): Promise<void> {
		const fromState = this.session.currentState;

		// Validate the transition
		assertValidTransition(fromState, newState);

		// Update internal state
		this.session.currentState = newState;

		// Log Sentry breadcrumb
		logDelegationBreadcrumb(newState, {
			fromState,
			...(metadata ?? {})
		});

		// Update journal
		const updates: Record<string, unknown> = {
			status: newState
		};

		if (this.session.tx1Hash !== null) {
			updates.tx1Hash = this.session.tx1Hash;
		}
		if (this.session.tx2Hash !== null) {
			updates.tx2Hash = this.session.tx2Hash;
		}
		if (metadata?.error !== undefined) {
			updates.error = metadata.error;
		}

		if (newState === 'IDLE') {
			updates.completed = true;
		}

		if (this.session.journalEntryId !== null) {
			const { error: updateError } = await tryCatch(
				updateEntry(this.session.journalEntryId, updates as Parameters<typeof updateEntry>[1])
			);
			if (updateError !== null) {
				// Non-critical: log but don't throw
				logDelegationError(
					newState,
					updateError instanceof Error ? updateError : new Error(String(updateError))
				);
			}
		}
	}

	/**
	 * Update the journal entry for the active session.
	 *
	 * @param updates - Partial fields to update in the journal entry
	 */
	private async updateJournalEntry(updates: Parameters<typeof updateEntry>[1]): Promise<void> {
		if (this.session.journalEntryId === null) {
			return;
		}

		const { error } = await tryCatch(updateEntry(this.session.journalEntryId, updates));
		if (error !== null) {
			logDelegationError(
				this.session.currentState,
				error instanceof Error ? error : new Error(String(error))
			);
		}
	}

	// -----------------------------------------------------------------------
	// Journal reconciliation
	// -----------------------------------------------------------------------

	/**
	 * Reconcile the journal for a clean on-chain state.
	 * If the journal has incomplete entries for this address, mark them as
	 * reconciled since on-chain state shows clean EOA.
	 *
	 * @param address - The EOA address to check (lowercased)
	 * @returns `true` if any journal entries were reconciled
	 */
	private async reconcileJournalForCleanState(address: string): Promise<boolean> {
		const { data: incomplete, error } = await getIncompleteDelegations();

		if (error !== null || incomplete === null || incomplete.length === 0) {
			return false;
		}

		let reconciled = false;

		for (const entry of incomplete) {
			if (entry.senderAddress.toLowerCase() !== address) {
				continue;
			}

			// On-chain state is clean; mark this journal entry as reconciled
			const { error: updateError } = await tryCatch(
				updateEntry(entry.id, { completed: true, status: 'IDLE' })
			);

			if (updateError === null) {
				reconciled = true;
				logDelegationBreadcrumb('IDLE', {
					journalReconciliation: 'completed',
					entryId: entry.id,
					previousState: entry.status
				});
			}
		}

		return reconciled;
	}

	// -----------------------------------------------------------------------
	// Transaction waiting
	// -----------------------------------------------------------------------

	/**
	 * Wait for a transaction to be confirmed on chain.
	 *
	 * @param txHash - The transaction hash to wait for
	 * @param confirmations - Number of block confirmations to wait for (default: 1)
	 * @returns The transaction receipt, or null if not found
	 */
	private async waitForTransaction(
		txHash: string,
		confirmations: number = DEFAULT_CONFIRMATIONS
	): Promise<TransactionReceipt | null> {
		const { data: receipt, error } = await tryCatch(
			this.provider.waitForTransaction(txHash, confirmations)
		);

		if (error !== null) {
			logDelegationError(
				this.session.currentState,
				error instanceof Error ? error : new Error(String(error))
			);
			return null;
		}

		return receipt;
	}

	// -----------------------------------------------------------------------
	// Oracle rate fetching
	// -----------------------------------------------------------------------

	/**
	 * Fetch the USDT/BNB exchange rate from the paymaster oracle.
	 *
	 * **Phase 2.6:** This method will query the on-chain oracle contract
	 * at the address specified in the stablecoin registry. For Phase 2.1,
	 * it returns a reasonable fallback rate for development/testing.
	 *
	 * @returns The USDT/BNB rate with 18 decimals, or null if unavailable
	 */
	private async fetchOracleRate(): Promise<bigint | null> {
		// Placeholder -- Phase 2.6 will implement on-chain oracle query.
		// For now, return a hardcoded fallback rate for development.
		// On BSC mainnet, 1 BNB ≈ 600 USDT (as of May 2026).
		// This is 600 * 10^18 = 600_000_000_000_000_000_000n
		const placeholderRate = 600_000_000_000_000_000_000n;

		return placeholderRate;
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	/**
	 * Return a promise that resolves after the given delay.
	 * Used for retry backoff.
	 *
	 * @param ms - Delay in milliseconds
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
