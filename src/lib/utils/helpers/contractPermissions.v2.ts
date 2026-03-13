import type { NostrContract, ContractStatusEvent, ContractPermissions } from '$lib/types/contract';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

function createDisabledPermissions(): ContractPermissions {
	return {
		canComplete: false,
		canAccept: false,
		canDispute: false,
		canPropose: false,
		canAcceptProposal: false,
		canCancel: false,
		canResolveTimelock: false,
		canDelete: false
	};
}

function canMarkWorkInProgress(escrowData: EscrowData, now: number): boolean {
	const startTimeSeconds =
		escrowData.estimatedStartTime > 1000000000000
			? escrowData.estimatedStartTime / 1000
			: escrowData.estimatedStartTime;

	return now >= startTimeSeconds && escrowData.status === EscrowStatus.Funded;
}

function canClientCancel(escrowData: EscrowData, now: number): boolean {
	const oneHour = 3600;
	const twentyFourHours = 86400;
	const createdAtSeconds =
		escrowData.createdAt > 1000000000000 ? escrowData.createdAt / 1000 : escrowData.createdAt;
	const startTimeSeconds =
		escrowData.estimatedStartTime > 1000000000000
			? escrowData.estimatedStartTime / 1000
			: escrowData.estimatedStartTime;

	return now - createdAtSeconds < oneHour || startTimeSeconds - now > twentyFourHours;
}

function canClientDispute(escrowData: EscrowData, now: number): boolean {
	const twentyFourHours = 86400;
	const oneHour = 3600;
	const timeSinceStart = now - escrowData.estimatedStartTime;
	const timeSinceCreation = now - escrowData.createdAt;

	return timeSinceStart < twentyFourHours || timeSinceCreation > oneHour;
}

function getLastProposalAuthor(statusEvents: ContractStatusEvent[]): string | undefined {
	return statusEvents
		.filter((event) => event.content.action === EscrowStatus.DisputeResolutionProposed)
		.at(-1)
		?.pubkey?.toLowerCase();
}

