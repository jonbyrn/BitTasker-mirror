import type { Event, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { messageRelayUrls, queryRelaysDetailed } from '$lib/nostr/relaySession';

/** Shown wherever free chat is closed. Keep this sentence exact. */
export const MESSAGE_LOCKED_NOTE = 'Messaging unlocks once escrow is formed.';

export class MessagingLockedError extends Error {
	constructor(message = MESSAGE_LOCKED_NOTE) {
		super(message);
		this.name = 'MessagingLockedError';
	}
}

/**
 * Escrow counts as formed once it is connected (locked) or funded, and it stays
 * formed through the rest of that contract. A bid that is only accepted, or a
 * contract still waiting on an invoice, is not enough.
 */
export const FORMED_ESCROW_STATUSES = new Set([
	'connected',
	'locked',
	'funded',
	'work_in_progress',
	'work_submitted',
	'approved',
	'settlement_requested',
	'releasing',
	'released_pending',
	'released',
	'settled',
	'disputed',
	'refunded',
	'ESCROW_FUNDED',
	'WORK_IN_PROGRESS'
]);

const ALLOWED_TTL_MS = 60_000;
const DENIED_TTL_MS = 5_000;

const allowanceCache = new Map<string, { allowed: boolean; at: number; ttl: number }>();

export function toHexPubkey(value: string): string {
	const trimmed = value.trim();
	if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
	if (!trimmed.startsWith('npub1')) return '';
	try {
		const decoded = nip19.decode(trimmed);
		return decoded.type === 'npub' && typeof decoded.data === 'string'
			? decoded.data.toLowerCase()
			: '';
	} catch {
		return '';
	}
}

export function eventParties(event: { pubkey?: string; tags?: string[][] }): string[] {
	const parties = new Set<string>();
	const author = event.pubkey ? toHexPubkey(event.pubkey) : '';
	if (author) parties.add(author);
	for (const tag of event.tags ?? []) {
		if (tag[0] !== 'p' || !tag[1]) continue;
		const hex = toHexPubkey(tag[1]);
		if (hex) parties.add(hex);
	}
	return [...parties];
}

export function pairHasFormedEscrow(
	events: readonly { pubkey?: string; tags?: string[][] }[],
	leftPubkey: string,
	rightPubkey: string
): boolean {
	const left = toHexPubkey(leftPubkey);
	const right = toHexPubkey(rightPubkey);
	if (!left || !right || left === right) return false;
	return events.some((event) => {
		const status = event.tags?.find((tag) => tag[0] === 's')?.[1] ?? '';
		if (!FORMED_ESCROW_STATUSES.has(status)) return false;
		const parties = eventParties(event);
		return parties.includes(left) && parties.includes(right);
	});
}

function hasPhone(text: string): boolean {
	const candidates = text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
	return candidates.some((candidate) => {
		const digits = candidate.replace(/\D/g, '');
		if (digits.length < 8 || digits.length > 15) return false;
		return /[\s().+-]/.test(candidate) || digits.length >= 10;
	});
}

/** Phone, email, outside link, or another app's handle. BitTasker links stay. */
export function offPlatformContact(text: string): string | null {
	const value = text.trim();
	if (!value) return null;
	if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) return 'an email address';
	if (hasPhone(value)) return 'a phone number';
	if (/(?:https?:\/\/|www\.)(?![^\s]*bittasker\.com)/i.test(value)) return 'an outside link';
	if (
		/\b(?:telegram|whatsapp|signal|instagram|discord|snapchat)\b|\b(?:t\.me|wa\.me|discord\.gg)\b/i.test(
			value
		)
	) {
		return 'an outside handle';
	}
	return null;
}

export function assertNoOffPlatformContact(text: string): void {
	const found = offPlatformContact(text);
	if (!found) return;
	throw new MessagingLockedError(`Remove ${found} from this message. ${MESSAGE_LOCKED_NOTE}`);
}

function escrowRelayUrls(): string[] {
	return [
		...new Set([
			...resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL),
			...messageRelayUrls()
		])
	];
}

async function readEscrowEvents(selfHex: string, otherHex: string): Promise<Event[]> {
	const filters: Filter[] = [
		{ kinds: [KINDS.CONTRACT_STATUS, KINDS.BID_STATUS], '#p': [selfHex], limit: 200 },
		{ kinds: [KINDS.CONTRACT_STATUS, KINDS.BID_STATUS], '#p': [otherHex], limit: 200 }
	];
	const report = await queryRelaysDetailed(escrowRelayUrls(), filters);
	return report.events;
}

async function escrowIsFormed(selfHex: string, otherHex: string): Promise<boolean> {
	const key = [selfHex, otherHex].sort().join(':');
	const hit = allowanceCache.get(key);
	if (hit && Date.now() - hit.at < hit.ttl) return hit.allowed;
	let allowed = false;
	try {
		allowed = pairHasFormedEscrow(await readEscrowEvents(selfHex, otherHex), selfHex, otherHex);
	} catch {
		allowed = false;
	}
	allowanceCache.set(key, {
		allowed,
		at: Date.now(),
		ttl: allowed ? ALLOWED_TTL_MS : DENIED_TTL_MS
	});
	return allowed;
}

/** Free chat is allowed only for the two parties on a formed escrow. */
export async function assertChatAllowed(recipientPubkey: string): Promise<void> {
	const other = toHexPubkey(recipientPubkey);
	if (!other) throw new Error('That public key is not valid.');
	const { npub } = await getNostrKeyPair();
	const self = toHexPubkey(npub);
	if (!self) throw new Error('Your signing key is not available, so this message cannot be sent.');
	if (self === other) throw new MessagingLockedError();
	if (!(await escrowIsFormed(self, other))) throw new MessagingLockedError();
}

export async function canDirectMessage(
	recipientPubkey: string
): Promise<{ allowed: boolean; note: string }> {
	try {
		await assertChatAllowed(recipientPubkey);
		return { allowed: true, note: '' };
	} catch (error) {
		if (error instanceof MessagingLockedError) {
			return { allowed: false, note: error.message };
		}
		const note = error instanceof Error ? error.message : MESSAGE_LOCKED_NOTE;
		return { allowed: false, note };
	}
}

/** Test hook. Production reads the cache only through assertChatAllowed. */
export function clearMessagingAllowanceCache(): void {
	allowanceCache.clear();
}
