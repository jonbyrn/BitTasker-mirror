import type {
	ServiceProposalEvent,
	ServiceProposalStatusEvent,
	ServiceQuoteQueryResult,
	ServiceQuoteRequestEvent,
	ServiceQuoteThread
} from '$lib/types/service-quote';
import { queryNostrEvents } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';
import { TAG_FILTERS } from '$lib/utils/constants/tags';
import {
	validateServiceProposalEvent,
	validateServiceProposalStatusEvent,
	validateServiceQuoteRequestEvent
} from './protocol';
import { resolveServiceQuoteThreads } from './resolver';
import { getPublishedRelaySet } from './publish';

const DEFAULT_LIMIT = 100;
const READ_TIMEOUT_MS = 8000;

export interface TaskerServiceQuoteQueryParams {
	taskerPubkey: string;
	quoteRequestId?: string;
	limit?: number;
}

export interface TaskeeServiceQuoteQueryParams {
	taskeePubkey: string;
	serviceAddress: string;
	quoteRequestId?: string;
	limit?: number;
}

export async function queryTaskerServiceQuoteThreads(
	params: TaskerServiceQuoteQueryParams
): Promise<ServiceQuoteThread[]> {
	const requests = await queryServiceQuoteRequestsByAuthor(params.taskerPubkey, params.limit);
	const filteredRequests = params.quoteRequestId
		? requests.filter((request) => request.content.quoteRequestId === params.quoteRequestId)
		: requests;

	const proposals = await queryServiceProposalsForTasker(params.taskerPubkey, params.limit);
	const statuses = await queryStatusesForProposals(proposals, [
		...new Set([params.taskerPubkey, ...proposals.map((proposal) => proposal.pubkey)])
	]);

	return resolveServiceQuoteThreads({
		requests: filteredRequests,
		proposals,
		statuses
	});
}

export async function queryTaskeeServiceQuoteThreads(
	params: TaskeeServiceQuoteQueryParams
): Promise<ServiceQuoteThread[]> {
	const requests = await queryServiceQuoteRequestsForService(
		params.serviceAddress,
		params.taskeePubkey,
		params.limit
	);
	const filteredRequests = params.quoteRequestId
		? requests.filter((request) => request.content.quoteRequestId === params.quoteRequestId)
		: requests;

	const proposals = await queryServiceProposalsByRequestIds(
		filteredRequests.map((request) => request.id),
		params.limit
	);
	const statuses = await queryStatusesForProposals(proposals, [
		params.taskeePubkey,
		...filteredRequests.map((request) => request.pubkey)
	]);

	return resolveServiceQuoteThreads({
		requests: filteredRequests,
		proposals,
		statuses
	});
}

