import type { ContractStatusEvent, NostrContractStatus } from '$lib/types/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ContractStatus } from '$lib/utils/contract/types';
import { EscrowStatus } from '$lib/utils/escrow';

/**
 * Kind 31006 may carry either legacy **EscrowStatus** (`s` tag) or v2 **ContractStatus** on the wire.
 * `ContractTimeline` expects **`NostrContractStatus.action`** as **EscrowStatus**.
 */
function chainContractStatusToEscrowTimeline(cs: ContractStatus): EscrowStatus {
	switch (cs) {
		case ContractStatus.Funded:
			return EscrowStatus.Funded;
		case ContractStatus.InDispute:
			return EscrowStatus.InDispute;
		case ContractStatus.DisputeResolved:
			return EscrowStatus.DisputeResolved;
		case ContractStatus.DisputeUnresolved:
			return EscrowStatus.DisputeUnresolved;
		case ContractStatus.Completed:
			return EscrowStatus.Completed;
		case ContractStatus.Cancelled:
			return EscrowStatus.Cancelled;
		case ContractStatus.Refunded:
			return EscrowStatus.FundsReleased;
		case ContractStatus.FundsReleased:
		case ContractStatus.FundsClaimed:
		case ContractStatus.NoShow:
			return EscrowStatus.FundsReleased;
		case ContractStatus.WorkInProgress:
			return EscrowStatus.InProgress;
		case ContractStatus.InDisputeWorkInProgress:
			return EscrowStatus.InDispute;
		default:
			return EscrowStatus.Funded;
	}
}

function resolveEscrowAction(ev: NDKContractStatus): EscrowStatus {
	const leg = ev.legacyContent;
	if (leg && typeof leg.action === 'number') {
		return leg.action as EscrowStatus;
	}
	const raw = ev.status;
	if (raw === undefined) return EscrowStatus.Funded;
	if (ev.version === 'v2') {
		return chainContractStatusToEscrowTimeline(raw);
	}
	return raw as unknown as EscrowStatus;
}

function statusTimestampMs(ev: NDKContractStatus): number {
	const leg = ev.legacyContent as { timestamp?: number } | undefined;
	if (leg && typeof leg.timestamp === 'number') return leg.timestamp;
	return (ev.created_at ?? 0) * 1000;
}

/**
 * Maps NDK status events to the legacy **`ContractStatusEvent`** shape expected by **`ContractTimeline`**.
 */
export function ndkContractStatusesToContractStatusEvents(
	events: NDKContractStatus[]
): ContractStatusEvent[] {
	return events.map((ev) => {
		const action = resolveEscrowAction(ev);
		const content: NostrContractStatus = {
			contractEventId: ev.parentContractEventId ?? '',
			escrowId: ev.paymentId ?? '',
			action,
			timestamp: statusTimestampMs(ev),
			type: 'contract-status',
			transactionHash: ev.transactionHash,
			proposedClientAmount: ev.proposedTaskerAmount,
			proposedFreelancerAmount: ev.proposedTaskeeAmount,
			completionAttachments: ev.completionAttachments
		};

		return {
			id: ev.id,
			pubkey: ev.pubkey ?? '',
			created_at: ev.created_at ?? 0,
			kind: ev.kind,
			tags: ev.tags as string[][],
			sig: ev.sig ?? '',
			content
		} as ContractStatusEvent;
	});
}
