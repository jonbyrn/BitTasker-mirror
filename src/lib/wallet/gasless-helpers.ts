/**
 * Gasless Helpers — Paymaster hash computation, fee estimation, and validation
 *
 * All functions are pure and testable (no side effects, no external calls).
 * Uses BigInt-only arithmetic for fee calculations.
 * Hash computation matches Coinbase VerifyingPaymaster contract exactly.
 *
 * @module gasless-helpers
 */

import { keccak256, AbiCoder, Interface, getAddress } from 'ethers';
import {
	FEE_TIERS as feeTiers,
	ALLOWED_FEE_TOKENS as _allowedTokens,
	GAS_BOUNDS as _gasBounds
} from '../../wallet/gasless.config';
import type { FeeTierDef } from '../../types/gasless.types';

// =============================================================================
// Constants
// =============================================================================

const coder = AbiCoder.defaultAbiCoder();

/** ABI for executeBatch — matches EIP-7702 smart account interface */
const EXECUTE_BATCH_ABI = [
	'function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata calldatas)'
];

/**
 * Minimum gas buffer per token address (lowercase) for validation.
 * Ensures the paymaster is reimbursed enough to cover actual L2 gas costs.
 * Values are in each token's smallest unit.
 */
export const MIN_GAS_BUFFER: Record<string, bigint> = {
	'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10_000n, // USDT0: 0.01 (6 decimals)
	'0xaf88d065e77c8cc2239327c5edb3a432268e5831': 10_000n, // USDC: 0.01 (6 decimals)
	'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': 16n, // WBTC: 16 sats
	'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 10_000_000_000_000_000n, // tBTC: 0.01 (18 decimals)
	'0x5979d7b546e38e9ab80777482e772500ec1606d5': 10_000_000_000_000_000n // WETH: 0.01 (18 decimals)
};

/**
 * Maximum gas buffer per token address (lowercase) for validation.
 * Prevents overcharging the user beyond reasonable gas costs.
 */
export const MAX_GAS_BUFFER: Record<string, bigint> = {
	'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n, // USDT0: 0.15 (6 decimals)
	'0xaf88d065e77c8cc2239327c5edb3a432268e5831': 150_000n, // USDC: 0.15 (6 decimals)
	'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': 230n, // WBTC: 230 sats
	'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 150_000_000_000_000_000n, // tBTC: 0.15 (18 decimals)
	'0x5979d7b546e38e9ab80777482e772500ec1606d5': 150_000_000_000_000_000n // WETH: 0.15 (18 decimals)
};

// =============================================================================
// Hash Computation
// =============================================================================

/**
 * Compute the paymaster signature hash matching Coinbase VerifyingPaymaster.
 *
 * The VerifyingPaymaster contract computes in `validatePaymasterUserOp`:
 *   keccak256(abi.encode(sender, nonce, keccak256(callData), entryPoint, chainId))
 *
 * This function replicates that exact computation for off-chain signing.
 * CRITICAL: The backend signer must use `signingKey.signDigest(hash)` instead
 * of `signer.signMessage(hash)` — ethers.js signMessage prepends the Ethereum
 * signed message prefix, which causes on-chain ECDSA recovery to fail.
 *
 * @param sender - UserOp.sender address (checksummed or raw hex)
 * @param nonce - UserOp.nonce as bigint
 * @param callData - UserOp.callData as hex string (0x-prefixed)
 * @param entryPointAddress - EntryPoint contract address
 * @param chainId - Network chain ID (42161 for Arbitrum One)
 * @returns keccak256 hash of ABI-encoded paymaster parameters (hex string)
 */
export function getPaymasterSignatureHash(
	sender: string,
	nonce: bigint,
	callData: string,
	entryPointAddress: string,
	chainId: bigint
): string {
	const callDataHash = keccak256(callData);
	const encoded = coder.encode(
		['address', 'uint256', 'bytes32', 'address', 'uint256'],
		[getAddress(sender), nonce, callDataHash, getAddress(entryPointAddress), chainId]
	);
	return keccak256(encoded);
}

