/**
 * v2 Escrow Creation Types and Constants
 *
 * Types and constants for the v2 payment contract creation flow.
 * See docs/payments-v2/escrow-creation-report.md for full specification.
 */

import type { ContractTransactionResponse, TransactionReceipt } from 'ethers';

/** v2 contract constant (from Solidity) — ~252 sats wei. Do not fetch from contract. */
export const GAS_REIMBURSEMENT_PER_OP = 2_523_514_500_000n;

/**
 * Parameters for createPaymentContract (v2)
 * Fee tiers map directly from v1: taskerFeeTier = clientFeeTier, taskeeFeeTier = freelancerFeeTier
 */
export interface CreatePaymentContractParams {
	taskee: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	taskerFeeTier: number;
	taskeeFeeTier: number;
	cancellationFee: bigint;
	upfrontDeposit: bigint;
	/** Total value to send (msg.value): base + taskerFee + (2 × GAS_REIMBURSEMENT_PER_OP). Taskee fee is deducted from base inside contract. */
	totalValueWei: bigint;
	/** Base amount in wei (before fees) */
	baseAmountWei: bigint;
	/** Tasker (client) fee in wei */
	taskerFeeWei: bigint;
	/** Taskee (freelancer) fee in wei */
	taskeeFeeWei: bigint;
}

/** Display-friendly fields from `deriveContractCreationParams` (contract creation module). */
export interface ContractCreationDisplay {
	chain: 'rsk' | 'bsc';
	currency: string;
	baseAmount: string;
	taskerFee: string;
	totalAmount: string;
	gasReimbursementAmount: string;
	startTime: number;
	completionTime: number;
	wasTimeAdjusted: boolean;
}

/** Result of estimateGasForCreatePaymentContract */
export type GasEstimateResult =
	| {
			success: true;
			estimatedGas: bigint;
			estimatedCostWei: bigint;
			estimatedCostFormatted: string;
	  }
	| { success: false; error: string };

/** Result of {@link createPaymentContract} — tx is pending until mined; does not call `tx.wait()`. */
export interface CreatePaymentContractTxResult {
	tx: ContractTransactionResponse;
	estimatedCostFormatted: string;
}

/** One failed task from {@link runParallelNamed} (in `$lib/utils/contract/parallelEffects`). */
export interface ParallelEffectFailure {
	name: string;
	error: unknown;
}

/** Aggregate result for parallel post-broadcast effects — failures are non-fatal for the chain tx. */
export interface ParallelEffectsReport {
	failures: ParallelEffectFailure[];
}

/**
 * Result of {@link createContract} / {@link createEscrowFromBidOrchestrator}.
 * Caller should `await tx.wait()` in the UI, then `await afterConfirmed(receipt)` for paymentId + Nostr republish.
 */
export type ContractCreationResult =
	| {
			success: true;
			transactionHash: string;
			estimatedCostFormatted?: string;
			/** Pending tx — use `await tx.wait()` in the UI for confirmation state */
			tx: ContractTransactionResponse;
			/**
			 * Post-broadcast work (Nostr publish, DMs, task replaceable, push) — already started; await for completion / failures.
			 */
			afterBroadcast: Promise<ParallelEffectsReport>;
			/**
			 * Call after `tx.wait()` with the mined receipt — parses `paymentId`, republishes Nostr with paymentId.
			 */
			afterConfirmed: (receipt: TransactionReceipt) => Promise<{ paymentId: number }>;
	  }
	| {
			success: false;
			error: string;
			validationErrors?: string[];
	  };
