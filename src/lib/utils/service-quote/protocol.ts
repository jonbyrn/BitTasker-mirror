import type { Event as NostrEvent } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import { TAGS } from '$lib/utils/constants/tags';
import type {
	ResolvedServiceProposal,
	ResolvedServiceProposalState,
	ServiceProposalContent,
	ServiceProposalEvent,
	ServiceProposalStatus,
	ServiceProposalStatusContent,
	ServiceProposalStatusEvent,
	ServiceQuoteContextSummary,
	ServiceQuoteMessageType,
	ServiceQuoteRelayCapability,
	ServiceQuoteRequestContent,
	ServiceQuoteRequestEvent
} from '$lib/types/service-quote';
import type { Service, ServiceStatus } from '$lib/types/service.d';

/**
 * Native RGB/Taproot escrow finality policy. On Bitcoin, 3 confirmations is the
 * standard reorg-safe threshold for accepting a service contract as funded.
 * Inlined here after the EVM service-contract/finality module was removed.
 */
export const SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS = 3;
export const SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION = 'native-rgb-v1';

export const SERVICE_QUOTE_SCHEMA_VERSION = 'v1' as const;

export const SERVICE_QUOTE_MESSAGE_TYPES = {
	REQUEST: 'service-quote-request',
	PROPOSAL: 'service-proposal',
	STATUS: 'service-proposal-status'
} as const satisfies Record<string, ServiceQuoteMessageType>;

const KIND_TO_MESSAGE_TYPE: Record<number, ServiceQuoteMessageType> = {
	[KINDS.SERVICE_QUOTE_REQUEST]: SERVICE_QUOTE_MESSAGE_TYPES.REQUEST,
	[KINDS.SERVICE_PROPOSAL]: SERVICE_QUOTE_MESSAGE_TYPES.PROPOSAL,
	[KINDS.SERVICE_PROPOSAL_STATUS]: SERVICE_QUOTE_MESSAGE_TYPES.STATUS
};

export const SERVICE_QUOTE_REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const SERVICE_PROPOSAL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const SERVICE_QUOTE_DECIMAL_RE = /^[0-9]+(?:\.[0-9]{1,2})?$/;

const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/i;
const EVM_ADDRESS_RE = /^0x[0-9a-f]{40}$/i;
const TRANSACTION_HASH_RE = /^0x[0-9a-f]{64}$/i;
const INTEGER_STRING_RE = /^[0-9]+$/;

const STATUS_ROLE_MAP: Record<ServiceProposalStatus, 'tasker' | 'taskee'> = {
	accepting: 'tasker',
	contract_sync_pending: 'tasker',
	accepted: 'tasker',
	accept_failed: 'tasker',
	accept_unknown: 'tasker',
	declined: 'tasker',
	withdrawn: 'taskee'
};

const TERMINAL_STATES = new Set<ResolvedServiceProposalState>([
	'accepted',
	'declined',
	'withdrawn',
	'expired'
]);

const RESOLUTION_HALT_STATES = new Set<ServiceProposalStatus>(['declined', 'withdrawn']);

const ALLOWED_STATUS_TRANSITIONS: Record<
	'pending' | ServiceProposalStatus,
	Set<ServiceProposalStatus>
> = {
	pending: new Set(['accepting', 'accepted', 'declined', 'withdrawn']),
	accepting: new Set([
		'contract_sync_pending',
		'accepted',
		'accept_failed',
		'accept_unknown',
		'declined',
		'withdrawn'
	]),
	contract_sync_pending: new Set([
		'accepted',
		'accept_unknown',
		'declined',
		'withdrawn',
		'accept_failed'
	]),
	accept_failed: new Set(['accepting', 'declined', 'withdrawn']),
	accept_unknown: new Set(['accepting', 'declined', 'withdrawn']),
	accepted: new Set(), // Removed circular transition to contract_sync_pending
	declined: new Set(),
	withdrawn: new Set()
};

export class ServiceQuoteProtocolError extends Error {
	code: string;
	details?: Record<string, unknown>;

