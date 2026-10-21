import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import type { NotificationCenterItem } from '$lib/types/notification';
import { getNpub } from '$lib/utils/nostrKeys';
import { resolveSharedRelays } from '$lib/utils/relayUrls';
import { showBrowserNotification } from '$lib/utils/notifications/browser-push';

const READ_KEY = 'bittasker.activity-notifications.read.v1';
const HIDDEN_KEY = 'bittasker.activity-notifications.hidden.v1';
const RECENT_TASK_SECONDS = 30 * 60;

const INBOX_KINDS = [
	KINDS.BIDS,
	KINDS.BID_STATUS,
	KINDS.CONTRACT_STATUS,
	KINDS.DIRECT_MESSAGES,
	KINDS.REVIEW,
	KINDS.SERVICE_QUOTE_REQUEST,
	KINDS.SERVICE_PROPOSAL_STATUS
];

type ActivityEvent = Pick<NostrEvent, 'id' | 'kind' | 'pubkey' | 'created_at' | 'tags' | 'content'>;

export interface LaterNotice {
	notice: NotificationCenterItem;
	atMs: number;
}

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

function taskTitleOf(event: ActivityEvent): string {
	const body = jsonBody(event.content);
	const title = body?.contractTitle ?? body?.taskTitle ?? body?.title;
	return typeof title === 'string' ? title.trim() : '';
}

function withTask(label: string, task: string): string {
	return task ? `${label}: ${task}` : label;
}

