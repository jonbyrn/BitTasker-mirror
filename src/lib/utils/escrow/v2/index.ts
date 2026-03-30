/**
 * Escrow V2 Module
 *
 * Phase 1: Dry-run creation flow (validation, gas estimation, staticCall).
 * See docs/payments-v2/escrow-creation-report.md for full specification.
 */

import { FEE_TIERS } from '@bittasker/wallet-core';

export {
	ContractCreationParamsError,
	deriveContractCreationParams,
	deriveV2CreationDisplay,
	createEscrowFromBidOrchestrator,
	estimateGasForCreatePaymentContract,
	type CreateEscrowOrchestratorOptions
} from './creation';

/** Fee percentage display (e.g. "2.5%") — for UI */
export function getFeePercentageDisplay(tier: number): string {
	return FEE_TIERS[tier]?.label || FEE_TIERS[1]?.label || '2.5%';
}

/** Format RBTC amount for display */
export function formatRBTCAmount(amount: string): string {
	const num = parseFloat(amount);
	if (isNaN(num)) return '0.000000';
	return num.toFixed(6);
}

export { GAS_REIMBURSEMENT_PER_OP, CANCELLATION_FEE_MVP, UPFRONT_DEPOSIT_MVP } from './types';

export type {
	CreatePaymentContractParams,
	V2CreationDisplay,
	V2DryRunResult,
	V2GasEstimateResult,
	V2OrchestratorResult,
	DeriveInput
} from './types';

export { EscrowStatus } from './escrow.enum';
export { default as abi } from './abi.json';
