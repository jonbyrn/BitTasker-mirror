import { browser } from '$app/environment';
import { getSignedEvent, publishNostrEvent, publishToMultipleRelays, queryNostrEvents } from '$lib/utils/nostr';
import { getNpub, getNostrKeyPair } from '$lib/utils/nostrKeys';
import type {
	ServiceProposalContent,
	ServiceProposalEvent,
	ServiceQuotePublishSideEffectOptions,
	ServiceProposalStatusContent,
	ServiceProposalStatusEvent,
	ServiceQuotePublishResult,
	ServiceQuoteRequestContent,
	ServiceQuoteRequestEvent
} from '$lib/types/service-quote';
import type { Service, QuoteRequestPayload } from '$lib/types/service.d';
import KINDS from '$lib/utils/constants/kinds';
import { TAG_FILTERS } from '$lib/utils/constants/tags';
import {
	buildProposalD,
	buildProposalStatusD,
	buildQuoteRequestD,
	buildServiceAddress,
	assertPublishableServiceProposalStatusContent,
	canPublishAcceptedStatus,
	computeProposalExpiration,
	detectRelayCapability,
	getServiceQuoteMessageType,
	parseServiceAddress,
	selectProposalPublishRelays,
	ServiceQuoteProtocolError,
	validateServiceProposalEvent,
	validateServiceProposalStatusEvent,
	validateServiceQuoteRequestEvent,
	validateStatusAuthorRole
} from './protocol';
import { getServiceQuoteFeatureFlags } from '$lib/utils/features/serviceQuotes';
import nip44 from '$lib/nostr/nip44';
import { nip19, type Event as NostrEvent } from 'nostr-tools';
import {
	dispatchProposalPublishedSideEffects,
	dispatchQuoteRequestPublishedSideEffects
} from '$lib/utils/service-quote/notifications';

const PUBLISHED_RELAY_SET_KEY = 'bittasker.serviceQuote.publishedRelays';
const FALLBACK_DUPLICATE_LOOKBACK_SECONDS = 60 * 60 * 24 * 30;
const publishedRelaySetCache = new Map<string, string[]>();

export interface CreateServiceQuoteRequestParams {
	service: Service;
	payload: QuoteRequestPayload;
	quoteRequestId: string;
	serviceEventId?: string;
	quoteAmountUsdt?: string;
	sideEffects?: ServiceQuotePublishSideEffectOptions;
}

export interface PublishServiceProposalParams {
	content: ServiceProposalContent;
	requestEventId: string;
	taskerPubkey: string;
	relays?: string[];
	sideEffects?: ServiceQuotePublishSideEffectOptions;
}

export interface PublishServiceProposalStatusParams {
	content: ServiceProposalStatusContent;
	proposalEventId: string;
	counterpartyPubkey: string;
	taskerPubkey: string;
	taskeePubkey: string;
	relays?: string[];
}

/**
 * Publishes the canonical `6420` quote-request event for a service listing.
 * This is the only request-publish path used by service detail and browse surfaces.
 */
