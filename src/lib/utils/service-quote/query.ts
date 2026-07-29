import type {
	ServiceProposalEvent,
	ServiceProposalStatusEvent,
	ServiceQuoteQueryResult,
	ServiceQuoteRequestEvent,
	ServiceQuoteThread
} from '$lib/types/service-quote';
import { queryNostrEvents } from '$lib/utils/nostr';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import { TAG_FILTERS } from '$lib/utils/constants/tags';
import {
	buildQuoteRequestD,
	validateServiceProposalEvent,
	validateServiceProposalStatusEvent,
	validateServiceQuoteRequestEvent
} from './protocol';
import { resolveServiceQuoteThreads } from './resolver';
import { getPublishedRelaySet } from './publish';

const DEFAULT_LIMIT = 100;
const READ_TIMEOUT_MS = 8000;
const STATUS_QUERY_LIMIT = DEFAULT_LIMIT * 5;

interface QueryCollectionResult<T> {
	items: T[];
	isPartial: boolean;
}

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
	const requestResult = await queryServiceQuoteRequestsByAuthorDetailed(
		params.taskerPubkey,
		params.limit
	);
	const filteredRequests = params.quoteRequestId
		? requestResult.items.filter(
				(request) => request.content.quoteRequestId === params.quoteRequestId
			)
		: requestResult.items;

	const proposalResult = await queryServiceProposalsForTaskerDetailed(
		params.taskerPubkey,
		params.limit
	);
	const statuses = await queryStatusesForProposals(proposalResult.items, [
		...new Set([params.taskerPubkey, ...proposalResult.items.map((proposal) => proposal.pubkey)])
	]);

	return resolveServiceQuoteThreads({
		requests: filteredRequests,
		proposals: proposalResult.items,
		statuses
	});
}

export async function queryTaskeeServiceQuoteThreads(
	params: TaskeeServiceQuoteQueryParams
): Promise<ServiceQuoteThread[]> {
	const requestResult = await queryServiceQuoteRequestsForServiceDetailed(
		params.serviceAddress,
		params.taskeePubkey,
		params.limit,
		params.quoteRequestId
	);
	const filteredRequests = params.quoteRequestId
		? requestResult.items.filter(
				(request) => request.content.quoteRequestId === params.quoteRequestId
			)
		: requestResult.items;

	const proposalResult = await queryServiceProposalsByRequestIdsDetailed(
		filteredRequests.map((request) => request.id),
		params.limit
	);
	const statuses = await queryStatusesForProposals(proposalResult.items, [
		params.taskeePubkey,
		...filteredRequests.map((request) => request.pubkey)
	]);

	return resolveServiceQuoteThreads({
		requests: filteredRequests,
		proposals: proposalResult.items,
		statuses
	});
}