function mapBlockchainStatusToPermissions(
	status: EscrowStatus,
	escrowData: EscrowData,
	disputeProposal: DisputeProposal | null,
	statusEvents: ContractStatusEvent[],
	contract: NostrContract,
	isClient: boolean,
	isFreelancer: boolean
): {
	status: EscrowStatus;
	permissions: ContractPermissions;
} {
	const now = Date.now() / 1000;

	switch (status) {
		case EscrowStatus.Funded: {
			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingCancellation &&
						event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingCancellation,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingCompletion && event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingCompletion,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingMarkWorkInProgress &&
						event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingMarkWorkInProgress,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingMarkNoShow && event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingMarkNoShow,
					permissions: createDisabledPermissions()
				};
			}

			return {
				status: EscrowStatus.Funded,
				permissions: {
					...createDisabledPermissions(),
					canComplete: isFreelancer,
					canCancel: isClient ? canClientCancel(escrowData, now) : true,
					canMarkWorkInProgress: isFreelancer && canMarkWorkInProgress(escrowData, now)
				}
			};
		}

		case EscrowStatus.WorkInProgress: {
			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingCompletion && event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingCompletion,
					permissions: createDisabledPermissions()
				};
			}

			return {
				status: EscrowStatus.WorkInProgress,
				permissions: {
					...createDisabledPermissions(),
					canComplete: isFreelancer
				}
			};
		}

		case EscrowStatus.Completed: {
			const completionTimelockExpired = now > escrowData.timelockExpiry;

			if (statusEvents.some((event) => event.content.action === EscrowStatus.FundsReleased)) {
				return {
					status: EscrowStatus.FundsReleased,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingTimelockResolution &&
						event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingTimelockResolution,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingAcceptance && event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingAcceptance,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingDispute && event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingDispute,
					permissions: createDisabledPermissions()
				};
			}

			return {
				status: EscrowStatus.Completed,
				permissions: {
					...createDisabledPermissions(),
					canAccept: isClient && !completionTimelockExpired,
					canDispute: isClient && canClientDispute(escrowData, now),
					canResolveTimelock: completionTimelockExpired
				}
			};
		}

		case EscrowStatus.InDispute:
		case EscrowStatus.InDsiputeWIP: {
			const disputeTimelockExpired = now > escrowData.timelockExpiry;

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingTimelockResolution &&
						event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingTimelockResolution,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingProposalAcceptance &&
						event.content.transactionHash
				)
			) {
				return {
					status: EscrowStatus.PendingProposalAcceptance,
					permissions: createDisabledPermissions()
				};
			}

			if (
				statusEvents.some(
					(event) =>
						event.content.action === EscrowStatus.PendingResolutionProposal &&
						event.content.transactionHash &&
						!statusEvents.some(
							(confirmed) =>
								confirmed.content.action === EscrowStatus.DisputeResolutionProposed &&
								confirmed.content.transactionHash === event.content.transactionHash
						)
				)
			) {
				return {
					status: EscrowStatus.PendingResolutionProposal,
					permissions: createDisabledPermissions()
				};
			}

			const proposalEvents = statusEvents.filter(
				(event) => event.content.action === EscrowStatus.DisputeResolutionProposed
			);
			const hasProposal = proposalEvents.length > 0 || !!disputeProposal;
			const lastProposer = getLastProposalAuthor(statusEvents);

			const clientProposalCount = proposalEvents.filter(
				(event) => event.pubkey.toLowerCase() === contract.clientPubkey.toLowerCase()
			).length;
			const freelancerProposalCount = proposalEvents.filter(
				(event) => event.pubkey.toLowerCase() === contract.freelancerPubkey.toLowerCase()
			).length;

			const canCurrentUserPropose = isClient
				? clientProposalCount < 2 && lastProposer !== contract.clientPubkey.toLowerCase()
				: isFreelancer
					? freelancerProposalCount < 2 && lastProposer !== contract.freelancerPubkey.toLowerCase()
					: false;

			const proposalOwner = disputeProposal?.proposer?.toLowerCase() ?? lastProposer;

			return {
				status: hasProposal ? EscrowStatus.DisputeResolutionProposed : EscrowStatus.InDispute,
				permissions: {
					...createDisabledPermissions(),
					canPropose: canCurrentUserPropose,
					canAcceptProposal:
						hasProposal &&
						((isClient && proposalOwner !== escrowData.client.toLowerCase()) ||
							(isFreelancer && proposalOwner !== escrowData.freelancer.toLowerCase())),
					canResolveTimelock: isClient && disputeTimelockExpired
				}
			};
		}

		case EscrowStatus.NoShow:
			return {
				status: EscrowStatus.NoShow,
				permissions: createDisabledPermissions()
			};

		case EscrowStatus.DisputeResolved:
		case EscrowStatus.DisputeUnresolved:
		case EscrowStatus.FundsReleased:
		case EscrowStatus.Cancelled:
		case EscrowStatus.Refunded:
		case EscrowStatus.FundsClaimed:
			return {
				status,
				permissions: createDisabledPermissions()
			};

		default:
			return {
				status: EscrowStatus.Funded,
				permissions: createDisabledPermissions()
			};
	}
}

export function determineContractState(
	blockchainStatus: EscrowStatus | null,
	statusEvents: ContractStatusEvent[],
	contract: NostrContract,
	escrowData: EscrowData | null,
	disputeProposal: DisputeProposal | null,
	isPending: boolean,
	isClient: boolean,
	isFreelancer: boolean
): {
	status: EscrowStatus;
	permissions: ContractPermissions;
} {
	if (blockchainStatus !== null && escrowData) {
		return mapBlockchainStatusToPermissions(
			blockchainStatus,
			escrowData,
			disputeProposal,
			statusEvents,
			contract,
			isClient,
			isFreelancer
		);
	}

	if (isPending && contract.transactionHash) {
		return {
			status: EscrowStatus.PendingFunding,
			permissions: createDisabledPermissions()
		};
	}

	const latestStatusEvent = statusEvents.length > 0 ? statusEvents[statusEvents.length - 1] : null;
	if (latestStatusEvent?.content.transactionHash) {
		switch (latestStatusEvent.content.action) {
			case EscrowStatus.PendingCompletion:
			case EscrowStatus.PendingDispute:
			case EscrowStatus.PendingCancellation:
			case EscrowStatus.PendingAcceptance:
			case EscrowStatus.PendingResolutionProposal:
			case EscrowStatus.PendingProposalAcceptance:
			case EscrowStatus.PendingTimelockResolution:
			case EscrowStatus.PendingMarkWorkInProgress:
			case EscrowStatus.PendingMarkNoShow:
			case EscrowStatus.PendingClaimNoShowRefund:
			case EscrowStatus.PendingClaimUpfrontDeposit:
				return {
					status: latestStatusEvent.content.action,
					permissions: createDisabledPermissions()
				};
		}
	}

	return {
		status: EscrowStatus.Funded,
		permissions: {
			...createDisabledPermissions(),
			canDelete: true
		}
	};
}
