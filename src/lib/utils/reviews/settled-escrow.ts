import type { Event as NostrEvent, Filter } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import { contractTaskId } from '$lib/utils/contract/contract-tabs';
import { normalizeNostrPubkey } from '$lib/utils/nostr-pubkey';
import { resolveSharedRelays } from '$lib/utils/relayUrls';

/** Terminal RGB and production outcomes. Work submitted or merely approved is not enough. */
export const SETTLED_ESCROW_STATUSES = new Set([
	'released',
	'settled',
	'fundsreleased',
	'resolved',
	'disputeresolved',
	'dispute_resolved'
]);

export interface StatusEvent {
	id: string;
	pubkey: string;
	created_at: number;
	tags: string[][];
	content?: string;
}

export interface ReviewGate {
	ok: boolean;
	reason: string;
	subjects: string[];
	status: string;
}

function tagValue(event: StatusEvent, name: string): string | undefined {
	return event.tags.find((tag) => tag[0] === name && tag[1])?.[1];
}

export function contractIdOf(event: StatusEvent): string {
	const tagged = tagValue(event, 'r');
	if (tagged) return tagged;
	if (!event.content?.startsWith('{')) return '';
	try {
		const body = JSON.parse(event.content) as { contractId?: unknown; escrowId?: unknown };
		if (typeof body.contractId === 'string') return body.contractId;
		if (typeof body.escrowId === 'string') return body.escrowId;
	} catch {
		return '';
	}
	return '';
}

export function partiesOf(event: StatusEvent): string[] {
	const parties = new Set<string>();
	const author = normalizeNostrPubkey(event.pubkey);
	if (author) parties.add(author);
	for (const tag of event.tags) {
		if (tag[0] !== 'p' || !tag[1]) continue;
		const hex = normalizeNostrPubkey(tag[1]);
		if (hex) parties.add(hex);
	}
	return [...parties];
}

export function reviewSubjects(contractId: string, event: StatusEvent | null): string[] {
	const subjects = new Set<string>();
	if (contractId) subjects.add(contractId);
	const taskId = contractTaskId(contractId);
	if (taskId) subjects.add(taskId);
	for (const tag of event?.tags ?? []) {
		if ((tag[0] !== 't' && tag[0] !== 'd' && tag[0] !== 'a') || !tag[1]) continue;
		subjects.add(tag[1]);
		const tail = tag[1].split(':').pop();
		if (tail) subjects.add(tail);
	}
	return [...subjects];
}

/**
 * Both parties may review only after the latest public status for that escrow is settled.
 * Callers pass events already read from relays. This does not sign or unlock a key.
 */
export function reviewGateFor(
	events: readonly StatusEvent[],
	contractId: string,
	reviewer: string,
	reviewee: string
): ReviewGate {
	const reviewerHex = normalizeNostrPubkey(reviewer);
	const revieweeHex = normalizeNostrPubkey(reviewee);
	const denied = (reason: string): ReviewGate => ({
		ok: false,
		reason,
		subjects: [],
		status: ''
	});
	if (!contractId || !reviewerHex || !revieweeHex || reviewerHex === revieweeHex) {
		return denied('Only the hirer and worker on a settled escrow can leave a review.');
	}

	const matches = events.filter((event) => contractIdOf(event) === contractId);
	const latest = matches.sort((left, right) => right.created_at - left.created_at)[0];
	if (!latest) {
		return denied('Only the hirer and worker on a settled escrow can leave a review.');
	}
	const status = (tagValue(latest, 's') || '').trim();
	const normalized = status.toLowerCase().replace(/[\s_-]/g, '');
	const settled =
		SETTLED_ESCROW_STATUSES.has(status) ||
		SETTLED_ESCROW_STATUSES.has(status.toLowerCase()) ||
		SETTLED_ESCROW_STATUSES.has(normalized);
	if (!settled) {
		return denied('You can leave a review after the escrow settles.');
	}
	const parties = partiesOf(latest);
	if (!parties.includes(reviewerHex) || !parties.includes(revieweeHex)) {
		return denied('Only the hirer and worker on a settled escrow can leave a review.');
	}
	return {
		ok: true,
		reason: '',
		subjects: reviewSubjects(contractId, latest),
		status
	};
}

export interface SettledReviewSlot {
	contractId: string;
	revieweePubkey: string;
	status: string;
	subjects: string[];
	completedAt: number;
}

export function settledReviewSlots(
	events: readonly StatusEvent[],
	reviewer: string,
	reviewedContractIds: ReadonlySet<string>
): SettledReviewSlot[] {
	const reviewerHex = normalizeNostrPubkey(reviewer);
	if (!reviewerHex) return [];
	const latest = new Map<string, StatusEvent>();
	for (const event of events) {
		const contractId = contractIdOf(event);
		if (!contractId) continue;
		const current = latest.get(contractId);
		if (!current || event.created_at >= current.created_at) latest.set(contractId, event);
	}

	const slots: SettledReviewSlot[] = [];
	for (const [contractId, event] of latest) {
		if (reviewedContractIds.has(contractId)) continue;
		const parties = partiesOf(event);
		if (!parties.includes(reviewerHex)) continue;
		const others = parties.filter((party) => party !== reviewerHex);
		if (others.length === 0) continue;
		const gate = reviewGateFor(events, contractId, reviewerHex, others[0]);
		if (!gate.ok) continue;
		slots.push({
			contractId,
			revieweePubkey: others[0],
			status: gate.status,
			subjects: gate.subjects,
			completedAt: event.created_at
		});
	}
	return slots.sort((left, right) => right.completedAt - left.completedAt);
}

export function reviewedContractIds(events: readonly StatusEvent[]): Set<string> {
	const ids = new Set<string>();
	for (const event of events) {
		const tagged = tagValue(event, 'e');
		if (tagged) ids.add(tagged);
		if (!event.content?.startsWith('{')) continue;
		try {
			const body = JSON.parse(event.content) as { escrowId?: unknown; contractId?: unknown };
			if (typeof body.escrowId === 'string') ids.add(body.escrowId);
			if (typeof body.contractId === 'string') ids.add(body.contractId);
		} catch {
			// Ignore a review whose content is not JSON.
		}
	}
	return ids;
}

async function readStatus(filter: Filter): Promise<NostrEvent[]> {
	const relays = resolveSharedRelays();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];
	const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
	return queryRelayEvents(relays, filter);
}

/** Public contract-status and review events for one pubkey. Does not unlock a signer. */
export async function loadReviewSourceEvents(pubkey: string): Promise<{
	statuses: NostrEvent[];
	reviews: NostrEvent[];
}> {
	const hex = normalizeNostrPubkey(pubkey);
	if (!hex) return { statuses: [], reviews: [] };
	const [tagged, authored, reviews] = await Promise.all([
		readStatus({ kinds: [KINDS.CONTRACT_STATUS], '#p': [hex], limit: 100 }),
		readStatus({ kinds: [KINDS.CONTRACT_STATUS], authors: [hex], limit: 100 }),
		readStatus({ kinds: [KINDS.REVIEW], authors: [hex], limit: 50 })
	]);
	const statuses = [...tagged, ...authored];
	const seen = new Set<string>();
	return {
		statuses: statuses.filter((event) => {
			if (seen.has(event.id)) return false;
			seen.add(event.id);
			return true;
		}),
		reviews
	};
}
