/**
 * Maps legacy v1 Kind 31006 `s` tag values (`EscrowStatus` from escrow.enum.ts)
 * to canonical {@link ContractStatus}. Used when the event wire `v` tag is legacy (`v1` / `0.0.1`)
 * or when the event was parsed from legacy JSON (`NDKContractStatus` `_legacyContent`).
 *
 * @see docs/payments-v2/v1-contract-rune-integration-plan.md §5.2–§5.3
 */

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
		case 0:
			return ContractStatus.Funded;
		case 1:
			return ContractStatus.InDispute;
		case 2:
			return ContractStatus.DisputeResolved;
		case 3:
			return ContractStatus.DisputeUnresolved;
		case 4:
			return ContractStatus.Completed;
		case 5:
			return ContractStatus.Cancelled;

		case 6:
			return ContractStatus.Funded;

		case 7:
			return ContractStatus.WorkInProgress;

		case 8:
			return ContractStatus.Completed;

		case 9:
			return ContractStatus.Cancelled;

		case 10:
			return ContractStatus.FundsReleased;

		case 11:
			return ContractStatus.FundsReleased;

		case 12:
			return ContractStatus.InDispute;

		case 13:
			return ContractStatus.InDispute;

		case 14:
			return ContractStatus.InDispute;

		case 15:
			return ContractStatus.DisputeResolved;

		case 16:
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