export async function queryServiceQuoteRequestsByAuthor(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceQuoteRequestEvent[]> {
	const events = await queryNostrEvents(
		{
			kinds: [KINDS.SERVICE_QUOTE_REQUEST],
			authors: [taskerPubkey],
			limit
		},
		undefined,
		undefined,
		await getReadRelays()
	);

	const requests = dedupeById(events)
		.map(safelyValidateRequest)
		.filter((event): event is ServiceQuoteRequestEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);
	const deletedRequestIds = await queryDeletedEventIds(
		requests.map((request) => request.id),
		[taskerPubkey],
		await getReadRelays(requests)
	);

	return requests.filter((request) => !deletedRequestIds.has(request.id));
}

export async function queryServiceQuoteRequestsForService(
	serviceAddress: string,
	taskeePubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceQuoteRequestEvent[]> {
	const events = await queryNostrEvents(
		{
			kinds: [KINDS.SERVICE_QUOTE_REQUEST],
			...TAG_FILTERS.byAddress(serviceAddress),
			...TAG_FILTERS.byNpub(taskeePubkey),
			limit
		},
		undefined,
		undefined,
		await getReadRelays()
	);

	const requests = dedupeById(events)
		.map(safelyValidateRequest)
		.filter((event): event is ServiceQuoteRequestEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);
	const deletedRequestIds = await queryDeletedEventIds(
		requests.map((request) => request.id),
		[...new Set(requests.map((request) => request.pubkey))],
		await getReadRelays(requests)
	);

	return requests.filter((request) => !deletedRequestIds.has(request.id));
}

export async function queryServiceProposalsForTasker(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceProposalEvent[]> {
	const events = await queryNostrEvents(
		{
			kinds: [KINDS.SERVICE_PROPOSAL],
			...TAG_FILTERS.byNpub(taskerPubkey),
			limit
		},
		undefined,
		undefined,
		await getReadRelays()
	);

	return dedupeById(events)
		.map(safelyValidateProposal)
		.filter((event): event is ServiceProposalEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);
}

export async function queryServiceProposalsByRequestIds(
	requestEventIds: string[],
	limit: number = DEFAULT_LIMIT
): Promise<ServiceProposalEvent[]> {
	if (requestEventIds.length === 0) {
		return [];
	}

	const events = await queryNostrEvents(
		{
			kinds: [KINDS.SERVICE_PROPOSAL],
			'#e': requestEventIds,
			limit
		},
		undefined,
		undefined,
		await getReadRelays()
	);

	return dedupeById(events)
		.map(safelyValidateProposal)
		.filter((event): event is ServiceProposalEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);
}

export async function queryStatusesForProposals(
	proposals: ServiceProposalEvent[],
	authors?: string[]
): Promise<ServiceProposalStatusEvent[]> {
	if (proposals.length === 0) {
		return [];
	}

	const proposalIds = proposals.map((proposal) => proposal.id);
	const filter = {
		kinds: [KINDS.SERVICE_PROPOSAL_STATUS],
		'#e': proposalIds,
		limit: DEFAULT_LIMIT * 5
	} as Record<string, unknown>;
	if (authors && authors.length > 0) {
		filter.authors = [...new Set(authors)];
	}

	const events = await queryNostrEvents(
		filter,
		undefined,
		undefined,
		await getReadRelays(proposals)
	);
	return dedupeById(events)
		.map(safelyValidateStatus)
		.filter((event): event is ServiceProposalStatusEvent => Boolean(event))
		.sort((left, right) => left.created_at - right.created_at);
}

export async function findRequestById(
	quoteRequestId: string,
	taskerPubkey: string
): Promise<ServiceQuoteRequestEvent | null> {
	const requests = await queryServiceQuoteRequestsByAuthor(taskerPubkey, DEFAULT_LIMIT);
	return requests.find((request) => request.content.quoteRequestId === quoteRequestId) ?? null;
}

function toQueryResult(threads: ServiceQuoteThread[]): ServiceQuoteQueryResult {
	return {
		requests: threads.map((thread) => thread.request),
		proposals: threads.flatMap((thread) => thread.proposals.map((proposal) => proposal.proposal)),
		statusEvents: threads.flatMap((thread) =>
			thread.proposals.flatMap((proposal) => proposal.statusEvents)
		),
		timelines: threads.map((thread) => ({
			request: thread.request,
			proposals: thread.proposals.map((proposal) => proposal.proposal),
			statusEventsByProposalId: Object.fromEntries(
				thread.proposals.map((proposal) => [
					proposal.proposal.content.proposalId,
					proposal.statusEvents
				])
			),
			latestProposal: thread.latestProposal?.proposal,
			resolvedStatus: thread.latestProposal?.state ?? 'pending',
			resolvedTerminalEvent: thread.latestProposal?.winningStatus,
			expirationTimestamp: thread.latestProposal?.expiresAt,
			isExpired: thread.latestProposal?.isExpired ?? false,
			linkedEscrowId: thread.linkedEscrowId
		}))
	};
}

export async function queryServiceQuotesForTasker(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceQuoteQueryResult> {
	const threads = await queryTaskerServiceQuoteThreads({ taskerPubkey, limit });
	return toQueryResult(threads);
}

export async function queryServiceQuotesForTaskee(
	serviceAddress: string,
	taskeePubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceQuoteQueryResult> {
	const threads = await queryTaskeeServiceQuoteThreads({
		serviceAddress,
		taskeePubkey,
		limit
	});
	return toQueryResult(threads);
}

export async function findServiceQuoteTimelineByRequestId(
	quoteRequestId: string,
	taskerPubkey: string
): Promise<ServiceQuoteQueryResult> {
	const threads = await queryTaskerServiceQuoteThreads({ taskerPubkey, quoteRequestId, limit: 20 });
	return toQueryResult(threads);
}

async function getReadRelays(events: Array<{ id: string }> = []): Promise<string[]> {
	const defaultRelay = import.meta.env.VITE_NOSTR_RELAY_URL;
	const relays = new Set<string>(defaultRelay ? [defaultRelay] : []);

	for (const event of events) {
		for (const relay of getPublishedRelaySet(event.id)) {
			relays.add(relay);
		}
	}

	return [...relays];
}

async function queryDeletedEventIds(
	eventIds: string[],
	authors: string[],
	relays: string[]
): Promise<Set<string>> {
	if (eventIds.length === 0) {
		return new Set<string>();
	}

	const deleteEvents = await queryNostrEvents(
		{
			kinds: [5],
			authors,
			'#e': eventIds,
			limit: Math.max(DEFAULT_LIMIT, eventIds.length * 2)
		},
		undefined,
		undefined,
		relays
	);

	return new Set(
		deleteEvents.flatMap((event) =>
			event.tags.filter((tag) => tag[0] === 'e' && eventIds.includes(tag[1])).map((tag) => tag[1])
		)
	);
}

function safelyValidateRequest(event: unknown): ServiceQuoteRequestEvent | null {
	try {
		return validateServiceQuoteRequestEvent(event);
	} catch {
		return null;
	}
}

function safelyValidateProposal(event: unknown): ServiceProposalEvent | null {
	try {
		return validateServiceProposalEvent(event);
	} catch {
		return null;
	}
}

function safelyValidateStatus(event: unknown): ServiceProposalStatusEvent | null {
	try {
		return validateServiceProposalStatusEvent(event);
	} catch {
		return null;
	}
}

function dedupeById<T extends { id: string }>(events: T[]): T[] {
	const seen = new Set<string>();
	return events.filter((event) => {
		if (seen.has(event.id)) {
			return false;
		}
		seen.add(event.id);
		return true;
	});
}

export { READ_TIMEOUT_MS };