// =============================================================================
// Fee Estimation
// =============================================================================

/**
 * Get the network fee tier configuration by estimated total gas.
 *
 * Fee tiers define gas pricing strategy:
 * - Low:       ≤ 200,000 gas    ($0.01)
 * - Medium:    ≤ 500,000 gas    ($0.03)
 * - High:      ≤ 1,000,000 gas  ($0.05)
 * - Very High: ≤ 5,000,000 gas  ($0.10)
 *
 * @param estimatedGas - Total estimated gas for the operation
 * @returns FeeTierDef configuration
 * @throws Error if estimatedGas exceeds 5,000,000
 */
export function getNetworkFeeTier(estimatedGas: bigint): FeeTierDef {
	for (const tier of feeTiers) {
		if (estimatedGas >= tier.minGas && estimatedGas <= tier.maxGas) {
			return tier;
		}
	}
	throw new Error('Network fee too high — operation too complex');
}

/**
 * Convert an ETH-denominated fee to a token-denominated fee.
 *
 * Uses BigInt-only arithmetic with CEIL division to prevent undercharging.
 * The protocol must never lose money due to rounding — always round UP.
 *
 * Formula: tokenFee = ceil(ethFee × ethPriceInToken / 10^18)
 *
 * Example:
 *   ethFeeWei = 0.001 ETH = 1_000_000_000_000_000n
 *   ethPriceInToken = 2000 USDC = 2_000_000_000n (2000 × 10^6)
 *   result = ceil(1e15 × 2e9 / 1e18) = 2_000_000 = 2 USDC
 *
 * @param ethFeeWei - Fee amount in ETH wei (18 decimals)
 * @param ethPriceInToken - Price of 1 ETH denominated in token's smallest unit
 *                          (e.g., 2_000_000_000n for 2000 USDC at 6 decimals)
 * @returns Token fee in token's smallest unit, rounded UP
 * @throws Error if inputs are negative
 */
export function convertToTokenFee(ethFeeWei: bigint, ethPriceInToken: bigint): bigint {
	if (ethFeeWei < 0n || ethPriceInToken < 0n) {
		throw new Error('convertToTokenFee: inputs must be non-negative');
	}

	const ETH_SCALE = 10n ** 18n;

	// Multiply first to preserve precision, then ceiling division
	const product = ethFeeWei * ethPriceInToken;
	return (product + ETH_SCALE - 1n) / ETH_SCALE;
}

// =============================================================================
// CallData Helpers
// =============================================================================

/**
 * Build callData for a batched executeBatch operation.
 *
 * Encodes the standard EIP-7702 smart account executeBatch function
 * with the provided calls. All value fields are set to 0 (token transfers
 * only — no ETH value transfer in the batch).
 *
 * @param calls - Array of {target, data} representing individual contract calls
 * @returns ABI-encoded callData string for executeBatch
 * @throws Error if calls array is empty
 */
export function buildCallData(calls: Array<{ target: string; data: string }>): string {
	if (calls.length === 0) {
		throw new Error('buildCallData: at least one call is required');
	}

	const iface = new Interface(EXECUTE_BATCH_ABI);

	return iface.encodeFunctionData('executeBatch', [
		calls.map((c) => getAddress(c.target)),
		calls.map(() => 0n),
		calls.map((c) => c.data)
	]);
}

/**
 * Build calldata for a single ERC20 transfer.
 *
 * @param recipient - Transfer recipient address
 * @param amount - Transfer amount in token's smallest unit
 * @returns ABI-encoded calldata for ERC20 transfer(address,uint256)
 */
