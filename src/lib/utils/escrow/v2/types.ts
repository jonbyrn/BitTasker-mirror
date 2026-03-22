/**
 * v2 Escrow Creation Types and Constants
 *
 * Types and constants for the v2 payment contract creation flow.
 * See docs/payments-v2/escrow-creation-report.md for full specification.
 */

import type { NostrBidContent } from '$lib/types/bid';
import type { Task } from '$lib/types/task';

/** v2 contract constant (from Solidity) — ~252 sats wei. Do not fetch from contract. */
export const GAS_REIMBURSEMENT_PER_OP = 2_523_514_500_000n;

/** MVP: cancellation fee and upfront deposit are zero */
export const CANCELLATION_FEE_MVP = 0n;
export const UPFRONT_DEPOSIT_MVP = 0n;

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

/**
 * Display-friendly result from deriveV2CreationParams
 * Used by UI for rendering amounts, times, etc.
 */
export interface V2CreationDisplay {
	baseAmount: string;
	totalAmount: string;
	taskerFee: string;
	taskeeFee: string;
	/** Gas reimbursement (2 × GAS_REIMBURSEMENT) in RBTC — used for gasless ops; shown with estimated network fee in UI */
	gasReimbursementAmount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	wasTimeAdjusted: boolean;
	taskee: string;
	taskerFeeTier: number;
	taskeeFeeTier: number;
}

/**
 * Combined derivation result: params for contract call + display data for UI
 */
export interface V2DerivationResult {
	params: CreatePaymentContractParams;
	display: V2CreationDisplay;
}

/**
 * Result of createEscrowFromBid when dryRun: true
 */
export type V2DryRunResult =
	| {
			success: true;
			estimatedGas: bigint;
			estimatedCostWei: bigint;
			estimatedCostFormatted: string;
			simulatedPaymentId: number;
			params: CreatePaymentContractParams;
	  }
	| {
			success: false;
			error: string;
			validationErrors?: string[];
	  };

/** Input for derivation: bid content and task content (parsed) */
export interface DeriveInput {
	bid: NostrBidContent;
	task: Task;
	btcPrice: number;
}

/** Result of estimateGasForCreatePaymentContract */
export type V2GasEstimateResult =
	| {
			success: true;
			estimatedGas: bigint;
			estimatedCostWei: bigint;
			estimatedCostFormatted: string;
	  }
	| { success: false; error: string };
