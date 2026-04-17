/**
 * Maps legacy v1 Kind 31006 `s` tag values (`EscrowStatus` from escrow.enum.ts)
 * to canonical {@link ContractStatus}. Used when the event wire `v` tag is legacy (`v1` / `0.0.1`)
 * or when the event was parsed from legacy JSON (`NDKContractStatus` `_legacyContent`).
 *
 * @see docs/payments-v2/v1-contract-rune-integration-plan.md §5.2–§5.3
 */

import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import { ContractStatus } from '$lib/utils/contract/types';

/** `v` tag on 31006: legacy EscrowStatus semantics in `s`. */
export function isLegacyContractStatusWireVersion(version: string | undefined): boolean {
	if (version === undefined || version === '') return false;
	return version === 'v1' || version === '0.0.1';
}

/**
 * @param legacyS — Raw integer from `s` tag (legacy **EscrowStatus**, not `ContractStatus`).
 * @param chainState — Optional `SecurePaymentLegacy.state` when `legacyS === PendingTimelockResolution`.
 */
export function normalizeLegacyEscrowStatusTagToContractStatus(
	legacyS: number,
	chainState?: number
): ContractStatus | undefined {
	switch (legacyS) {
		case EscrowStatus.Funded:
			return ContractStatus.Funded;
		case EscrowStatus.InDispute:
			return ContractStatus.InDispute;
		case EscrowStatus.DisputeResolved:
			return ContractStatus.DisputeResolved;
		case EscrowStatus.DisputeUnresolved:
			return ContractStatus.DisputeUnresolved;
		case EscrowStatus.Completed:
			return ContractStatus.Completed;
		case EscrowStatus.Cancelled:
			return ContractStatus.Cancelled;

		case EscrowStatus.PendingFunding:
			return ContractStatus.Funded;

		case EscrowStatus.InProgress:
			return ContractStatus.WorkInProgress;

		case EscrowStatus.PendingCompletion:
			return ContractStatus.Completed;

		case EscrowStatus.PendingCancellation:
			return ContractStatus.Cancelled;

		case EscrowStatus.FundsReleased:
			return ContractStatus.FundsReleased;

		case EscrowStatus.PendingAcceptance:
			return ContractStatus.FundsReleased;

		case EscrowStatus.DisputeResolutionProposed:
			return ContractStatus.InDispute;

		case EscrowStatus.PendingDispute:
			return ContractStatus.InDispute;

		case EscrowStatus.PendingResolutionProposal:
			return ContractStatus.InDispute;

		case EscrowStatus.PendingProposalAcceptance:
			return ContractStatus.DisputeResolved;

		case EscrowStatus.PendingTimelockResolution:
			if (chainState === ContractStatus.Completed) return ContractStatus.Completed;
			if (chainState === ContractStatus.InDispute) return ContractStatus.InDispute;
			return undefined;

		default:
			return undefined;
	}
}

export function isValidContractStatusEnumValue(n: number): n is ContractStatus {
	return (
		Number.isInteger(n) && n >= ContractStatus.Funded && n <= ContractStatus.InDisputeWorkInProgress
	);
}