export async function queryServiceQuoteRequestsByAuthor(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceQuoteRequestEvent[]> {
	return (await queryServiceQuoteRequestsByAuthorDetailed(taskerPubkey, limit)).items;
}

async function queryServiceQuoteRequestsByAuthorDetailed(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<QueryCollectionResult<ServiceQuoteRequestEvent>> {
	const filter: Filter = {
		kinds: [KINDS.SERVICE_QUOTE_REQUEST],
		authors: [taskerPubkey],
		limit
	};
	const events = await queryNostrEvents(filter, undefined, undefined, await getReadRelays());

	const requests = dedupeById(events)
		.map(safelyValidateRequest)
		.filter((event): event is ServiceQuoteRequestEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);
	const deletedRequestResult = await queryDeletedEventIdsDetailed(
		requests.map((request) => request.id),
		[taskerPubkey],
		await getReadRelays(requests)
	);

	return {
		items: requests.filter((request) => !deletedRequestResult.items.has(request.id)),
		isPartial: events.length >= limit || deletedRequestResult.isPartial
	};
}

export async function queryServiceQuoteRequestsForService(
	serviceAddress: string,
	taskeePubkey: string,
	limit: number = DEFAULT_LIMIT,
	quoteRequestId?: string
): Promise<ServiceQuoteRequestEvent[]> {
	return (
		await queryServiceQuoteRequestsForServiceDetailed(
			serviceAddress,
			taskeePubkey,
			limit,
			quoteRequestId
		)
	).items;
}

async function queryServiceQuoteRequestsForServiceDetailed(
	serviceAddress: string,
	taskeePubkey: string,
	limit: number = DEFAULT_LIMIT,
	quoteRequestId?: string
): Promise<QueryCollectionResult<ServiceQuoteRequestEvent>> {
	const dTag = quoteRequestId ? buildQuoteRequestD(serviceAddress, quoteRequestId) : null;
	const filter: Filter = {
		kinds: [KINDS.SERVICE_QUOTE_REQUEST],
		...TAG_FILTERS.byAddress(serviceAddress),
		...TAG_FILTERS.byNpub(taskeePubkey),
		...(dTag ? { '#d': [dTag] } : {}),
		limit
	};
	const events = await queryNostrEvents(filter, undefined, undefined, await getReadRelays());

	const requests = dedupeById(events)
		.map(safelyValidateRequest)
		.filter((event): event is ServiceQuoteRequestEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);
	const deletedRequestResult = await queryDeletedEventIdsDetailed(
		requests.map((request) => request.id),
		[...new Set(requests.map((request) => request.pubkey))],
		await getReadRelays(requests)
	);

	return {
		items: requests.filter((request) => !deletedRequestResult.items.has(request.id)),
		isPartial: events.length >= limit || deletedRequestResult.isPartial
	};
}

export async function queryServiceProposalsForTasker(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceProposalEvent[]> {
	return (await queryServiceProposalsForTaskerDetailed(taskerPubkey, limit)).items;
}

async function queryServiceProposalsForTaskerDetailed(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<QueryCollectionResult<ServiceProposalEvent>> {
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

	const proposals = dedupeById(events)
		.map(safelyValidateProposal)
		.filter((event): event is ServiceProposalEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);

	const deletedProposalResult = await queryDeletedEventIdsDetailed(
		proposals.map((proposal) => proposal.id),
		[...new Set(proposals.map((proposal) => proposal.pubkey))],
		await getReadRelays(proposals)
	);

	return {
		items: proposals.filter((proposal) => !deletedProposalResult.items.has(proposal.id)),
		isPartial: events.length >= limit || deletedProposalResult.isPartial
	};
}

export async function queryServiceProposalsByRequestIds(
	requestEventIds: string[],
	limit: number = DEFAULT_LIMIT
): Promise<ServiceProposalEvent[]> {
	return (await queryServiceProposalsByRequestIdsDetailed(requestEventIds, limit)).items;
}

async function queryServiceProposalsByRequestIdsDetailed(
	requestEventIds: string[],
	limit: number = DEFAULT_LIMIT
): Promise<QueryCollectionResult<ServiceProposalEvent>> {
	if (requestEventIds.length === 0) {
		return { items: [], isPartial: false };
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

	const proposals = dedupeById(events)
		.map(safelyValidateProposal)
		.filter((event): event is ServiceProposalEvent => Boolean(event))
		.sort((left, right) => right.created_at - left.created_at);

	const deletedProposalResult = await queryDeletedEventIdsDetailed(
		proposals.map((proposal) => proposal.id),
		[...new Set(proposals.map((proposal) => proposal.pubkey))],
		await getReadRelays(proposals)
	);

	return {
		items: proposals.filter((proposal) => !deletedProposalResult.items.has(proposal.id)),
		isPartial: events.length >= limit || deletedProposalResult.isPartial
	};
}

export async function queryStatusesForProposals(
	proposals: ServiceProposalEvent[],
	authors?: string[]
): Promise<ServiceProposalStatusEvent[]> {
	return (await queryStatusesForProposalsDetailed(proposals, authors)).items;
}

async function queryStatusesForProposalsDetailed(
	proposals: ServiceProposalEvent[],
	authors?: string[]
): Promise<QueryCollectionResult<ServiceProposalStatusEvent>> {
	if (proposals.length === 0) {
		return { items: [], isPartial: false };
	}

	const proposalIds = proposals.map((proposal) => proposal.id);
	const filter: Filter = {
		kinds: [KINDS.SERVICE_PROPOSAL_STATUS],
		'#e': proposalIds,
		limit: STATUS_QUERY_LIMIT
	};
	if (authors && authors.length > 0) {
		filter.authors = [...new Set(authors)];
	}

	const events = await queryNostrEvents(
		filter,
		undefined,
		undefined,
		await getReadRelays(proposals)
	);
	return {
		items: dedupeById(events)
			.map(safelyValidateStatus)
			.filter((event): event is ServiceProposalStatusEvent => Boolean(event))
			.sort((left, right) => left.created_at - right.created_at),
		isPartial: events.length >= STATUS_QUERY_LIMIT
	};
}

export async function findRequestById(
	quoteRequestId: string,
	taskerPubkey: string
): Promise<ServiceQuoteRequestEvent | null> {
	const requests = await queryServiceQuoteRequestsByAuthor(taskerPubkey, DEFAULT_LIMIT);
	return requests.find((request) => request.content.quoteRequestId === quoteRequestId) ?? null;
}

function toQueryResult(
	threads: ServiceQuoteThread[],
	options: { isPartial?: boolean } = {}
): ServiceQuoteQueryResult {
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
		})),
		isPartial: options.isPartial === true
	};
}

export async function queryServiceQuotesForTasker(
	taskerPubkey: string,
	limit: number = DEFAULT_LIMIT
): Promise<ServiceQuoteQueryResult> {
	const requestResult = await queryServiceQuoteRequestsByAuthorDetailed(taskerPubkey, limit);
	const proposalsResult = await queryServiceProposalsForTaskerDetailed(taskerPubkey, limit);
	const statusesResult = await queryStatusesForProposalsDetailed(proposalsResult.items, [
		...new Set([taskerPubkey, ...proposalsResult.items.map((proposal) => proposal.pubkey)])
	]);
	const threads = resolveServiceQuoteThreads({
		requests: requestResult.items,
		proposals: proposalsResult.items,
		statuses: statusesResult.items
	});
	return toQueryResult(threads, {
		isPartial: requestResult.isPartial || proposalsResult.isPartial || statusesResult.isPartial
	});
}

export async function queryServiceQuotesForTaskee(
	serviceAddress: string,
	taskeePubkey: string,
	limit: number = DEFAULT_LIMIT,
	quoteRequestId?: string
): Promise<ServiceQuoteQueryResult> {
	const requestResult = await queryServiceQuoteRequestsForServiceDetailed(
		serviceAddress,
		taskeePubkey,
		limit,
		quoteRequestId
	);
	const filteredRequests = quoteRequestId
		? requestResult.items.filter((request) => request.content.quoteRequestId === quoteRequestId)
		: requestResult.items;
	const proposalsResult = await queryServiceProposalsByRequestIdsDetailed(
		filteredRequests.map((request) => request.id),
		limit
	);
	const statusesResult = await queryStatusesForProposalsDetailed(proposalsResult.items, [
		taskeePubkey,
		...filteredRequests.map((request) => request.pubkey)
	]);
	const threads = resolveServiceQuoteThreads({
		requests: filteredRequests,
		proposals: proposalsResult.items,
		statuses: statusesResult.items
	});
	return toQueryResult(threads, {
		isPartial: requestResult.isPartial || proposalsResult.isPartial || statusesResult.isPartial
	});
}

export async function findServiceQuoteTimelineByRequestId(
	quoteRequestId: string,
	taskerPubkey: string
): Promise<ServiceQuoteQueryResult> {
	const requestResult = await queryServiceQuoteRequestsByAuthorDetailed(taskerPubkey, 20);
	const filteredRequests = requestResult.items.filter(
		(request) => request.content.quoteRequestId === quoteRequestId
	);
	const proposalsResult = await queryServiceProposalsForTaskerDetailed(taskerPubkey, 20);
	const statusesResult = await queryStatusesForProposalsDetailed(proposalsResult.items, [
		...new Set([taskerPubkey, ...proposalsResult.items.map((proposal) => proposal.pubkey)])
	]);
	const threads = resolveServiceQuoteThreads({
		requests: filteredRequests,
		proposals: proposalsResult.items,
		statuses: statusesResult.items
	});
	return toQueryResult(threads, {
		isPartial: requestResult.isPartial || proposalsResult.isPartial || statusesResult.isPartial
	});
}

async function getReadRelays(events: Array<{ id: string }> = []): Promise<string[]> {
	const defaultRelay = import.meta.env.VITE_NOSTR_RELAY_URL;
	const relays = new Set<string>(defaultRelay ? [defaultRelay] : []);

	for (const event of events) {
		for (const relay of await getPublishedRelaySet(event.id)) {
			relays.add(relay);
		}
	}

	return [...relays];
}

async function queryDeletedEventIdsDetailed(
	eventIds: string[],
	authors: string[],
	relays: string[]
): Promise<{ items: Set<string>; isPartial: boolean }> {
	if (eventIds.length === 0) {
		return { items: new Set<string>(), isPartial: false };
	}

	const deleteLimit = Math.max(DEFAULT_LIMIT, eventIds.length * 2);
	const deleteEvents = await queryNostrEvents(
		{
			kinds: [5],
			authors,
			'#e': eventIds,
			limit: deleteLimit
		},
		undefined,
		undefined,
		relays
	);

	return {
		items: new Set(
			deleteEvents.flatMap((event) =>
				event.tags.filter((tag) => tag[0] === 'e' && eventIds.includes(tag[1])).map((tag) => tag[1])
			)
		),
		isPartial: deleteEvents.length >= deleteLimit
	};
}

function safelyValidateRequest(event: unknown): ServiceQuoteRequestEvent | null {
	try {
		return validateServiceQuoteRequestEvent(event as NostrEvent);
	} catch {
		return null;
	}
}

function safelyValidateProposal(event: unknown): ServiceProposalEvent | null {
	try {
		return validateServiceProposalEvent(event as NostrEvent);
	} catch {
		return null;
	}
}

function safelyValidateStatus(event: unknown): ServiceProposalStatusEvent | null {
	try {
		return validateServiceProposalStatusEvent(event as NostrEvent);
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