export async function publishServiceQuoteRequest(
	params: CreateServiceQuoteRequestParams
): Promise<ServiceQuotePublishResult<ServiceQuoteRequestEvent>> {
	const featureFlags = getServiceQuoteFeatureFlags();
	if (!featureFlags.read || !featureFlags.write) {
		const reason = !featureFlags.write ? 'writing' : 'reading';
		throw new Error(
			`Service quote ${reason} is currently unavailable. Please try again in a moment.`
		);
	}

	const serviceAddress = buildServiceAddress(params.service);
	const content: ServiceQuoteRequestContent = {
		type: getServiceQuoteMessageType(KINDS.SERVICE_QUOTE_REQUEST),
		quoteRequestId: params.quoteRequestId,
		serviceId: serviceAddress,
		serviceAddress,
		serviceEventId: params.serviceEventId ?? params.service.id,
		pricingType: params.service.pricing.type,
		tierId: params.payload.tierId,
		selectedAddOns: params.payload.selectedAddOns,
		rushDelivery: params.payload.rushDelivery,
		inquiry: {
			title: params.payload.title,
			description: params.payload.description,
			customFormResponses: params.payload.customFormResponses,
			attachments: params.payload.attachments
		},
		quoteAmountUsdt: params.quoteAmountUsdt ?? params.payload.quoteAmountUsdt,
		timestamp: unixNow(),
		version: 'v1'
	};

	const recipientPubkey = parseServiceAddress(serviceAddress).pubkey;
	const dTag = buildQuoteRequestD(serviceAddress, content.quoteRequestId);
	const duplicate = await findExistingDuplicate(KINDS.SERVICE_QUOTE_REQUEST, await getAuthorPubkey(), dTag);
	if (duplicate) {
		dispatchQuoteRequestPublishedSideEffects(duplicate as ServiceQuoteRequestEvent, params.service, params.sideEffects);
		return {
			event: duplicate as ServiceQuoteRequestEvent,
			relayResults: [],
			publishedRelaySet: getPublishedRelaySet(duplicate.id),
			duplicateOf: duplicate.id
		};
	}

	const tags = [
		['d', dTag],
		['p', recipientPubkey],
		['m', content.type],
		['a', content.serviceAddress],
		['z', content.version],
		['n', getCurrentNetwork()],
		['t', content.serviceAddress]
	];

	const { event, results } = await publishNostrEvent(
		KINDS.SERVICE_QUOTE_REQUEST,
		JSON.stringify(content),
		recipientPubkey,
		tags
	);

	const validated = validateServiceQuoteRequestEvent(event);
	const publishedRelaySet = results.filter((result) => result.success).map((result) => result.relay);
	persistPublishedRelaySet(validated.id, publishedRelaySet);
	dispatchQuoteRequestPublishedSideEffects(validated, params.service, params.sideEffects);

	return {
		event: validated,
		relayResults: results,
		publishedRelaySet
	};
}

/**
 * Publishes the canonical `6421` proposal event linked to an existing quote request.
 * The request linkage, relay selection, and duplicate suppression all fail closed here.
 */
export async function publishServiceProposal(
	params: PublishServiceProposalParams
): Promise<ServiceQuotePublishResult<ServiceProposalEvent>> {
	const featureFlags = getServiceQuoteFeatureFlags();
	if (!featureFlags.read || !featureFlags.write) {
		throw new Error('Service proposal publishing is disabled');
	}

	const authorPubkey = await getAuthorPubkey();
	const dTag = buildProposalD(params.content.quoteRequestId, params.content.proposalId);
	const duplicate = await findExistingDuplicate(KINDS.SERVICE_PROPOSAL, authorPubkey, dTag);
	if (duplicate) {
		dispatchProposalPublishedSideEffects(duplicate as ServiceProposalEvent, params.sideEffects);
		return {
			event: duplicate as ServiceProposalEvent,
			relayResults: [],
			publishedRelaySet: getPublishedRelaySet(duplicate.id),
			duplicateOf: duplicate.id
		};
	}
	await assertProposalRequestLinkage(params);

	const relayCapabilities = await Promise.all(getDefaultRelays(params.relays).map(detectRelayCapability));
	const targetRelays = selectProposalPublishRelays(relayCapabilities);
	const expirationTimestamp = computeProposalExpiration(
		params.content.timestamp,
		params.content.expirationDays,
		params.content.expirationHours
	);
	const content: ServiceProposalContent = {
		...params.content,
		expirationTimestamp
	};
	const tags = [
		['d', dTag],
		['p', params.taskerPubkey],
		['m', content.type],
		['a', content.serviceAddress],
		['z', content.version],
		['n', getCurrentNetwork()],
		['e', params.requestEventId],
		['expiration', String(expirationTimestamp)],
		['t', content.serviceAddress]
	];

	const { event, relayResults } = await publishEncryptedEvent(
		KINDS.SERVICE_PROPOSAL,
		JSON.stringify(content),
		params.taskerPubkey,
		tags,
		targetRelays
	);
	const successfulRelays = relayResults.filter((result) => result.success).map((result) => result.relay);
	if (successfulRelays.length < (targetRelays.length >= 2 ? 2 : 1)) {
		throw new Error('Service proposal publish quorum was not reached');
	}

	const validated = validateServiceProposalEvent(event);
	persistPublishedRelaySet(validated.id, successfulRelays);
	dispatchProposalPublishedSideEffects(validated, params.sideEffects);

	return {
		event: validated,
		relayResults,
		publishedRelaySet: successfulRelays
	};
}