function grouped(value: number): string {
	return Math.round(value)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Sats when the escrow was priced in sats. Dollars when it was priced in dollars. */
export function receivedAmount(body: Record<string, unknown> | null): string {
	const currency =
		typeof body?.lockedCurrency === 'string' ? body.lockedCurrency.toUpperCase() : '';
	const locked = typeof body?.lockedAmount === 'number' ? body.lockedAmount : 0;
	const sats = typeof body?.amountSats === 'number' ? body.amountSats : 0;
	if ((currency === 'SATS' || currency === 'SAT') && locked > 0) return `${grouped(locked)} sats`;
	if (sats > 0 && currency !== 'USD') return `${grouped(sats)} sats`;
	const dollars =
		currency === 'USD' && locked > 0
			? locked
			: typeof body?.totalAmountUsd === 'number'
				? body.totalAmountUsd
				: 0;
	if (dollars > 0) return `$${dollars.toFixed(2)}`;
	return 'the escrow payment';
}

function paymentReleasedBody(event: ActivityEvent): string {
	const task = taskTitleOf(event) || 'this task';
	return `Payment released: you received ${receivedAmount(jsonBody(event.content))} for ${task}`;
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
		data: { deepLink, senderNpub: event.pubkey, ...extra },
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

/** Second `p` tag is the hirer. The worker uses the earning contract page. */
export function contractLink(event: ActivityEvent, viewerHex: string): string {
	const contractId = tagValue(event, 'r') || tagValue(event, 'e');
	if (!contractId) return '/notifications';
	const parties = event.tags
		.filter((tag) => tag[0] === 'p' && tag[1])
		.map((tag) => tag[1].toLowerCase());
	const hiring = parties.length >= 2 && parties[1] === viewerHex;
	const base = hiring ? '/hiring/contracts/' : '/earning/contracts/';
	return safeLink(`${base}${encodeURIComponent(contractId)}`);
}

function contractNotice(
	event: ActivityEvent,
	viewer: string,
	status: string
): NotificationCenterItem | null {
	const task = taskTitleOf(event);
	const link = contractLink(event, viewer);
	const contractId = tagValue(event, 'r');
	const extra = { contractId };

	if (status === 'funding' || status === 'locking' || status === 'connected') {
		return item(
			event,
			viewer,
			'escrow_connected',
			withTask('Escrow connected', task),
			task
				? `Escrow was connected for ${task}.`
				: 'Escrow was connected on a contract you are part of.',
			link,
			extra
		);
	}
	if (status === 'locked') {
		return item(
			event,
			viewer,
			'escrow_locked',
			withTask('Payment sent', task),
			task
				? `Payment for ${task} was sent and is waiting for confirmation.`
				: 'Payment was sent and is waiting for confirmation.',
			link,
			extra
		);
	}
	if (status === 'funded' || status === 'ESCROW_FUNDED') {
		return item(
			event,
			viewer,
			'escrow_funded',
			withTask('Escrow funded', task),
			task
				? `Escrow for ${task} is funded. The contract starts after this confirmation.`
				: 'Escrow was funded.',
			link,
			extra
		);
	}
	if (status === 'work_submitted') {
		return item(
			event,
			viewer,
			'deliverable_submitted',
			withTask('Work submitted', task),
			task ? `Work was submitted for ${task}.` : 'Work was submitted for review.',
			link,
			extra
		);
	}
	if (status === 'approved') {
		return item(
			event,
			viewer,
			'work_approved',
			withTask('Work approved', task),
			task ? `Work on ${task} was approved.` : 'The work was approved.',
			link,
			extra
		);
	}
	if (status === 'settlement_requested') {
		return item(
			event,
			viewer,
			'payment_requested',
			withTask('Payment requested', task),
			task ? `Payment was requested for ${task}.` : 'A payment was requested.',
			link,
			extra
		);
	}
	if (status === 'released_pending' || status === 'releasing') {
		return item(
			event,
			viewer,
			'payment_pending',
			withTask('Payment sent', task),
			task
				? `Payment for ${task} is waiting for confirmation.`
				: 'Payment is waiting for confirmation.',
			link,
			extra
		);
	}
	if (status === 'released' || status === 'settled') {
		return item(
			event,
			viewer,
			'paid',
			withTask('Payment released', task),
			paymentReleasedBody(event),
			link,
			extra
		);
	}
	if (status === 'refunded') {
		return item(
			event,
			viewer,
			'escrow_refunded',
			withTask('Escrow refunded', task),
			task ? `The escrow for ${task} was refunded.` : 'The escrow was refunded.',
			link,
			extra
		);
	}
	return null;
}

/**
 * A funded escrow can be worked once its start time has passed.
 * The row id is stable so mark-read survives the next relay read.
 */
export function submitWorkPlan(
	event: ActivityEvent,
	viewerHex: string,
	nowSec: number
): LaterNotice | null {
	const viewer = viewerHex.trim().toLowerCase();
	if (!viewer || !involves(event, viewer)) return null;
	const status = (tagValue(event, 's') || '').trim();
	const normalized = status.toUpperCase();
	const contractEvent = event.kind === KINDS.CONTRACT_STATUS;
	const bidEvent = event.kind === KINDS.BID_STATUS;
	if (contractEvent && status !== 'funded' && status !== 'work_in_progress') return null;
	if (bidEvent && normalized !== 'WORK_IN_PROGRESS') return null;
	if (!contractEvent && !bidEvent) return null;
	const parties = event.tags
		.filter((tag) => tag[0] === 'p' && tag[1])
		.map((tag) => tag[1].toLowerCase());
	if (parties.length >= 2 && parties[1] === viewer) return null;

	const bodyJson = jsonBody(event.content);
	const escrowId = typeof bodyJson?.escrowId === 'string' ? bodyJson.escrowId : '';
	const contractId = tagValue(event, 'r') || escrowId || tagValue(event, 'e') || event.id;
	const task = taskTitleOf(event);
	const start = bodyJson?.estimatedStartTime;
	const startSec = typeof start === 'number' && Number.isFinite(start) ? start : 0;
	const future = startSec > nowSec;
	const notice = item(
		{ ...event, id: `start:${contractId}` },
		viewer,
		'can_submit_work',
		withTask('You can submit work', task),
		future
			? task
				? `The start time for ${task} has been reached.`
				: 'The start time has been reached.'
			: task
				? `You can submit work for ${task}.`
				: 'You can submit work.',
		contractEvent ? contractLink(event, viewer) : taskLink(event),
		{ contractId }
	);
	const atMs = startSec > nowSec ? startSec * 1000 : Date.now();
	return { notice, atMs };
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
	const task = taskTitleOf(event);

	if (event.kind === KINDS.BIDS && (message === 'bid' || message === '')) {
		return item(
			event,
			viewer,
			'new_bid_on_task',
			withTask('New bid', task),
			task ? `Someone bid on ${task}.` : 'Someone bid on your task.',
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
				withTask('Bid accepted', task),
				task ? `Your bid on ${task} was accepted.` : 'Your bid was accepted.',
				taskLink(event),
				{ taskId: tagValue(event, 't'), bidEventId: tagValue(event, 'e') }
			);
		}
		if (normalized === 'REJECTED') {
			return item(
				event,
				viewer,
				'bid_rejected',
				withTask('Bid declined', task),
				task ? `Your bid on ${task} was declined.` : 'Your bid was declined.',
				taskLink(event),
				{ taskId: tagValue(event, 't') }
			);
		}
		if (normalized === 'ESCROW_FUNDED') {
			return contractNotice(event, viewer, 'funded');
		}
		return null;
	}

	if (event.kind === KINDS.CONTRACT_STATUS) {
		return contractNotice(event, viewer, status);
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
		const stars = typeof rating === 'number' ? `${rating} stars` : 'a new review';
		return item(
			event,
			viewer,
			'review_received',
			withTask('New review', task),
			task ? `You received ${stars} for ${task}.` : `You received ${stars}.`,
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
			withTask('Service ordered', task),
			task ? `Someone ordered ${task}.` : 'Someone ordered your service.',
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
			withTask('Service ordered', task),
			task ? `A service order was accepted for ${task}.` : 'A service order was accepted.',
			serviceId ? safeLink(`/services/${encodeURIComponent(serviceId)}`) : '/services',
			{ serviceId }
		);
	}

	return null;
}

/** Open tasks posted by someone else. Own tasks and closed tasks stay out of the bell. */
export function notificationFromTask(
	event: ActivityEvent,
	viewerHex: string
): NotificationCenterItem | null {
	const viewer = viewerHex.trim().toLowerCase();
	if (!viewer || event.kind !== KINDS.TASK_CREATION || event.pubkey.toLowerCase() === viewer) {
		return null;
	}
	const tagged = (tagValue(event, 'S') || '').toUpperCase();
	if (tagged && tagged !== 'OPEN') return null;
	const body = jsonBody(event.content);
	const contentStatus = typeof body?.status === 'string' ? body.status.toUpperCase() : '';
	if (contentStatus && contentStatus !== 'OPEN') return null;
	const title = typeof body?.title === 'string' ? body.title.trim() : '';
	if (!title) return null;
	const description =
		typeof body?.description === 'string' ? body.description.replace(/\s+/g, ' ').trim() : '';
	const dTag = tagValue(event, 'd') || event.id;
	return item(
		event,
		viewer,
		'new_task',
		`New task: ${title}`,
		description ? description.slice(0, 140) : 'A new task was just posted.',
		safeLink(`/tasks/${encodeURIComponent(dTag)}`),
		{ taskId: dTag }
	);
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

/** Preview uses the session key already in memory. A locked passkey is left alone. */
async function messagePreview(ciphertext: string, sender: string): Promise<string | null> {
	if (!ciphertext.trim()) return null;
	try {
		const { get } = await import('svelte/store');
		const { appStore } = await import('$lib/stores/app.store');
		const nsec = get(appStore).nostrKeys.nsec;
		if (!nsec) return null;
		const { decryptDM } = await import('$lib/utils/nostr');
		const text = (await decryptDM(nsec, ciphertext, sender)).replace(/\s+/g, ' ').trim();
		if (!text || text.startsWith('{') || text.startsWith('[')) return null;
		return text.slice(0, 140);
	} catch {
		return null;
	}
}

async function withPreview(
	notice: NotificationCenterItem,
	event: ActivityEvent
): Promise<NotificationCenterItem> {
	if (notice.type !== 'new_message') return notice;
	const preview = await messagePreview(event.content, event.pubkey);
	return preview ? { ...notice, body: preview } : notice;
}

function remember(notice: NotificationCenterItem): void {
	if (primed && !seenIds.has(notice.id) && !notice.isRead) showBrowserNotification(notice);
	seenIds.add(notice.id);
}

function applyRead(notice: NotificationCenterItem, read: Set<string>): NotificationCenterItem {
	return read.has(notice.id) ? { ...notice, isRead: true, readAt: notice.createdAt } : notice;
}

/**
 * Inbox for rgb.bittasker.com. Reads public tags on the shared relays.
 * getNpub() is cache-only, so a locked passkey never opens.
 */
export async function loadActivityNotifications(
	onLater?: (notice: NotificationCenterItem, atMs: number) => void
): Promise<NotificationCenterItem[]> {
	const viewer = await viewerHex();
	if (!viewer) return [];
	const relays = resolveSharedRelays();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];

	const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
	const sinceTasks = Math.floor(Date.now() / 1000) - RECENT_TASK_SECONDS;
	const filters: Filter[] = [
		{ kinds: [KINDS.BIDS, KINDS.BID_STATUS], '#p': [viewer], limit: 40 },
		{
			kinds: [
				KINDS.CONTRACT_STATUS,
				KINDS.REVIEW,
				KINDS.DIRECT_MESSAGES,
				KINDS.SERVICE_QUOTE_REQUEST,
				KINDS.SERVICE_PROPOSAL_STATUS
			],
			'#p': [viewer],
			limit: 40
		},
		{ kinds: [KINDS.TASK_CREATION], since: sinceTasks, limit: 20 }
	];
	const batches = await Promise.all(filters.map((filter) => queryRelayEvents(relays, filter)));
	const seen = new Set<string>();
	const events = batches.flat().filter((event) => {
		if (seen.has(event.id)) return false;
		seen.add(event.id);
		return true;
	});

	const hidden = storageSet(HIDDEN_KEY);
	const read = storageSet(READ_KEY);
	const nowSec = Math.floor(Date.now() / 1000);
	const rows: NotificationCenterItem[] = [];
	for (const event of events) {
		const mapped = notificationFromTask(event, viewer) ?? notificationFromActivity(event, viewer);
		if (mapped && !hidden.has(mapped.id))
			rows.push(await withPreview(applyRead(mapped, read), event));
		const plan = submitWorkPlan(event, viewer, nowSec);
		if (!plan || hidden.has(plan.notice.id)) continue;
		const ready = applyRead(plan.notice, read);
		if (plan.atMs <= Date.now()) rows.push(ready);
		else onLater?.(ready, plan.atMs);
	}

	const unique = new Map<string, NotificationCenterItem>();
	for (const row of rows) unique.set(row.id, row);
	const items = [...unique.values()].sort((left, right) =>
		right.createdAt.localeCompare(left.createdAt)
	);
	for (const notice of items) remember(notice);
	primed = true;
	return items;
}

function openLiveSocket(
	url: string,
	filters: Filter[],
	onEvent: (event: ActivityEvent) => void,
	closed: () => boolean
): WebSocket | null {
	let socket: WebSocket;
	try {
		socket = new WebSocket(url);
	} catch {
		return null;
	}
	socket.onopen = () => {
		if (socket.readyState !== WebSocket.OPEN) return;
		filters.forEach((filter, index) => {
			try {
				socket.send(JSON.stringify(['REQ', `live-${index}`, filter]));
			} catch {
				// A socket that closes during subscribe is reopened by the inbox timer.
			}
		});
	};
	socket.onmessage = (message) => {
		if (closed()) return;
		try {
			const frame = JSON.parse(String(message.data)) as unknown[];
			if (frame[0] !== 'EVENT' || !frame[2] || typeof frame[2] !== 'object') return;
			onEvent(frame[2] as ActivityEvent);
		} catch {
			// A bad relay frame must not close the live inbox.
		}
	};
	return socket;
}

/**
 * Live relay subscription. New bids, messages, tasks, and escrow updates
 * arrive without waiting for the next poll and without a passkey prompt.
 */
export function watchActivityNotifications(
	onNotice: (notice: NotificationCenterItem) => void,
	onLater?: (notice: NotificationCenterItem, atMs: number) => void
): () => void {
	let stopped = false;
	const sockets: WebSocket[] = [];
	const liveSeen = new Set<string>();
	const timers: ReturnType<typeof setTimeout>[] = [];

	const handle = (event: ActivityEvent) => {
		void (async () => {
			if (stopped || liveSeen.has(event.id)) return;
			const viewer = await viewerHex();
			if (!viewer || stopped) return;
			liveSeen.add(event.id);
			const mapped = notificationFromTask(event, viewer) ?? notificationFromActivity(event, viewer);
			if (mapped) {
				const notice = await withPreview(mapped, event);
				remember(notice);
				onNotice(notice);
			}
			const plan = submitWorkPlan(event, viewer, Math.floor(Date.now() / 1000));
			if (!plan || liveSeen.has(plan.notice.id)) return;
			liveSeen.add(plan.notice.id);
			if (plan.atMs <= Date.now()) {
				remember(plan.notice);
				onNotice(plan.notice);
				return;
			}
			if (onLater) {
				onLater(plan.notice, plan.atMs);
				return;
			}
			timers.push(
				setTimeout(() => {
					if (stopped) return;
					remember(plan.notice);
					onNotice(plan.notice);
				}, plan.atMs - Date.now())
			);
		})();
	};

	void (async () => {
		const viewer = await viewerHex();
		const relays = resolveSharedRelays();
		if (stopped || !viewer || relays.length === 0 || typeof WebSocket === 'undefined') return;
		const since = Math.floor(Date.now() / 1000);
		const filters: Filter[] = [
			{ kinds: INBOX_KINDS, '#p': [viewer], since },
			{ kinds: [KINDS.TASK_CREATION], since }
		];
		for (const url of relays) {
			const socket = openLiveSocket(url, filters, handle, () => stopped);
			if (socket) sockets.push(socket);
		}
	})();

	return () => {
		stopped = true;
		for (const timer of timers) clearTimeout(timer);
		for (const socket of sockets) {
			try {
				socket.close();
			} catch {
				// Closing a dead socket is enough.
			}
		}
	};
}
