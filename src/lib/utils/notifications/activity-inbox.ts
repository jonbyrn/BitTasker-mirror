import type { Event as NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import type { NotificationCenterItem } from '$lib/types/notification';
import { getNpub } from '$lib/utils/nostrKeys';
import { resolveSharedRelays } from '$lib/utils/relayUrls';
import { showBrowserNotification } from '$lib/utils/notifications/browser-push';

const READ_KEY = 'bittasker.activity-notifications.read.v1';
const HIDDEN_KEY = 'bittasker.activity-notifications.hidden.v1';

const CONTRACT_NOTICES: Record<string, { type: string; title: string; body: string }> = {
	funding: {
		type: 'escrow_connected',
		title: 'Escrow connected',
		body: 'Escrow was connected on a contract you are part of.'
	},
	locking: {
		type: 'escrow_connected',
		title: 'Escrow connected',
		body: 'Escrow was connected on a contract you are part of.'
	},
	connected: {
		type: 'escrow_connected',
		title: 'Escrow connected',
		body: 'Escrow was connected on a contract you are part of.'
	},
	locked: {
		type: 'escrow_locked',
		title: 'Escrow locked',
		body: 'Funds are locked in escrow.'
	},
	funded: {
		type: 'escrow_funded',
		title: 'Escrow funded',
		body: 'Escrow was funded.'
	},
	ESCROW_FUNDED: {
		type: 'escrow_funded',
		title: 'Escrow funded',
		body: 'Escrow was funded.'
	},
	work_submitted: {
		type: 'deliverable_submitted',
		title: 'Deliverable submitted',
		body: 'Work was submitted for review.'
	},
	approved: {
		type: 'approved',
		title: 'Approved',
		body: 'The work was approved.'
	},
	settlement_requested: {
		type: 'payment_requested',
		title: 'Payment requested',
		body: 'A payment was requested.'
	},
	released_pending: {
		type: 'paid',
		title: 'Paid',
		body: 'Payment is on its way.'
	},
	released: {
		type: 'paid',
		title: 'Paid',
		body: 'Escrow was paid.'
	},
	settled: {
		type: 'paid',
		title: 'Settled',
		body: 'Escrow settled.'
	}
};

type ActivityEvent = Pick<NostrEvent, 'id' | 'kind' | 'pubkey' | 'created_at' | 'tags' | 'content'>;

let primed = false;
const seenIds = new Set<string>();

function tagValue(event: ActivityEvent, name: string): string | undefined {
	return event.tags.find((tag) => tag[0] === name && tag[1])?.[1];
}

function involves(event: ActivityEvent, viewerHex: string): boolean {
	if (event.pubkey.toLowerCase() === viewerHex) return false;
	return event.tags.some((tag) => tag[0] === 'p' && tag[1]?.toLowerCase() === viewerHex);
}

function jsonBody(content: string): Record<string, unknown> | null {
	if (!content.startsWith('{')) return null;
	try {
		const parsed = JSON.parse(content) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function item(
	event: ActivityEvent,
	viewerHex: string,
	type: string,
	title: string,
	body: string,
	deepLink: string,
	extra: Record<string, unknown> = {}
): NotificationCenterItem {
	const created = new Date((event.created_at || 0) * 1000).toISOString();
	return {
		id: event.id,
		recipientNpub: viewerHex,
		type,
		title,
		body,
		isRead: false,
		priority: 'NORMAL',
		data: { deepLink, ...extra },
		dedupeKey: `${type}:${event.id}`,
		readAt: null,
		pushSentAt: null,
		dismissedAt: null,
		expiresAt: null,
		createdAt: created,
		updatedAt: created,
		userId: null
	};
}

function safeLink(path: string): string {
	return path.startsWith('/') && !path.startsWith('//') ? path : '/notifications';
}

function taskLink(event: ActivityEvent): string {
	const taskId = tagValue(event, 't');
	return taskId ? safeLink(`/task/${encodeURIComponent(taskId)}/bids`) : '/notifications';
}

function contractLink(event: ActivityEvent): string {
	const contractId = tagValue(event, 'r') || tagValue(event, 'e');
	return contractId
		? safeLink(`/hiring/contracts/${encodeURIComponent(contractId)}`)
		: '/notifications';
}

/** Map one public Nostr event into an inbox row. Tags only — no decrypt, no passkey. */
export function notificationFromActivity(
	event: ActivityEvent,
	viewerHex: string
): NotificationCenterItem | null {
	const viewer = viewerHex.trim().toLowerCase();
	if (!viewer || !event.id || !involves(event, viewer)) return null;
	const status = (tagValue(event, 's') || '').trim();
	const message = tagValue(event, 'm') || '';

	if (event.kind === KINDS.BIDS && (message === 'bid' || message === '')) {
		return item(
			event,
			viewer,
			'new_bid_on_task',
			'New bid',
			'Someone bid on your task.',
			taskLink(event),
			{ taskId: tagValue(event, 't') }
		);
	}

	if (event.kind === KINDS.BID_STATUS) {
		const normalized = status.toUpperCase();
		if (normalized === 'ACCEPTED') {
			return item(
				event,
				viewer,
				'bid_accepted',
				'Bid accepted',
				'Your bid was accepted.',
				taskLink(event),
				{ taskId: tagValue(event, 't'), bidEventId: tagValue(event, 'e') }
			);
		}
		if (normalized === 'REJECTED') {
			return item(
				event,
				viewer,
				'bid_rejected',
				'Bid rejected',
				'Your bid was rejected.',
				taskLink(event),
				{ taskId: tagValue(event, 't') }
			);
		}
		const funded = CONTRACT_NOTICES[status] || CONTRACT_NOTICES[normalized];
		if (funded?.type === 'escrow_funded') {
			return item(event, viewer, funded.type, funded.title, funded.body, taskLink(event));
		}
		return null;
	}

	if (event.kind === KINDS.CONTRACT_STATUS) {
		const notice = CONTRACT_NOTICES[status];
		if (!notice) return null;
		const bodyJson = jsonBody(event.content);
		const title =
			typeof bodyJson?.contractTitle === 'string' && bodyJson.contractTitle.trim()
				? `${notice.title}: ${bodyJson.contractTitle.trim()}`
				: notice.title;
		return item(event, viewer, notice.type, title, notice.body, contractLink(event), {
			contractId: tagValue(event, 'r')
		});
	}

	if (event.kind === KINDS.DIRECT_MESSAGES && message === 'direct-message') {
		return item(
			event,
			viewer,
			'new_message',
			'New message',
			'You have a new message.',
			'/messages',
			{ senderPubkey: event.pubkey }
		);
	}

	if (event.kind === KINDS.REVIEW) {
		const bodyJson = jsonBody(event.content);
		const rating = (bodyJson?.rating as { overallRating?: unknown } | undefined)?.overallRating;
		const stars = typeof rating === 'number' ? ` ${rating} stars.` : '';
		return item(
			event,
			viewer,
			'review_received',
			'New review',
			`You received a new review.${stars}`,
			'/reviews',
			{ contractId: tagValue(event, 'e') }
		);
	}

	if (event.kind === KINDS.SERVICE_QUOTE_REQUEST && message === 'service-quote-request') {
		const address = tagValue(event, 'a') || tagValue(event, 't') || '';
		const serviceId = address.split(':').pop() || address;
		return item(
			event,
			viewer,
			'service_ordered',
			'Service ordered',
			'Someone ordered your service.',
			serviceId ? safeLink(`/services/${encodeURIComponent(serviceId)}`) : '/services',
			{ serviceId }
		);
	}

	if (event.kind === KINDS.SERVICE_PROPOSAL_STATUS && status === 'accepted') {
		const address = tagValue(event, 'a') || '';
		const serviceId = address.split(':').pop() || address;
		return item(
			event,
			viewer,
			'service_ordered',
			'Service ordered',
			'A service order was accepted.',
			serviceId ? safeLink(`/services/${encodeURIComponent(serviceId)}`) : '/services',
			{ serviceId }
		);
	}

	return null;
}

function storageSet(key: string): Set<string> {
	if (typeof localStorage === 'undefined') return new Set();
	try {
		const parsed = JSON.parse(localStorage.getItem(key) || '[]') as unknown;
		return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
	} catch {
		return new Set();
	}
}

function writeSet(key: string, ids: Set<string>): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(key, JSON.stringify([...ids]));
}

export function markActivityRead(ids: string[]): void {
	const read = storageSet(READ_KEY);
	for (const id of ids) read.add(id);
	writeSet(READ_KEY, read);
}

export function hideActivity(ids: string[]): void {
	const hidden = storageSet(HIDDEN_KEY);
	for (const id of ids) hidden.add(id);
	writeSet(HIDDEN_KEY, hidden);
}

export function clearActivityState(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(READ_KEY);
	localStorage.removeItem(HIDDEN_KEY);
}

async function viewerHex(): Promise<string> {
	const npub = await getNpub();
	if (!npub) return '';
	if (/^[0-9a-f]{64}$/i.test(npub)) return npub.toLowerCase();
	if (!npub.startsWith('npub1')) return '';
	try {
		const decoded = nip19.decode(npub);
		return decoded.type === 'npub' && typeof decoded.data === 'string'
			? decoded.data.toLowerCase()
			: '';
	} catch {
		return '';
	}
}

/**
 * Inbox for rgb.bittasker.com. Reads public tags on the shared relays.
 * getNpub() is cache-only, so a locked passkey never opens.
 */
export async function loadActivityNotifications(): Promise<NotificationCenterItem[]> {
	const viewer = await viewerHex();
	if (!viewer) return [];
	const relays = resolveSharedRelays();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];

	const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
	const events = await queryRelayEvents(relays, {
		kinds: [
			KINDS.BIDS,
			KINDS.BID_STATUS,
			KINDS.CONTRACT_STATUS,
			KINDS.DIRECT_MESSAGES,
			KINDS.REVIEW,
			KINDS.SERVICE_QUOTE_REQUEST,
			KINDS.SERVICE_PROPOSAL_STATUS
		],
		'#p': [viewer],
		limit: 80
	});

	const hidden = storageSet(HIDDEN_KEY);
	const read = storageSet(READ_KEY);
	const items = events
		.map((event) => notificationFromActivity(event, viewer))
		.filter((notice): notice is NotificationCenterItem => notice !== null && !hidden.has(notice.id))
		.map((notice) =>
			read.has(notice.id) ? { ...notice, isRead: true, readAt: notice.createdAt } : notice
		)
		.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

	if (primed) {
		for (const notice of items) {
			if (!seenIds.has(notice.id) && !notice.isRead) showBrowserNotification(notice);
		}
	}
	for (const notice of items) seenIds.add(notice.id);
	primed = true;
	return items;
}