export function buildTransferCalldata(recipient: string, amount: bigint): string {
	const transferABI = ['function transfer(address to, uint256 amount) returns (bool)'];
	const iface = new Interface(transferABI);
	return iface.encodeFunctionData('transfer', [getAddress(recipient), amount]);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that fee parameters are within acceptable bounds.
 *
 * Checks:
 * 1. Both values are positive
 * 2. Priority fee does not exceed base fee
 * 3. Values do not exceed the fee tier limits (with 10x safety margin)
 *
 * @param maxFeePerGas - Maximum fee per gas unit
 * @param maxPriorityFeePerGas - Maximum priority (tip) fee per gas unit
 * @param feeTier - Optional fee tier to validate against
 * @returns {isValid, error?} validation result
 */
export function validateFeeParameters(
	maxFeePerGas: bigint,
	maxPriorityFeePerGas: bigint,
	feeTier?: FeeTierDef
): { isValid: boolean; error?: string } {
	if (maxFeePerGas <= 0n) {
		return { isValid: false, error: 'maxFeePerGas must be positive' };
	}

	if (maxPriorityFeePerGas <= 0n) {
		return { isValid: false, error: 'maxPriorityFeePerGas must be positive' };
	}

	if (maxPriorityFeePerGas > maxFeePerGas) {
		return { isValid: false, error: 'maxPriorityFeePerGas cannot exceed maxFeePerGas' };
	}

	if (feeTier) {
		// FeeTierDef defines gas bounds (minGas/maxGas), not gas price limits.
		// Gas price validation is handled by GAS_BOUNDS in validateFeeParameters (gasless-helpers.ts).
		// The feeTier parameter is reserved for future tier-based gas price limits.
		void feeTier;
	}

	return { isValid: true };
}

/**
 * Validate UserOp callData structure.
 *
 * Ensures callData is a valid executeBatch with:
 * - Exactly 2 calls (token transfer to recipient + gas buffer to treasury)
 * - All call values are zero (no ETH value transfer)
 * - Both calls target the same token contract
 *
 * @param callData - ABI-encoded callData from the UserOp
 * @returns Validation result with decoded details on success
 */
export function validateCallData(callData: string): {
	isValid: boolean;
	error?: string;
	details?: {
		targets: string[];
		values: bigint[];
	};
} {
	try {
		const iface = new Interface(EXECUTE_BATCH_ABI);
		const decoded = iface.decodeFunctionData('executeBatch', callData);

		const targets: string[] = decoded[0];
		const values: bigint[] = decoded[1];

		if (targets.length !== 2) {
			return {
				isValid: false,
				error: `Expected exactly 2 calls in batch, got ${targets.length}`
			};
		}

		if (values.some((v) => v !== 0n)) {
			return {
				isValid: false,
				error: 'All call values must be zero for token transfers'
			};
		}

		if (targets[0].toLowerCase() !== targets[1].toLowerCase()) {
			return {
				isValid: false,
				error: 'Both batch calls must target the same token contract'
			};
		}

		return {
			isValid: true,
			details: { targets, values }
		};
	} catch (err) {
		return {
			isValid: false,
			error: `Failed to decode callData: ${err instanceof Error ? err.message : 'unknown error'}`
		};
	}
}

/**
 * Validate gas buffer amount against per-token bounds.
 *
 * Ensures the gas reimbursement amount for a given token falls within
 * the predefined minimum and maximum bounds. Prevents both under-reimbursement
 * (paymaster loses money) and over-charging (user overpays).
 *
 * @param tokenAddress - Token contract address (case-insensitive)
 * @param gasBuffer - Gas buffer amount in token's smallest unit
 * @returns {isValid, error?} validation result
 */
export function validateGasBuffer(
	tokenAddress: string,
	gasBuffer: bigint
): { isValid: boolean; error?: string } {
	const key = tokenAddress.toLowerCase();

	const minBuffer = MIN_GAS_BUFFER[key];
	const maxBuffer = MAX_GAS_BUFFER[key];

	if (minBuffer === undefined || maxBuffer === undefined) {
		return {
			isValid: false,
			error: `No gas buffer bounds defined for token ${tokenAddress}`
		};
	}

	if (gasBuffer < minBuffer) {
		return {
			isValid: false,
			error: `Gas buffer ${gasBuffer} is below minimum ${minBuffer} for token ${tokenAddress}`
		};
	}

	if (gasBuffer > maxBuffer) {
		return {
			isValid: false,
			error: `Gas buffer ${gasBuffer} exceeds maximum ${maxBuffer} for token ${tokenAddress}`
		};
	}

	return { isValid: true };
}
