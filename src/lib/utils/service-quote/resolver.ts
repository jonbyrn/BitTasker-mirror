import type { Event as NostrEvent } from 'nostr-tools';
import type {
	ResolvedServiceProposal,
	ServiceProposalEvent,
	ServiceProposalStatusEvent,
	ServiceQuoteRequestEvent,
	ServiceQuoteTimelineEntry,
	ServiceQuoteThread
} from '$lib/types/service-quote';
import {
	parseServiceAddress,
	resolveProposalState,
	validateServiceProposalStatusEvent,
	validateStatusAuthorRole
} from './protocol';

export interface ResolveServiceQuoteThreadsParams {
	requests: ServiceQuoteRequestEvent[];
	proposals: ServiceProposalEvent[];
	statuses: ServiceProposalStatusEvent[];
	now?: number;
}

export interface ServiceDeleteQuoteGuard {
	hasBlockingThreads: boolean;
	blockingThreadCount: number;
	totalThreadCount: number;
	activeContractCount: number;
}

const TERMINAL_DELETE_SAFE_STATES = new Set(['accepted', 'declined', 'withdrawn', 'expired']);

export function resolveServiceQuoteThreads(
	params: ResolveServiceQuoteThreadsParams
): ServiceQuoteThread[] {
	const requestsByEventId = new Map<string, ServiceQuoteRequestEvent>();
	const requestsByQuoteRequestId = new Map<string, ServiceQuoteRequestEvent>();
	for (const request of params.requests) {
		requestsByEventId.set(request.id, request);
		requestsByQuoteRequestId.set(request.content.quoteRequestId, request);
	}

	const statusesByProposalEventId = new Map<string, ServiceProposalStatusEvent[]>();
	for (const status of params.statuses) {
		const proposalEventId = status.tags.find((tag) => tag[0] === 'e')?.[1];
		if (!proposalEventId) {
			continue;
		}
		const bucket = statusesByProposalEventId.get(proposalEventId) ?? [];
		bucket.push(status);
		statusesByProposalEventId.set(proposalEventId, bucket);
	}

	const proposalsByRequestId = new Map<string, ResolvedServiceProposal[]>();
	for (const proposal of params.proposals) {
		const requestEventId = proposal.tags.find((tag) => tag[0] === 'e')?.[1];
		if (!requestEventId) {
			continue;
		}
		const request = requestsByEventId.get(requestEventId);
		if (!request) {
			continue;
		}
		if (!isProposalLinkedToRequest(request, proposal)) {
			continue;
		}

		const relatedStatuses = (statusesByProposalEventId.get(proposal.id) ?? []).filter((status) =>
			isStatusLinkedToProposal(request, proposal, status, params.now)
		);

		const resolvedProposal = resolveProposalState(proposal, relatedStatuses, params.now);
		const bucket = proposalsByRequestId.get(request.content.quoteRequestId) ?? [];
		bucket.push(resolvedProposal);
		proposalsByRequestId.set(request.content.quoteRequestId, bucket);
	}

	return params.requests
		.map((request) => {
			const proposals = (proposalsByRequestId.get(request.content.quoteRequestId) ?? []).sort(
				(left, right) => {
					if (left.proposal.created_at !== right.proposal.created_at) {
						return right.proposal.created_at - left.proposal.created_at;
					}
					return right.proposal.id.localeCompare(left.proposal.id);
				}
			);
			const serviceAddress = request.content.serviceAddress;
			const taskeePubkey = parseServiceAddress(serviceAddress).pubkey;
			const linkedEscrowId =
				proposals.find((proposal) => typeof proposal.linkedEscrowId === 'string')?.linkedEscrowId ??
				undefined;

			return {
				request,
				proposals,
				taskerPubkey: request.pubkey,
				taskeePubkey,
				serviceAddress,
				serviceId: request.content.serviceId,
				latestProposal: proposals[0],
				linkedEscrowId
			};
		})
		.sort((left, right) => {
			if (left.request.created_at !== right.request.created_at) {
				return right.request.created_at - left.request.created_at;
			}
			return right.request.id.localeCompare(left.request.id);
		});
}

export function isProposalLinkedToRequest(
	request: ServiceQuoteRequestEvent,
	proposal: ServiceProposalEvent
): boolean {
	if (proposal.content.quoteRequestId !== request.content.quoteRequestId) {
		return false;
	}
	if (proposal.content.serviceAddress !== request.content.serviceAddress) {
		return false;
	}
	if (proposal.content.serviceId !== request.content.serviceId) {
		return false;
	}
	if (proposal.pubkey !== request.tags.find((tag) => tag[0] === 'p')?.[1]) {
		return false;
	}
	if (proposal.tags.find((tag) => tag[0] === 'p')?.[1] !== request.pubkey) {
		return false;
	}
	return true;
}

export function isStatusLinkedToProposal(
	request: ServiceQuoteRequestEvent,
	proposal: ServiceProposalEvent,
	status: ServiceProposalStatusEvent,
	now: number = Math.floor(Date.now() / 1000)
): boolean {
	if (status.content.proposalId !== proposal.content.proposalId) {
		return false;
	}
	if (status.content.quoteRequestId !== request.content.quoteRequestId) {
		return false;
	}
	if (status.content.serviceAddress !== request.content.serviceAddress) {
		return false;
	}
	if (status.content.serviceId !== request.content.serviceId) {
		return false;
	}

	try {
		validateServiceProposalStatusEvent(status as unknown as NostrEvent, now);
		validateStatusAuthorRole(status.content.status, status.pubkey, request.pubkey, proposal.pubkey);
	} catch {
		return false;
	}

	const counterpartyPubkey = status.tags.find((tag) => tag[0] === 'p')?.[1];
	if (status.content.status === 'withdrawn' && counterpartyPubkey !== request.pubkey) {
		return false;
	}
	if (status.content.status !== 'withdrawn' && counterpartyPubkey !== proposal.pubkey) {
		return false;
	}

	return true;
}

export function isDeleteBlockingTimelineEntry(
	timeline: Pick<ServiceQuoteTimelineEntry, 'proposals' | 'resolvedStatus'>
): boolean {
	if (timeline.proposals.length === 0) {
		return !TERMINAL_DELETE_SAFE_STATES.has(timeline.resolvedStatus);
	}

	return !TERMINAL_DELETE_SAFE_STATES.has(timeline.resolvedStatus);
}

export function summarizeDeleteGuardForTimelines(
	timelines: Array<Pick<ServiceQuoteTimelineEntry, 'proposals' | 'resolvedStatus'>>,
	hasActiveContracts: boolean = false
): ServiceDeleteQuoteGuard {
	const blockingThreadCount = timelines.reduce(
		(count, timeline) => count + (isDeleteBlockingTimelineEntry(timeline) ? 1 : 0),
		0
	);

	return {
		hasBlockingThreads: blockingThreadCount > 0 || hasActiveContracts,
		blockingThreadCount,
		totalThreadCount: timelines.length,
		activeContractCount: 0
	};
}

export function summarizeDeleteGuardForThreads(
	threads: Array<Pick<ServiceQuoteThread, 'proposals'>>,
	activeContractCount: number
): ServiceDeleteQuoteGuard {
	const hasActiveContracts = activeContractCount > 0;
	const guard = summarizeDeleteGuardForTimelines(
		threads.map((thread) => ({
			proposals: thread.proposals.map((proposal) => proposal.proposal),
			resolvedStatus: thread.proposals[0]?.state ?? 'pending'
		})),
		hasActiveContracts
	);
	return {
		...guard,
		activeContractCount
	};
}
