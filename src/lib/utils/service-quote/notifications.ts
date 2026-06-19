import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import type {
	ServiceProposalEvent,
	ServiceQuoteMirrorPayload,
	ServiceQuotePublishSideEffectOptions,
	ServiceQuoteRequestEvent
} from '$lib/types/service-quote';
import type { Service } from '$lib/types/service.d';
import KINDS from '$lib/utils/constants/kinds';
import { createDebug } from '$lib/utils/debug';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { TAG_PATTERNS } from '$lib/utils/constants/tags';
import { nip44 } from 'nostr-tools';
import { buildDashboardQueryUrl } from '$lib/utils/dashboardQuery';
import { createServicesWorkspaceUrl } from '$lib/utils/service-quote/services-workspace-route';

const d = createDebug('service-quote:notifications');

const SERVICE_QUOTE_SIDE_EFFECT_LEDGER_KEY = 'bittasker.serviceQuote.sideEffects';
const SERVICE_QUOTE_NOTIFICATION_ICON =
	'https://bittasker.com/images/Logos/BitTasker-square-logo.svg';

const dispatchedSideEffects = new Set<string>();
const pendingSideEffects = new Set<string>();

type SideEffectChannel = 'push' | 'dm';

export interface ServiceContractCreatedNotificationInput {
	recipientPubkey: string;
	escrowId?: string;
	serviceTitle?: string;
	purchaseMode: 'quote' | 'instant_buy';
}

function getClientBaseUrl(): URL {
	const configuredBaseUrl = import.meta.env.VITE_CLIENT_URL;
	if (!configuredBaseUrl) {
		d.warn('client URL is not set — notification click actions will use the current origin');
		return new URL(window.location.origin);
	}
	return new URL(configuredBaseUrl);
}

function getDashboardBaseUrl(): URL {
	return new URL('/hiring', getClientBaseUrl());
}

function getEarningBaseUrl(): URL {
	return new URL('/earning', getClientBaseUrl());
}

function buildTaskerQuoteClickAction(quoteRequestId: string): string {
	return buildDashboardQueryUrl(getDashboardBaseUrl(), {
		tab: 'service-requests',
		view: 'tasker',
		request: quoteRequestId
	});
}

function buildProviderQuoteClickAction(serviceAddress: string, quoteRequestId: string): string {
	return createServicesWorkspaceUrl(getEarningBaseUrl(), {
		tab: 'service-requests',
		serviceAddress,
		requestId: quoteRequestId
	}).toString();
}

function buildContractsClickAction(escrowId?: string): string {
	return buildDashboardQueryUrl(getDashboardBaseUrl(), {
		tab: 'contracts',
		type: 'services',
		highlight: escrowId ?? null
	});
}

function buildLedgerKey(channel: SideEffectChannel, action: string, entityId: string): string {
	return `${channel}:${action}:${entityId}`;
}

async function getLedgerState(): Promise<Record<string, true>> {
	if (!browser) {
		return {};
	}

	try {
		const { value: raw } = await Preferences.get({ key: SERVICE_QUOTE_SIDE_EFFECT_LEDGER_KEY });
		if (!raw) {
			return {};
		}

		return JSON.parse(raw) as Record<string, true>;
	} catch {
		return {};
	}
}

async function persistLedgerState(state: Record<string, true>): Promise<void> {
	if (!browser) {
		return;
	}

	try {
		await Preferences.set({
			key: SERVICE_QUOTE_SIDE_EFFECT_LEDGER_KEY,
			value: JSON.stringify(state)
		});
	} catch {
		// Ignore storage failures; in-memory dedupe remains active for this session.
	}
}

async function hasDispatchedSideEffect(key: string): Promise<boolean> {
	if (dispatchedSideEffects.has(key) || pendingSideEffects.has(key)) {
		return true;
	}

	const persisted = await getLedgerState();
	if (persisted[key] === true) {
		dispatchedSideEffects.add(key);
		return true;
	}

	return false;
}

async function markSideEffectDispatched(key: string): Promise<void> {
	dispatchedSideEffects.add(key);
	const persisted = await getLedgerState();
	persisted[key] = true;
	await persistLedgerState(persisted);
}

async function sendPushNotificationOnce(
	action: string,
	entityId: string,
	input: {
		recipientPubkey: string;
		title: string;
		body: string;
		type: string;
		clickAction: string;
	}
): Promise<void> {
	if (!input.recipientPubkey) {
		return;
	}

	const ledgerKey = buildLedgerKey('push', action, entityId);
	if (await hasDispatchedSideEffect(ledgerKey)) {
		return;
	}

	pendingSideEffects.add(ledgerKey);
	try {
		await pushNotificationService.sendNotificationToNpubs({
			npubs: [input.recipientPubkey],
			title: input.title,
			body: input.body,
			type: input.type,
			clickAction: input.clickAction,
			icon: SERVICE_QUOTE_NOTIFICATION_ICON
		});
		await markSideEffectDispatched(ledgerKey);
	} finally {
		pendingSideEffects.delete(ledgerKey);
	}
}

function buildMirrorTags(payload: ServiceQuoteMirrorPayload, recipientPubkey: string): string[][] {
	return [
		...TAG_PATTERNS.directMessage(recipientPubkey),
		['m', 'service-quote-mirror'],
		['a', payload.serviceAddress],
		['e', payload.canonicalEventId, '', 'root']
	];
}

