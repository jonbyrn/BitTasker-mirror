/**
 * USDT Escrow Contract Creation (v2)
 *
 * USDT-specific escrow parameter derivation for BSC-based escrows.
 * Mirrors the structure of ./creation.ts but for USDT token:
 *  - Uses `amount * 10**18` (no BTC price division)
 *  - Sets chain='bsc', currency='USDT'
 *  - Reads contract addresses from stablecoin-registry (BSC network)
 *
 * Integration points with existing creation.ts pipeline:
 *  ─────────────────────────────────────────────────────────────
 *  1. `deriveUSDTEscrowParams()` — standalone param derivation (this file).
 *     Call instead of `deriveContractCreationParams()` when token === 'USDT'.
 *
 *  2. `estimateGasForCreatePaymentContract` (creation.ts:162) — can be reused
 *     as-is for USDT escrows; the blockchain write path is chain-agnostic via
 *     the `chain` field in ExecuteWriteOptions (blockchainWrites.ts:106).
 *
 *  3. `createPaymentContract` (blockchainWrites.ts:428) — the BSC contract
 *     uses the same ABI function signature. The `chain` parameter in
 *     ExecuteWriteOptions selects the BSC provider/contract.
 *
 *  4. `createContract()` (creation.ts:258) — orchestrator that needs a
 *     token-aware branch: when token === 'USDT', call the USDT derivation +
 *     BSC blockchain writes + platform-fee-adjusted Nostr event.
 *
 *  5. `blockchainWrites.ts:prepareWrite()` — already supports `chain: 'bsc'`
 *     (blockchainWrites.ts:105). USDT writes pass `chain: 'bsc'` and the BSC
 *     contract address from stablecoin-registry.
 *
 *  6. `contractRegistry.ts` — the `getEscrowContractAddress('bsc', 'testnet')`
 *     path is added in this phase (see contractRegistry.ts modifications).
 *
 * For token-aware dispatch, use `deriveEscrowParams()` from the service layer
 * at `src/lib/services/escrow/escrow-usdt.service.ts`.
 */
import { ethers } from 'ethers';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { createDebug } from '$lib/utils/debug';
import { coerceUnixSeconds } from '$lib/utils/helpers/dateFormatter';
import {
	GAS_REIMBURSEMENT_PER_OP,
	type CreatePaymentContractParams,
	type ContractCreationDisplay
} from '$lib/utils/contract/v2/types';
import { assertValidCreatePaymentContractParams } from '$lib/utils/contract/v2/createPaymentContractParams';
import { getTokenConfig } from '$lib/services/stablecoin-registry';

const d = createDebug('contract:v2:usdt');

/** BSC chain ID for testnet (97) and mainnet (56) */
export const BSC_CHAIN_IDS = {
	mainnet: 56,
	testnet: 97
} as const;

/** Default USDT fee tier — 5% per side for USDT escrows (matching plan spec) */
const USDT_DEFAULT_FEE_TIER = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface USDTEscrowCreationInput {
	/** Taskee (freelancer) wallet address */
	taskee: string;
	/** Amount in USD (human-readable, e.g. 50.00) */
	amount: number;
	/** Fee tier for tasker (client). Defaults to tier 1 (5%). */
	taskerFeeTier?: number;
	/** Fee tier for taskee (freelancer). Defaults to tier 1 (5%). */
	taskeeFeeTier?: number;
	/** Cancellation fee in wei */
	cancellationFee?: bigint;
	/** Upfront deposit in wei */
	upfrontDeposit?: bigint;
	/** Estimated start time (Unix seconds). Auto-adjusted if in the past. */
	estimatedStartTime?: number;
	/** Estimated completion time (Unix seconds). Auto-adjusted if needed. */
	estimatedCompletionTime?: number;
}