	constructor(code: string, message: string, details?: Record<string, unknown>) {
		super(message);
		this.code = code;
		this.details = details;
	}
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function assert(
	condition: unknown,
	code: string,
	message: string,
	details?: Record<string, unknown>
): asserts condition {
	if (!condition) {
		throw new ServiceQuoteProtocolError(code, message, details);
	}
}

function getEventContent<T>(event: NostrEvent): T {
	if (typeof event.content === 'string') {
		return JSON.parse(event.content) as T;
	}

	return event.content as T;
}

export function getServiceEventKindFromStatus(status: ServiceStatus): number {
	return status === 'active' || status === 'inactive' || status === 'sold'
		? KINDS.SERVICE_ACTIVE
		: KINDS.SERVICE_DRAFT;
}

export function buildServiceAddressFromParts(kind: number, pubkey: string, dTag: string): string {
	assert(kind > 0, 'SERVICE_QUOTE_INVALID_SERVICE_KIND', 'Service kind is required');
	assert(
		HEX_PUBKEY_RE.test(pubkey),
		'SERVICE_QUOTE_INVALID_SERVICE_PUBKEY',
		'Service pubkey must be a 64-char hex key',
		{
			pubkey
		}
	);
	assert(Boolean(dTag), 'SERVICE_QUOTE_INVALID_SERVICE_DTAG', 'Service d-tag is required');
	return `${kind}:${pubkey}:${dTag}`;
}

export function buildServiceAddress(
	service: Pick<Service, 'npub' | 'uniqueId' | 'status' | 'eventKind'>
): string {
	return buildServiceAddressFromParts(
		service.eventKind ?? getServiceEventKindFromStatus(service.status),
		service.npub,
		service.uniqueId
	);
}

export function parseServiceAddress(serviceAddress: string): {
	kind: number;
	pubkey: string;
	dTag: string;
} {
	const firstColon = serviceAddress.indexOf(':');
	const secondColon = serviceAddress.indexOf(':', firstColon + 1);

	assert(
		firstColon > 0 && secondColon > firstColon,
		'SERVICE_QUOTE_INVALID_SERVICE_ADDRESS',
		'Service address must match <kind>:<pubkey>:<dTag>',
		{
			serviceAddress
		}
	);

	const kindValue = Number(serviceAddress.slice(0, firstColon));
	const pubkey = serviceAddress.slice(firstColon + 1, secondColon);
	const dTag = serviceAddress.slice(secondColon + 1);

	assert(
		Number.isInteger(kindValue),
		'SERVICE_QUOTE_INVALID_SERVICE_KIND',
		'Service address kind must be an integer',
		{
			serviceAddress
		}
	);
	assert(
		HEX_PUBKEY_RE.test(pubkey),
		'SERVICE_QUOTE_INVALID_SERVICE_PUBKEY',
		'Service address pubkey must be a 64-char hex key',
		{
			serviceAddress
		}
	);
	assert(
		Boolean(dTag),
		'SERVICE_QUOTE_INVALID_SERVICE_DTAG',
		'Service address d-tag must be present',
		{
			serviceAddress
		}
	);

	return { kind: kindValue, pubkey, dTag };
}

export function generateServiceQuoteEntityId(prefix: 'qr' | 'pr' | 'io' = 'qr'): string {
	const cryptoObject = globalThis.crypto;
	if (typeof cryptoObject?.randomUUID === 'function') {
		return `${prefix}_${cryptoObject.randomUUID().replace(/-/g, '').slice(0, 20)}`;
	}

	if (typeof cryptoObject?.getRandomValues === 'function') {
		const randomBytes = cryptoObject.getRandomValues(new Uint8Array(10));
		const suffix = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
		return `${prefix}_${suffix}`;
	}

	throw new ServiceQuoteProtocolError(
		'SERVICE_QUOTE_UNSUPPORTED_CRYPTO',
		'Secure random id generation is unavailable in this environment.'
	);
}

export function buildQuoteRequestD(serviceAddress: string, quoteRequestId: string): string {
	assert(
		SERVICE_QUOTE_REQUEST_ID_RE.test(quoteRequestId),
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Quote request id is invalid',
		{
			quoteRequestId
		}
	);
	return `sqr:sa=${encodeURIComponent(serviceAddress)}:qr=${quoteRequestId}`;
}

export function buildProposalD(quoteRequestId: string, proposalId: string): string {
	assert(
		SERVICE_QUOTE_REQUEST_ID_RE.test(quoteRequestId),
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Quote request id is invalid',
		{
			quoteRequestId
		}
	);
	assert(
		SERVICE_PROPOSAL_ID_RE.test(proposalId),
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'Proposal id is invalid',
		{
			proposalId
		}
	);
	return `sqp:${quoteRequestId}:${proposalId}`;
}

export function buildProposalStatusD(
	proposalId: string,
	status: ServiceProposalStatus,
	actorPubkey: string
): string {
	assert(
		SERVICE_PROPOSAL_ID_RE.test(proposalId),
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'Proposal id is invalid',
		{
			proposalId
		}
	);
	assert(
		HEX_PUBKEY_RE.test(actorPubkey),
		'SERVICE_QUOTE_INVALID_ACTOR',
		'Status actor pubkey must be hex',
		{
			actorPubkey
		}
	);
	return `sqs:${proposalId}:${status}:${actorPubkey}`;
}

export function parseQuoteRequestD(value: string): {
	serviceAddress: string;
	quoteRequestId: string;
} {
	assert(
		value.startsWith('sqr:'),
		'SERVICE_QUOTE_INVALID_D',
		'Quote request d-tag must start with sqr:',
		{
			value
		}
	);
	const segments = value.split(':');
	assert(
		segments.length === 3 && segments[1].startsWith('sa=') && segments[2].startsWith('qr='),
		'SERVICE_QUOTE_INVALID_D',
		'Quote request d-tag must match sqr:sa=<serviceAddress>:qr=<quoteRequestId>',
		{ value }
	);

	const serviceAddress = decodeURIComponent(segments[1].slice(3));
	const quoteRequestId = segments[2].slice(3);
	assert(
		SERVICE_QUOTE_REQUEST_ID_RE.test(quoteRequestId),
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Quote request id is invalid',
		{
			value
		}
	);

	return { serviceAddress, quoteRequestId };
}

export function parseProposalD(value: string): { quoteRequestId: string; proposalId: string } {
	const segments = value.split(':');
	assert(
		segments.length === 3 && segments[0] === 'sqp',
		'SERVICE_QUOTE_INVALID_D',
		'Proposal d-tag must match sqp:<quoteRequestId>:<proposalId>',
		{ value }
	);
	const [, quoteRequestId, proposalId] = segments;
	assert(
		SERVICE_QUOTE_REQUEST_ID_RE.test(quoteRequestId),
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Quote request id is invalid',
		{
			value
		}
	);
	assert(
		SERVICE_PROPOSAL_ID_RE.test(proposalId),
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'Proposal id is invalid',
		{
			value
		}
	);

	return { quoteRequestId, proposalId };
}

export function parseProposalStatusD(value: string): {
	proposalId: string;
	status: ServiceProposalStatus;
	actorPubkey: string;
} {
	const segments = value.split(':');
	assert(
		segments.length === 4 && segments[0] === 'sqs',
		'SERVICE_QUOTE_INVALID_D',
		'Status d-tag must match sqs:<proposalId>:<status>:<actorPubkey>',
		{ value }
	);
	const [, proposalId, status, actorPubkey] = segments;
	assert(
		SERVICE_PROPOSAL_ID_RE.test(proposalId),
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'Proposal id is invalid',
		{
			value
		}
	);
	assert(
		status in STATUS_ROLE_MAP,
		'SERVICE_QUOTE_INVALID_STATUS',
		'Status d-tag has an invalid status',
		{
			value
		}
	);
	assert(
		HEX_PUBKEY_RE.test(actorPubkey),
		'SERVICE_QUOTE_INVALID_ACTOR',
		'Status d-tag actor pubkey must be hex',
		{
			value
		}
	);

	return {
		proposalId,
		status: status as ServiceProposalStatus,
		actorPubkey
	};
}

function getTagValues(tags: string[][], key: string): string[] {
	return tags
		.filter((tag) => tag[0] === key)
		.map((tag) => tag[1])
		.filter(Boolean);
}

function getSingleTagValue(
	tags: string[][],
	key: string,
	required: boolean = true
): string | undefined {
	const values = getTagValues(tags, key);
	if (required) {
		assert(
			values.length === 1,
			'SERVICE_QUOTE_INVALID_TAG_CARDINALITY',
			`Expected exactly one ${key} tag`,
			{
				key,
				count: values.length
			}
		);
	} else {
		assert(
			values.length <= 1,
			'SERVICE_QUOTE_INVALID_TAG_CARDINALITY',
			`Expected at most one ${key} tag`,
			{
				key,
				count: values.length
			}
		);
	}

	return values[0];
}

function assertForbiddenTags(tags: string[][], keys: string[]): void {
	for (const key of keys) {
		assert(
			getTagValues(tags, key).length === 0,
			'SERVICE_QUOTE_FORBIDDEN_TAG',
			`Tag ${key} is not allowed for this event`,
			{
				key
			}
		);
	}
}

function assertOptionalMirrorTag(tags: string[][], serviceAddress: string): void {
	const mirror = getSingleTagValue(tags, TAGS.T, false);
	if (mirror) {
		assert(
			mirror === serviceAddress,
			'SERVICE_QUOTE_INVALID_MIRROR_TAG',
			'Optional t tag must equal service address',
			{
				mirror,
				serviceAddress
			}
		);
	}
}

function assertCanonicalMessageType(
	event: NostrEvent,
	type: ServiceQuoteMessageType,
	contentType: string,
	tagType: string | undefined
): void {
	assert(
		contentType === type,
		'SERVICE_QUOTE_INVALID_CONTENT_TYPE',
		'Payload type does not match event kind',
		{
			contentType,
			expected: type
		}
	);
	assert(
		tagType === type,
		'SERVICE_QUOTE_INVALID_MESSAGE_TAG',
		'Message tag does not match event kind',
		{
			tagType,
			expected: type
		}
	);
}

function assertTimestampEqual(timestamp: number, createdAt: number, code: string): void {
	assert(timestamp === createdAt, code, 'Payload timestamp must equal event created_at', {
		timestamp,
		createdAt
	});
}

function assertStatusTimestamp(
	content: ServiceProposalStatusContent,
	event: NostrEvent,
	now: number
): void {
	assert(
		content.timestamp <= event.created_at,
		'SERVICE_QUOTE_INVALID_STATUS_TIMESTAMP',
		'Status timestamp must be <= created_at',
		{
			timestamp: content.timestamp,
			createdAt: event.created_at
		}
	);
	assert(
		event.created_at - content.timestamp <= 120,
		'SERVICE_QUOTE_INVALID_STATUS_TIMESTAMP',
		'Status created_at may not lag timestamp by more than 120s',
		{
			timestamp: content.timestamp,
			createdAt: event.created_at
		}
	);
	assert(
		event.created_at <= now + 120,
		'SERVICE_QUOTE_INVALID_STATUS_TIMESTAMP',
		'Status created_at exceeds allowed clock skew',
		{
			createdAt: event.created_at,
			now
		}
	);
	assert(
		content.timestamp <= now + 120,
		'SERVICE_QUOTE_INVALID_STATUS_TIMESTAMP',
		'Status timestamp exceeds allowed clock skew',
		{
			timestamp: content.timestamp,
			now
		}
	);
}

function hasPublishableAcceptedSnapshot(
	content: Pick<
		ServiceProposalStatusContent,
		'status' | 'escrowId' | 'transactionHash' | 'acceptanceSnapshot'
	>
): boolean {
	if (content.status !== 'accepted') {
		return true;
	}

	// Native RGB/Taproot escrow: acceptance requires a contract id and the
	// funding transaction hash. The legacy EVM acceptanceSnapshot fields
	// (clientBtcAddress, amountSats, chainId, ...) are no longer produced by the
	// UTXEO SDK flow, so they are not enforced here.
	return (
		typeof content.escrowId === 'string' &&
		content.escrowId.trim().length > 0 &&
		typeof content.transactionHash === 'string' &&
		TRANSACTION_HASH_RE.test(content.transactionHash)
	);
}

function assertPublishableAcceptedSnapshot(content: ServiceProposalStatusContent): void {
	if (content.status !== 'accepted') {
		return;
	}

	assert(
		hasPublishableAcceptedSnapshot(content),
		'SERVICE_QUOTE_INVALID_ACCEPTED_SNAPSHOT',
		'Accepted service proposal status requires verified escrow metadata and an acceptance snapshot.',
		{
			proposalId: content.proposalId,
			escrowId: content.escrowId,
			transactionHash: content.transactionHash
		}
	);
}

export function computeProposalExpiration(createdAt: number, days: number, hours: number): number {
	return createdAt + days * 86400 + hours * 3600;
}

export function getServiceQuoteMessageType(kind: number): ServiceQuoteMessageType {
	const messageType = KIND_TO_MESSAGE_TYPE[kind];
	assert(
		Boolean(messageType),
		'SERVICE_QUOTE_INVALID_KIND',
		'Unsupported service quote event kind',
		{
			kind
		}
	);
	return messageType;
}

export function validateServiceQuoteRequestEvent(event: NostrEvent): ServiceQuoteRequestEvent {
	const content = getEventContent<ServiceQuoteRequestContent>(event);
	const dTag = getSingleTagValue(event.tags, TAGS.D);
	const serviceAddress = getSingleTagValue(event.tags, TAGS.A);
	const recipient = getSingleTagValue(event.tags, TAGS.P);
	const messageType = getSingleTagValue(event.tags, TAGS.M);
	const network = getSingleTagValue(event.tags, TAGS.N);
	const schemaVersion = getSingleTagValue(event.tags, TAGS.Z);

	assert(
		event.kind === KINDS.SERVICE_QUOTE_REQUEST,
		'SERVICE_QUOTE_INVALID_KIND',
		'Quote request event kind is invalid',
		{
			kind: event.kind
		}
	);
	assertCanonicalMessageType(event, SERVICE_QUOTE_MESSAGE_TYPES.REQUEST, content.type, messageType);
	assert(
		schemaVersion === SERVICE_QUOTE_SCHEMA_VERSION,
		'SERVICE_QUOTE_INVALID_SCHEMA_VERSION',
		'Schema version must be v1',
		{
			schemaVersion
		}
	);
	assert(
		Boolean(network),
		'SERVICE_QUOTE_INVALID_NETWORK',
		'Quote request network tag is required'
	);
	assertForbiddenTags(event.tags, [TAGS.E, 'expiration']);

	const parsedD = parseQuoteRequestD(dTag!);
	assert(
		serviceAddress === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ADDRESS',
		'a tag must equal payload serviceAddress',
		{
			serviceAddress,
			payload: content.serviceAddress
		}
	);
	assert(
		parsedD.serviceAddress === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ADDRESS',
		'd tag service address must equal payload serviceAddress',
		{
			dTag,
			payload: content.serviceAddress
		}
	);
	assert(
		content.serviceId === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ID',
		'serviceId must equal serviceAddress',
		{
			serviceId: content.serviceId,
			serviceAddress: content.serviceAddress
		}
	);
	assert(
		parsedD.quoteRequestId === content.quoteRequestId,
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'd tag quoteRequestId must equal payload quoteRequestId',
		{
			dTag,
			payload: content.quoteRequestId
		}
	);
	assert(
		SERVICE_QUOTE_REQUEST_ID_RE.test(content.quoteRequestId),
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Quote request id is invalid',
		{
			quoteRequestId: content.quoteRequestId
		}
	);
	assert(
		recipient === parseServiceAddress(content.serviceAddress).pubkey,
		'SERVICE_QUOTE_INVALID_RECIPIENT',
		'Quote request p tag must equal service owner pubkey',
		{
			recipient,
			serviceAddress: content.serviceAddress
		}
	);
	assertOptionalMirrorTag(event.tags, content.serviceAddress);
	assertTimestampEqual(content.timestamp, event.created_at, 'SERVICE_QUOTE_INVALID_TIMESTAMP');
	assert(
		Boolean(content.inquiry?.title?.trim()),
		'SERVICE_QUOTE_INVALID_INQUIRY',
		'Inquiry title is required'
	);
	assert(
		Boolean(content.inquiry?.description?.trim()),
		'SERVICE_QUOTE_INVALID_INQUIRY',
		'Inquiry description is required'
	);
	assert(
		(content.inquiry.attachments?.length ?? 0) <= 10,
		'SERVICE_QUOTE_INVALID_ATTACHMENTS',
		'Inquiry attachments may not exceed 10'
	);

	return {
		...event,
		kind: KINDS.SERVICE_QUOTE_REQUEST as 6420,
		content
	};
}

export function validateServiceProposalEvent(event: NostrEvent): ServiceProposalEvent {
	const content = getEventContent<ServiceProposalContent>(event);
	const dTag = getSingleTagValue(event.tags, TAGS.D);
	const serviceAddress = getSingleTagValue(event.tags, TAGS.A);
	const recipient = getSingleTagValue(event.tags, TAGS.P);
	const parentEventId = getSingleTagValue(event.tags, TAGS.E);
	const messageType = getSingleTagValue(event.tags, TAGS.M);
	const network = getSingleTagValue(event.tags, TAGS.N);
	const schemaVersion = getSingleTagValue(event.tags, TAGS.Z);
	const expirationTag = getSingleTagValue(event.tags, 'expiration');

	assert(
		event.kind === KINDS.SERVICE_PROPOSAL,
		'SERVICE_QUOTE_INVALID_KIND',
		'Proposal event kind is invalid',
		{
			kind: event.kind
		}
	);
	assertCanonicalMessageType(
		event,
		SERVICE_QUOTE_MESSAGE_TYPES.PROPOSAL,
		content.type,
		messageType
	);
	assert(
		schemaVersion === SERVICE_QUOTE_SCHEMA_VERSION,
		'SERVICE_QUOTE_INVALID_SCHEMA_VERSION',
		'Schema version must be v1',
		{
			schemaVersion
		}
	);
	assert(Boolean(network), 'SERVICE_QUOTE_INVALID_NETWORK', 'Proposal network tag is required');
	assert(
		Boolean(parentEventId),
		'SERVICE_QUOTE_INVALID_PARENT',
		'Proposal must reference exactly one quote request via e tag'
	);

	const parsedD = parseProposalD(dTag!);
	assert(
		serviceAddress === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ADDRESS',
		'a tag must equal payload serviceAddress',
		{
			serviceAddress,
			payload: content.serviceAddress
		}
	);
	assert(
		content.serviceId === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ID',
		'serviceId must equal serviceAddress',
		{
			serviceId: content.serviceId,
			serviceAddress: content.serviceAddress
		}
	);
	assert(
		parsedD.quoteRequestId === content.quoteRequestId,
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Proposal d-tag request id must equal payload request id',
		{
			dTag,
			payload: content.quoteRequestId
		}
	);
	assert(
		parsedD.proposalId === content.proposalId,
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'Proposal d-tag proposal id must equal payload proposal id',
		{
			dTag,
			payload: content.proposalId
		}
	);
	assert(
		SERVICE_PROPOSAL_ID_RE.test(content.proposalId),
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'Proposal id is invalid',
		{
			proposalId: content.proposalId
		}
	);
	assert(
		SERVICE_QUOTE_REQUEST_ID_RE.test(content.quoteRequestId),
		'SERVICE_QUOTE_INVALID_REQUEST_ID',
		'Quote request id is invalid',
		{
			quoteRequestId: content.quoteRequestId
		}
	);
	assert(
		recipient !== event.pubkey,
		'SERVICE_QUOTE_INVALID_RECIPIENT',
		'Proposal recipient must be the tasker, not the author',
		{
			recipient,
			author: event.pubkey
		}
	);
	assertOptionalMirrorTag(event.tags, content.serviceAddress);
	assertTimestampEqual(content.timestamp, event.created_at, 'SERVICE_QUOTE_INVALID_TIMESTAMP');
	assert(
		SERVICE_QUOTE_DECIMAL_RE.test(content.amountUsdt),
		'SERVICE_QUOTE_INVALID_AMOUNT',
		'Proposal amount must be numeric with up to 2 decimal places',
		{
			amountUsdt: content.amountUsdt
		}
	);
	assert(
		content.estimatedEndTime > content.estimatedStartTime,
		'SERVICE_QUOTE_INVALID_TIMING',
		'Proposal estimated end time must be after start time',
		{
			start: content.estimatedStartTime,
			end: content.estimatedEndTime
		}
	);

	const computedExpiration = computeProposalExpiration(
		event.created_at,
		content.expirationDays,
		content.expirationHours
	);
	assert(
		content.expirationTimestamp === computedExpiration,
		'SERVICE_QUOTE_INVALID_EXPIRATION',
		'Proposal expirationTimestamp must match computed expiration',
		{
			expirationTimestamp: content.expirationTimestamp,
			computedExpiration
		}
	);
	assert(
		expirationTag === String(computedExpiration),
		'SERVICE_QUOTE_INVALID_EXPIRATION',
		'Proposal expiration tag must match computed expiration',
		{
			expirationTag,
			computedExpiration
		}
	);

	return {
		...event,
		kind: KINDS.SERVICE_PROPOSAL as 6421,
		content
	};
}

export function validateServiceProposalStatusEvent(
	event: NostrEvent,
	now: number = nowSeconds()
): ServiceProposalStatusEvent {
	const content = getEventContent<ServiceProposalStatusContent>(event);
	const dTag = getSingleTagValue(event.tags, TAGS.D);
	const serviceAddress = getSingleTagValue(event.tags, TAGS.A);
	const recipient = getSingleTagValue(event.tags, TAGS.P);
	const parentEventId = getSingleTagValue(event.tags, TAGS.E);
	const messageType = getSingleTagValue(event.tags, TAGS.M);
	const network = getSingleTagValue(event.tags, TAGS.N);
	const schemaVersion = getSingleTagValue(event.tags, TAGS.Z);
	const statusTag = getSingleTagValue(event.tags, TAGS.S);

	assert(
		event.kind === KINDS.SERVICE_PROPOSAL_STATUS,
		'SERVICE_QUOTE_INVALID_KIND',
		'Proposal status event kind is invalid',
		{
			kind: event.kind
		}
	);
	assertCanonicalMessageType(event, SERVICE_QUOTE_MESSAGE_TYPES.STATUS, content.type, messageType);
	assert(
		schemaVersion === SERVICE_QUOTE_SCHEMA_VERSION,
		'SERVICE_QUOTE_INVALID_SCHEMA_VERSION',
		'Schema version must be v1',
		{
			schemaVersion
		}
	);
	assert(Boolean(network), 'SERVICE_QUOTE_INVALID_NETWORK', 'Status network tag is required');
	assert(
		Boolean(parentEventId),
		'SERVICE_QUOTE_INVALID_PARENT',
		'Status must reference exactly one proposal via e tag'
	);
	assertForbiddenTags(event.tags, ['expiration']);

	const parsedD = parseProposalStatusD(dTag!);
	assert(
		serviceAddress === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ADDRESS',
		'a tag must equal payload serviceAddress',
		{
			serviceAddress,
			payload: content.serviceAddress
		}
	);
	assert(
		content.serviceId === content.serviceAddress,
		'SERVICE_QUOTE_INVALID_SERVICE_ID',
		'serviceId must equal serviceAddress',
		{
			serviceId: content.serviceId,
			serviceAddress: content.serviceAddress
		}
	);
	assert(
		statusTag === content.status,
		'SERVICE_QUOTE_INVALID_STATUS',
		's tag must equal payload status',
		{
			statusTag,
			payload: content.status
		}
	);
	assert(
		parsedD.status === content.status,
		'SERVICE_QUOTE_INVALID_STATUS',
		'd tag status must equal payload status',
		{
			dTag,
			payload: content.status
		}
	);
	assert(
		parsedD.proposalId === content.proposalId,
		'SERVICE_QUOTE_INVALID_PROPOSAL_ID',
		'd tag proposal id must equal payload proposal id',
		{
			dTag,
			payload: content.proposalId
		}
	);
	assert(
		parsedD.actorPubkey === content.actorPubkey,
		'SERVICE_QUOTE_INVALID_ACTOR',
		'd tag actor pubkey must equal payload actor pubkey',
		{
			dTag,
			payload: content.actorPubkey
		}
	);
	assert(
		event.pubkey === content.actorPubkey,
		'SERVICE_QUOTE_INVALID_ACTOR',
		'Status author must equal payload actorPubkey',
		{
			author: event.pubkey,
			payload: content.actorPubkey
		}
	);
	assertOptionalMirrorTag(event.tags, content.serviceAddress);
	assertStatusTimestamp(content, event, now);
	assertPublishableAcceptedSnapshot(content);

	const expectedRole = STATUS_ROLE_MAP[content.status];
	if (expectedRole === 'tasker') {
		assert(
			recipient !== event.pubkey,
			'SERVICE_QUOTE_INVALID_RECIPIENT',
			'Tasker-authored status recipient must be taskee',
			{
				recipient,
				author: event.pubkey
			}
		);
	} else {
		assert(
			recipient !== event.pubkey,
			'SERVICE_QUOTE_INVALID_RECIPIENT',
			'Taskee-authored status recipient must be tasker',
			{
				recipient,
				author: event.pubkey
			}
		);
	}

	return {
		...event,
		kind: KINDS.SERVICE_PROPOSAL_STATUS as 6422,
		content
	};
}

export function validateServiceQuoteEvent(
	event: NostrEvent
): ServiceQuoteRequestEvent | ServiceProposalEvent | ServiceProposalStatusEvent {
	switch (event.kind) {
		case KINDS.SERVICE_QUOTE_REQUEST:
			return validateServiceQuoteRequestEvent(event);
		case KINDS.SERVICE_PROPOSAL:
			return validateServiceProposalEvent(event);
		case KINDS.SERVICE_PROPOSAL_STATUS:
			return validateServiceProposalStatusEvent(event);
		default:
			throw new ServiceQuoteProtocolError(
				'SERVICE_QUOTE_INVALID_KIND',
				'Unsupported service quote event kind',
				{
					kind: event.kind
				}
			);
	}
}

export function isTerminalServiceProposalState(state: ResolvedServiceProposalState): boolean {
	return TERMINAL_STATES.has(state);
}

export function canPublishAcceptedStatus(enabled: boolean, status?: ServiceProposalStatus): void {
	if (status && status !== 'accepted') {
		return;
	}
	assert(
		enabled,
		'SERVICE_QUOTE_ACCEPT_DISABLED',
		'Service proposal acceptance is disabled until the purchase-key escrow capability is available'
	);
}

export function assertPublishableServiceProposalStatusContent(
	content: ServiceProposalStatusContent
): void {
	assertPublishableAcceptedSnapshot(content);
}

export function validateStatusAuthorRole(
	status: ServiceProposalStatus,
	actorPubkey: string,
	taskerPubkey: string,
	taskeePubkey: string
): void {
	const expectedRole = STATUS_ROLE_MAP[status];
	if (expectedRole === 'tasker') {
		assert(
			actorPubkey === taskerPubkey,
			'SERVICE_QUOTE_INVALID_ACTOR_ROLE',
			`Status ${status} must be authored by the tasker`,
			{ status, actorPubkey, taskerPubkey }
		);
		return;
	}

	assert(
		actorPubkey === taskeePubkey,
		'SERVICE_QUOTE_INVALID_ACTOR_ROLE',
		`Status ${status} must be authored by the taskee`,
		{ status, actorPubkey, taskeePubkey }
	);
}

function toRelayInfoEndpoint(relay: string): string {
	const normalized = relay.trim();
	if (normalized.startsWith('wss://')) {
		return `https://${normalized.slice('wss://'.length)}`;
	}
	if (normalized.startsWith('ws://')) {
		return `http://${normalized.slice('ws://'.length)}`;
	}
	return normalized;
}

export async function detectRelayCapability(relay: string): Promise<ServiceQuoteRelayCapability> {
	try {
		const response = await fetch(toRelayInfoEndpoint(relay), {
			headers: {
				Accept: 'application/nostr+json'
			}
		});

		if (!response.ok) {
			return { relay, state: 'unknown' };
		}

		const payload = (await response.json()) as { supported_nips?: number[] };
		const supportedNips = Array.isArray(payload.supported_nips) ? payload.supported_nips : [];

		return {
			relay,
			state: supportedNips.includes(40) ? 'supports_40' : 'explicit_no_40',
			supportedNips
		};
	} catch {
		return { relay, state: 'unknown' };
	}
}

export function selectProposalPublishRelays(capabilities: ServiceQuoteRelayCapability[]): string[] {
	const compatible = capabilities.filter(
		(capability) => capability.state === 'supports_40' || capability.state === 'unknown'
	);
	assert(
		compatible.length > 0,
		'SERVICE_PROPOSAL_NO_COMPATIBLE_RELAY',
		'No compatible relay is available for expiration-tagged proposals'
	);
	return compatible.map((capability) => capability.relay);
}

export function summarizeServiceQuoteContext(
	request: ServiceQuoteRequestContent,
	proposal?: ServiceProposalContent
): ServiceQuoteContextSummary {
	return {
		title: request.inquiry.title,
		description: proposal?.description || request.inquiry.description,
		serviceAddress: request.serviceAddress,
		serviceId: request.serviceId,
		selectedTierId: proposal?.pricingSnapshot.tierId || request.tierId,
		selectedAddOns: proposal?.pricingSnapshot.selectedAddOns || request.selectedAddOns,
		rushDelivery: proposal?.pricingSnapshot.rushDelivery ?? request.rushDelivery,
		estimatedStartTime: proposal?.estimatedStartTime,
		estimatedEndTime: proposal?.estimatedEndTime,
		priceLabel: proposal?.amountUsdt
	};
}

export function resolveProposalState(
	proposal: ServiceProposalEvent,
	statusEvents: ServiceProposalStatusEvent[],
	now: number = nowSeconds()
): ResolvedServiceProposal {
	const expiresAt = proposal.content.expirationTimestamp;
	const sortedStatuses = [...statusEvents].sort((left, right) => {
		if (left.created_at !== right.created_at) {
			return left.created_at - right.created_at;
		}

		return left.id.localeCompare(right.id);
	});
	const validStatuses = sortedStatuses.filter((statusEvent) =>
		isStatusEligibleForResolution(statusEvent, expiresAt)
	);
	const acceptedTransitionStatuses = buildValidStatusTransitionHistory(validStatuses);
	const latestResolvedStatus = acceptedTransitionStatuses.at(-1);
	const winningStatus =
		latestResolvedStatus?.content.status === 'accepted' ||
		latestResolvedStatus?.content.status === 'declined' ||
		latestResolvedStatus?.content.status === 'withdrawn'
			? latestResolvedStatus
			: undefined;
	let state: ResolvedServiceProposalState = 'pending';

	if (winningStatus) {
		state = winningStatus.content.status;
	} else if (now >= expiresAt) {
		state = 'expired';
	} else {
		const transient = [...acceptedTransitionStatuses]
			.reverse()
			.find(
				(event) =>
					event.content.status === 'accepting' ||
					event.content.status === 'contract_sync_pending' ||
					event.content.status === 'accept_failed' ||
					event.content.status === 'accept_unknown'
			);
		state = transient?.content.status || 'pending';
	}

	const latestLinkedStatus = [...acceptedTransitionStatuses]
		.reverse()
		.find(
			(event) =>
				typeof event.content.escrowId === 'string' &&
				event.content.escrowId.trim().length > 0 &&
				(event.content.status === 'accepted' ||
					event.content.status === 'contract_sync_pending' ||
					event.content.status === 'accept_unknown')
		);

	return {
		proposal,
		statusEvents: acceptedTransitionStatuses,
		state,
		expiresAt,
		isExpired: now >= expiresAt,
		linkedEscrowId: latestLinkedStatus?.content.escrowId,
		linkedTransactionHash: latestLinkedStatus?.content.transactionHash,
		winningStatus
	};
}

function isStatusEligibleForResolution(
	statusEvent: ServiceProposalStatusEvent,
	expirationTimestamp: number
): boolean {
	if (statusEvent.content.timestamp >= expirationTimestamp) {
		return false;
	}

	if (
		statusEvent.content.status === 'accepted' &&
		!hasPublishableAcceptedSnapshot(statusEvent.content)
	) {
		return false;
	}

	return true;
}

function buildValidStatusTransitionHistory(
	statusEvents: ServiceProposalStatusEvent[]
): ServiceProposalStatusEvent[] {
	const acceptedStatuses: ServiceProposalStatusEvent[] = [];
	let currentState: 'pending' | ServiceProposalStatus = 'pending';

	for (const statusEvent of statusEvents) {
		const nextStatus = statusEvent.content.status;
		if (!ALLOWED_STATUS_TRANSITIONS[currentState].has(nextStatus)) {
			if (
				!isReconciliationContinuationAllowed(
					currentState,
					statusEvent,
					acceptedStatuses.at(-1),
					acceptedStatuses
				)
			) {
				continue;
			}
		}

		acceptedStatuses.push(statusEvent);
		currentState = nextStatus;
		if (RESOLUTION_HALT_STATES.has(nextStatus)) {
			break;
		}
	}

	return acceptedStatuses;
}

function isReconciliationContinuationAllowed(
	currentState: 'pending' | ServiceProposalStatus,
	statusEvent: ServiceProposalStatusEvent,
	latestAcceptedStatus: ServiceProposalStatusEvent | undefined,
	acceptedStatuses: ServiceProposalStatusEvent[]
): boolean {
	const nextStatus = statusEvent.content.status;

	if (currentState === 'accepted' && nextStatus === 'accept_unknown') {
		return hasMatchingAcceptanceLineage(statusEvent, latestAcceptedStatus);
	}

	if (currentState === 'accepted' && nextStatus === 'contract_sync_pending') {
		return hasMatchingAcceptanceLineage(statusEvent, latestAcceptedStatus);
	}

	if (currentState === 'accept_unknown' && nextStatus === 'accepted') {
		const priorAcceptedStatus = [...acceptedStatuses]
			.reverse()
			.find((event) => event.content.status === 'accepted');

		if (!priorAcceptedStatus) {
			return Boolean(statusEvent.content.escrowId);
		}

		return hasMatchingAcceptanceLineage(statusEvent, priorAcceptedStatus);
	}

	if (currentState === 'contract_sync_pending' && nextStatus === 'accepted') {
		const priorAcceptedStatus = [...acceptedStatuses]
			.reverse()
			.find((event) => event.content.status === 'accepted');

		if (!priorAcceptedStatus) {
			return Boolean(statusEvent.content.escrowId);
		}

		return hasMatchingAcceptanceLineage(statusEvent, priorAcceptedStatus);
	}

	if (currentState === 'contract_sync_pending' && nextStatus === 'accept_unknown') {
		const priorAcceptedStatus = [...acceptedStatuses]
			.reverse()
			.find((event) => event.content.status === 'accepted');

		return hasMatchingAcceptanceLineage(statusEvent, priorAcceptedStatus ?? latestAcceptedStatus);
	}

	return false;
}

function hasMatchingAcceptanceLineage(
	left: ServiceProposalStatusEvent | undefined,
	right: ServiceProposalStatusEvent | undefined
): boolean {
	if (!left || !right) {
		return false;
	}

	const leftEscrowId = normalizeOptionalIdentifier(left.content.escrowId);
	const rightEscrowId = normalizeOptionalIdentifier(right.content.escrowId);
	if (leftEscrowId && rightEscrowId) {
		return leftEscrowId === rightEscrowId;
	}

	const leftTransactionHash = normalizeOptionalIdentifier(left.content.transactionHash);
	const rightTransactionHash = normalizeOptionalIdentifier(right.content.transactionHash);
	if (leftTransactionHash && rightTransactionHash) {
		return leftTransactionHash === rightTransactionHash;
	}

	return false;
}

function normalizeOptionalIdentifier(value: string | undefined): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalizedValue = value.trim().toLowerCase();
	return normalizedValue.length > 0 ? normalizedValue : null;
}