/**
 * Publishes the canonical `6422` proposal-status event after actor-role validation.
 * Accepted-status publication remains feature-gated and duplicate status writes are suppressed.
 */
export async function publishServiceProposalStatus(
	params: PublishServiceProposalStatusParams
): Promise<ServiceQuotePublishResult<ServiceProposalStatusEvent>> {
	const featureFlags = getServiceQuoteFeatureFlags();
	if (!featureFlags.read || !featureFlags.write) {
		throw new Error('Service proposal status publishing is disabled');
	}
	canPublishAcceptedStatus(featureFlags.accept, params.content.status);
	assertPublishableServiceProposalStatusContent(params.content);
	validateStatusAuthorRole(
		params.content.status,
		params.content.actorPubkey,
		params.taskerPubkey,
		params.taskeePubkey
	);

	const expectedCounterpartyPubkey =
		params.content.status === 'withdrawn' ? params.taskerPubkey : params.taskeePubkey;
	if (params.counterpartyPubkey !== expectedCounterpartyPubkey) {
		throw new Error('Service proposal status recipient does not match the canonical counterparty.');
	}

	const authorPubkey = await getAuthorPubkey();
	const dTag = buildProposalStatusD(
		params.content.proposalId,
		params.content.status,
		params.content.actorPubkey
	);
	const duplicate = await findExistingDuplicate(KINDS.SERVICE_PROPOSAL_STATUS, authorPubkey, dTag);
	if (duplicate) {
		return {
			event: duplicate as ServiceProposalStatusEvent,
			relayResults: [],
			publishedRelaySet: getPublishedRelaySet(duplicate.id),
			duplicateOf: duplicate.id
		};
	}

	const tags = [
		['d', dTag],
		['p', params.counterpartyPubkey],
		['m', params.content.type],
		['s', params.content.status],
		['a', params.content.serviceAddress],
		['z', params.content.version],
		['n', getCurrentNetwork()],
		['e', params.proposalEventId],
		['t', params.content.serviceAddress]
	];

	const { event, results } = await publishNostrEvent(
		KINDS.SERVICE_PROPOSAL_STATUS,
		JSON.stringify(params.content),
		params.counterpartyPubkey,
		tags,
		getDefaultRelays(params.relays)
	);

	const validated = validateServiceProposalStatusEvent(event);
	const publishedRelaySet = results.filter((result) => result.success).map((result) => result.relay);
	persistPublishedRelaySet(validated.id, publishedRelaySet);

	return {
		event: validated,
		relayResults: results,
		publishedRelaySet
	};
}

export function getPublishedRelaySet(eventId: string): string[] {
	const cached = publishedRelaySetCache.get(eventId);
	if (cached) {
		return cached;
	}

	if (!browser) {
		return [];
	}

	try {
		const raw = window.localStorage.getItem(PUBLISHED_RELAY_SET_KEY);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as Record<string, string[]>;
		const relays = parsed[eventId] ?? [];
		publishedRelaySetCache.set(eventId, relays);
		return relays;
	} catch {
		return [];
	}
}

export function persistPublishedRelaySet(eventId: string, relays: string[]): void {
	publishedRelaySetCache.set(eventId, relays);
	if (!browser) {
		return;
	}

	try {
		const raw = window.localStorage.getItem(PUBLISHED_RELAY_SET_KEY);
		const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
		parsed[eventId] = relays;
		window.localStorage.setItem(PUBLISHED_RELAY_SET_KEY, JSON.stringify(parsed));
	} catch {
		// ignore storage persistence failures
	}
}