export interface USDTEscrowDerivationResult {
	params: CreatePaymentContractParams;
	display: ContractCreationDisplay;
	/** The BSC chain ID used for this escrow */
	chainId: number;
	/** USDT token contract address on BSC */
	tokenAddress: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertValidUSDTInput(input: USDTEscrowCreationInput): void {
	if (!Number.isFinite(input.amount) || input.amount <= 0) {
		throw new Error('Invalid USDT amount: amount must be a finite number greater than 0');
	}
	if (!input.taskee || !ethers.isAddress(input.taskee)) {
		throw new Error('Invalid taskee address: must be a valid Ethereum address');
	}
}

// ---------------------------------------------------------------------------
// Network resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the active BSC chain ID from environment variable.
 * Falls back to testnet when not set.
 */
export function getActiveBSCChainId(): number {
	const env = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	if (env === 'mainnet') return BSC_CHAIN_IDS.mainnet;
	return BSC_CHAIN_IDS.testnet;
}

/**
 * Resolve the BSC escrow contract address (v2) for the active network.
 * Reads from environment: VITE_BSC_CONTRACT_ADDRESS_V2_MAINNET or VITE_BSC_CONTRACT_ADDRESS_V2_TESTNET.
 */
export function getBSCV2ContractAddress(): string {
	const env = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	const address =
		env === 'mainnet'
			? import.meta.env.VITE_BSC_CONTRACT_ADDRESS_V2_MAINNET
			: import.meta.env.VITE_BSC_CONTRACT_ADDRESS_V2_TESTNET;
	if (!address) {
		throw new Error(
			`BSC v2 contract address not configured. Set VITE_BSC_CONTRACT_ADDRESS_V2_${env === 'mainnet' ? 'MAINNET' : 'TESTNET'}`
		);
	}
	return ethers.getAddress(address.trim()).toLowerCase();
}

/**
 * Resolve the USDT token address on the active BSC network.
 * Reads from stablecoin-registry config for token-aware validation.
 */
export function getUSDTTokenAddress(): string {
	const chainId = getActiveBSCChainId();
	const token = getTokenConfig('USDT', chainId);
	if (!token) {
		throw new Error(`USDT token not found in stablecoin registry for BSC chain ID ${chainId}`);
	}
	return token.address.toLowerCase();
}

// ---------------------------------------------------------------------------
// Schedule normalization
// ---------------------------------------------------------------------------

function normalizeEscrowSchedule(
	estimatedStartTime?: number,
	estimatedCompletionTime?: number,
	nowSeconds = Math.floor(Date.now() / 1000)
): {
	startTime: number;
	completionTime: number;
	wasTimeAdjusted: boolean;
} {
	let startTime: number;
	let completionTime: number;

	if (estimatedStartTime != null && estimatedCompletionTime != null) {
		const startSeconds = coerceUnixSeconds(estimatedStartTime);
		const endSeconds = coerceUnixSeconds(estimatedCompletionTime);
		if (startSeconds != null && endSeconds != null) {
			startTime = startSeconds;
			completionTime = endSeconds;
		} else {
			startTime = nowSeconds + 3600;
			completionTime = startTime + 3600;
		}
	} else {
		startTime = nowSeconds + 3600;
		completionTime = startTime + 3600;
	}

	let wasTimeAdjusted = false;

	if (startTime <= nowSeconds) {
		const newStartTime = nowSeconds + 3600;
		const timeShift = newStartTime - startTime;
		startTime = newStartTime;
		completionTime = completionTime + timeShift;
		wasTimeAdjusted = true;
	}

	if (completionTime <= startTime) {
		throw new Error('Completion time must be after start time');
	}

	if (
		startTime < 0 ||
		startTime > 0xffff_ffff ||
		completionTime < 0 ||
		completionTime > 0xffff_ffff
	) {
		throw new Error('Estimated times must be within uint32 range');
	}

	return { startTime, completionTime, wasTimeAdjusted };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive USDT escrow contract creation params from a user input.
 *
 * For USDT, the amount is converted directly as `amount * 10**18` (18 decimals).
 * No BTC price division is performed. Fee calculation mirrors the rBTC path
 * but uses USDT wei amounts.
 *
 * @param input - Escrow creation input with USDT amount, taskee address, schedule
 * @returns Contract params + display info + chain metadata
 *
 * Integration note: This is the USDT equivalent of
 * `deriveContractCreationParams()` in ./creation.ts. The returned
 * `CreatePaymentContractParams` can be passed to the same
 * `createPaymentContract()` in blockchainWrites.ts when called with
 * `chain: 'bsc'` and the BSC contract address.
 */
export function deriveUSDTEscrowParams(input: USDTEscrowCreationInput): USDTEscrowDerivationResult {
	assertValidUSDTInput(input);

	const taskeeEip55 = ethers.getAddress(input.taskee.toLowerCase());

	// USDT on BSC uses 18 decimals — amount * 10^18, no BTC price division
	const baseAmountUsdt = BigInt(Math.round(input.amount * 10 ** 18));
	const baseAmountFormatted = input.amount.toFixed(2);

	const taskerFeeTier = input.taskerFeeTier ?? USDT_DEFAULT_FEE_TIER;
	const taskeeFeeTier = input.taskeeFeeTier ?? USDT_DEFAULT_FEE_TIER;
	const taskerFeePercentage = FEE_TIERS[taskerFeeTier as keyof typeof FEE_TIERS]?.percentage ?? 250;
	const taskeeFeePercentage = FEE_TIERS[taskeeFeeTier as keyof typeof FEE_TIERS]?.percentage ?? 250;

	const taskerFeeWei = (baseAmountUsdt * BigInt(taskerFeePercentage)) / 10000n;
	const taskeeFeeWei = (baseAmountUsdt * BigInt(taskeeFeePercentage)) / 10000n;

	const cancellationFee = input.cancellationFee ?? 0n;
	const upfrontDeposit = input.upfrontDeposit ?? 0n;

	// Gas reimbursement in USDT wei (same constant, but represents USDT value)
	const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
	// For ERC-20 escrow, msg.value is 0; totalValueWei represents the total
	// USDT amount the contract will transfer from the tasker
	const totalValueWei = 0n;

	const schedule = normalizeEscrowSchedule(input.estimatedStartTime, input.estimatedCompletionTime);

	const params: CreatePaymentContractParams = {
		taskee: taskeeEip55,
		estimatedStartTime: schedule.startTime,
		estimatedCompletionTime: schedule.completionTime,
		taskerFeeTier,
		taskeeFeeTier,
		cancellationFee,
		upfrontDeposit,
		totalValueWei,
		baseAmountWei: baseAmountUsdt,
		taskerFeeWei,
		taskeeFeeWei
	};

	assertValidCreatePaymentContractParams(params);

	const chainId = getActiveBSCChainId();
	const tokenAddress = getUSDTTokenAddress();

	const display: ContractCreationDisplay = {
		chain: 'bsc',
		currency: 'USDT',
		baseAmount: baseAmountFormatted,
		taskerFee: ethers.formatUnits(taskerFeeWei, 18),
		totalAmount: ethers.formatUnits(baseAmountUsdt + taskerFeeWei + gasReimbursementWei, 18),
		gasReimbursementAmount: ethers.formatUnits(gasReimbursementWei, 18),
		startTime: schedule.startTime,
		completionTime: schedule.completionTime,
		wasTimeAdjusted: schedule.wasTimeAdjusted
	};

	d.log('deriveUSDTEscrowParams', {
		amount: baseAmountFormatted,
		baseAmountWei: baseAmountUsdt.toString(),
		taskerFeeWei: taskerFeeWei.toString(),
		chainId,
		tokenAddress: tokenAddress.slice(0, 10) + '...'
	});

	return { params, display, chainId, tokenAddress };
}
