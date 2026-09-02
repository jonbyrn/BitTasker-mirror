/**
 * v1 EscrowContract keeps `state === Completed` on-chain after acceptTask and after completed-path
 * resolveAfterTimelock — funds-paid is reflected in Kind 31006 (`s` = FundsReleased), not in storage.
 * This module fuses chain snapshot + status history into an effective {@link ContractStatus} for UI and permissions.
 */
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ContractStatus } from '../types';

/**
 * On-chain terminal states (v1 EscrowContract.sol — no FundsReleased in storage).
 * @see {@link isTerminalV1EffectiveState} for UI/permissions terminal (includes Nostr-only outcomes).
 */
export function isTerminalV1ChainState(state: number): boolean {
	return (
		state === ContractStatus.DisputeResolved ||
		state === ContractStatus.DisputeUnresolved ||
		state === ContractStatus.Cancelled
	);
}

/**
 * Terminal for permissions, subscriptions, and clocks: chain terminal **or** Nostr-confirmed payout
 * (`FundsReleased` while chain can still read `Completed`).
 */
export function isTerminalV1EffectiveState(state: number): boolean {
	return isTerminalV1ChainState(state) || state === ContractStatus.FundsReleased;
}

/**
 * When chain is `Completed`, if **any** Kind 31006 in history has normalized `status === FundsReleased`,
 * treat the contract as **FundsReleased** for display and permitted-actions input.
 * Otherwise returns the chain state unchanged (including `Completed`).
 */
export function deriveV1EffectiveContractStatus(
	chainState: number,
	statusEvents: readonly NDKContractStatus[]
): ContractStatus {
	if (chainState !== ContractStatus.Completed) {
		return chainState as ContractStatus;
	}
	for (const ev of statusEvents) {
		if (ev.status === ContractStatus.FundsReleased) {
			return ContractStatus.FundsReleased;
		}
	}
	return ContractStatus.Completed;
}