export async function findExistingDuplicate(
	kind: number,
	author: string,
	dTag: string
): Promise<NostrEvent | null> {
	const primary = await queryNostrEvents({
		kinds: [kind],
		authors: [author],
		...TAG_FILTERS.byIdentifier(dTag),
		limit: 10
	});
	if (primary.length > 0) {
		return primary[0];
	}

	const fallback = await queryNostrEvents({
		kinds: [kind],
		authors: [author],
		since: unixNow() - FALLBACK_DUPLICATE_LOOKBACK_SECONDS,
		limit: 200
	});

	return (
		fallback.find((event) => event.tags.some((tag) => tag[0] === 'd' && tag[1] === dTag)) ?? null
	);
}

async function publishEncryptedEvent(
	kind: number,
	content: string,
	recipientPubkey: string,
	tags: string[][],
	relays: string[]
): Promise<{
	event: NostrEvent;
	relayResults: { relay: string; success: boolean; error?: string }[];
}> {
	const recipientPubkeyHex = recipientPubkey.startsWith('npub')
		? (nip19.decode(recipientPubkey).data as string)
		: recipientPubkey;
	const { nsec } = await getNostrKeyPair();
	const nonce = crypto.getRandomValues(new Uint8Array(32));
	const conversationKey = await nip44.getConversationKey(nsec, recipientPubkeyHex);
	const encryptedContent = await nip44.encrypt(content, conversationKey, nonce);
	const event = await getSignedEvent({
		kind,
		content: encryptedContent,
		tags
	});
	const relayResults = await publishToMultipleRelays(event, relays);

	if (!relayResults.some((result) => result.success)) {
		throw new Error('Failed to publish event to any relay');
	}

	return {
		event,
		relayResults
	};
}

async function getAuthorPubkey(): Promise<string> {
	const npub = await getNpub();
	return npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
}

function getCurrentNetwork(): string {
	return import.meta.env.VITE_RSK_NETWORK || 'testnet';
}

function getDefaultRelays(relays?: string[]): string[] {
	if (relays && relays.length > 0) {
		return relays;
	}
	const defaultRelay = import.meta.env.VITE_NOSTR_RELAY_URL;
	return defaultRelay ? [defaultRelay] : [];
}

function unixNow(): number {
	return Math.floor(Date.now() / 1000);
}

async function assertProposalRequestLinkage(
	params: PublishServiceProposalParams
): Promise<void> {
	const requestEvents = await queryNostrEvents(
		{
			kinds: [KINDS.SERVICE_QUOTE_REQUEST],
			ids: [params.requestEventId],
			limit: 1
		},
		undefined,
		undefined,
		getDefaultRelays(params.relays)
	);
	const requestEvent = requestEvents[0];
	if (!requestEvent) {
		throw new ServiceQuoteProtocolError(
			'SERVICE_QUOTE_INVALID_PARENT',
			'Proposal publish requires a valid linked quote request event.'
		);
	}

	const validatedRequest = validateServiceQuoteRequestEvent(requestEvent);
	if (validatedRequest.pubkey !== params.taskerPubkey) {
		throw new ServiceQuoteProtocolError(
			'SERVICE_QUOTE_INVALID_RECIPIENT',
			'Proposal tasker pubkey must match the linked quote request author.'
		);
	}
	if (validatedRequest.content.quoteRequestId !== params.content.quoteRequestId) {
		throw new ServiceQuoteProtocolError(
			'SERVICE_QUOTE_INVALID_REQUEST_ID',
			'Proposal quoteRequestId must match the linked quote request.'
		);
	}
	if (validatedRequest.content.serviceAddress !== params.content.serviceAddress) {
		throw new ServiceQuoteProtocolError(
			'SERVICE_QUOTE_INVALID_SERVICE_ADDRESS',
			'Proposal serviceAddress must match the linked quote request.'
		);
	}
	if (validatedRequest.content.serviceId !== params.content.serviceId) {
		throw new ServiceQuoteProtocolError(
			'SERVICE_QUOTE_INVALID_SERVICE_ID',
			'Proposal serviceId must match the linked quote request.'
		);
	}
}