async function sendDirectMessageMirrorOnce(
	payload: ServiceQuoteMirrorPayload,
	recipientPubkey: string
): Promise<void> {
	if (!recipientPubkey) {
		return;
	}

	const ledgerKey = buildLedgerKey('dm', payload.action, payload.canonicalEventId);
	if (await hasDispatchedSideEffect(ledgerKey)) {
		return;
	}

	pendingSideEffects.add(ledgerKey);
	try {
		const recipientHex = recipientPubkey.startsWith('npub') ? recipientPubkey : recipientPubkey;
		const { nsec } = await getNostrKeyPair();
		const nonce = crypto.getRandomValues(new Uint8Array(32));
		const conversationKey = await nip44.getConversationKey(nsec, recipientHex);
		const encryptedContent = await nip44.encrypt(payload.text, conversationKey, nonce);
		const event = await getSignedEvent({
			kind: KINDS.DIRECT_MESSAGES,
			content: encryptedContent,
			tags: buildMirrorTags(payload, recipientHex)
		});
		const relayResults = await publishToMultipleRelays(event);
		if (!relayResults.some((result) => result.success)) {
			throw new Error('Failed to publish service quote DM mirror to any relay.');
		}

		await markSideEffectDispatched(ledgerKey);
	} finally {
		pendingSideEffects.delete(ledgerKey);
	}
}

function createRequestMirrorPayload(
	event: ServiceQuoteRequestEvent,
	serviceTitle: string
): ServiceQuoteMirrorPayload {
	const clickAction = buildProviderQuoteClickAction(
		event.content.serviceAddress,
		event.content.quoteRequestId
	);

	return {
		type: 'service-quote-mirror',
		version: 'v1',
		action: 'inquiry_received',
		serviceAddress: event.content.serviceAddress,
		quoteRequestId: event.content.quoteRequestId,
		canonicalEventId: event.id,
		clickAction,
		text: `New inquiry received for ${serviceTitle}. Open it in BitTasker: ${clickAction}`
	};
}

function createProposalMirrorPayload(event: ServiceProposalEvent): ServiceQuoteMirrorPayload {
	const clickAction = buildTaskerQuoteClickAction(event.content.quoteRequestId);

	return {
		type: 'service-quote-mirror',
		version: 'v1',
		action: 'proposal_received',
		serviceAddress: event.content.serviceAddress,
		quoteRequestId: event.content.quoteRequestId,
		proposalId: event.content.proposalId,
		canonicalEventId: event.id,
		clickAction,
		text: `New service proposal received. Open it in BitTasker: ${clickAction}`
	};
}

function runNonBlockingSideEffect(effect: Promise<void>, label: string): void {
	void effect.catch((error) => {
		d.warn(label, error);
	});
}

export function dispatchQuoteRequestPublishedSideEffects(
	event: ServiceQuoteRequestEvent,
	service: Pick<Service, 'title'>,
	options?: ServiceQuotePublishSideEffectOptions
): void {
	const title = service.title?.trim() || 'your service';
	const clickAction = buildProviderQuoteClickAction(
		event.content.serviceAddress,
		event.content.quoteRequestId
	);

	runNonBlockingSideEffect(
		sendPushNotificationOnce('inquiry_received', event.id, {
			recipientPubkey: event.tags.find((tag) => tag[0] === 'p')?.[1] ?? '',
			title: 'New service inquiry received',
			body: `A new inquiry was sent for ${title}.`,
			type: 'service_quote_request_received',
			clickAction
		}),
		'Failed to send service quote request notification'
	);

	if (options?.dmMirror) {
		runNonBlockingSideEffect(
			sendDirectMessageMirrorOnce(
				createRequestMirrorPayload(event, title),
				event.tags.find((tag) => tag[0] === 'p')?.[1] ?? ''
			),
			'Failed to send service quote request DM mirror'
		);
	}
}

export function dispatchProposalPublishedSideEffects(
	event: ServiceProposalEvent,
	options?: ServiceQuotePublishSideEffectOptions
): void {
	const clickAction = buildTaskerQuoteClickAction(event.content.quoteRequestId);

	runNonBlockingSideEffect(
		sendPushNotificationOnce('proposal_received', event.id, {
			recipientPubkey: event.tags.find((tag) => tag[0] === 'p')?.[1] ?? '',
			title: 'New service proposal received',
			body: 'A provider responded to your service inquiry.',
			type: 'service_quote_proposal_received',
			clickAction
		}),
		'Failed to send service proposal notification'
	);

	if (options?.dmMirror) {
		runNonBlockingSideEffect(
			sendDirectMessageMirrorOnce(
				createProposalMirrorPayload(event),
				event.tags.find((tag) => tag[0] === 'p')?.[1] ?? ''
			),
			'Failed to send service proposal DM mirror'
		);
	}
}

export function dispatchServiceContractCreatedNotification(
	input: ServiceContractCreatedNotificationInput
): void {
	const actionEntityId = input.escrowId ?? `${input.purchaseMode}:${input.recipientPubkey}`;
	const contextTitle = input.serviceTitle?.trim() || 'service';

	runNonBlockingSideEffect(
		sendPushNotificationOnce('contract_created', actionEntityId, {
			recipientPubkey: input.recipientPubkey,
			title: `New service contract created for ${contextTitle}`,
			body:
				input.purchaseMode === 'instant_buy'
					? `A buyer placed a Book Now order for ${contextTitle}.`
					: `Your service proposal for ${contextTitle} has been accepted.`,
			type: 'contract_created',
			clickAction: buildContractsClickAction(input.escrowId)
		}),
		'Failed to send service contract notification'
	);
}

export async function resetServiceQuoteSideEffectLedger(): Promise<void> {
	dispatchedSideEffects.clear();
	pendingSideEffects.clear();
	if (!browser) {
		return;
	}

	try {
		await Preferences.remove({ key: SERVICE_QUOTE_SIDE_EFFECT_LEDGER_KEY });
	} catch {
		// Ignore storage cleanup failures in tests/runtime.
	}
}
