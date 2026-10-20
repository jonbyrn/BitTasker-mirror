import { NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import type { Event as NostrEvent } from 'nostr-tools';
import { ndk } from '$lib/nostr/ndk';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import KINDS from '$lib/utils/constants/kinds';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';

/**
 * Public contract tags only. A formed escrow relaxes the DM contact filter.
 * It never closes the thread. Message ciphertext is not read.
 *
 * Prod publishes kind 30006 with status `confirmed` after the funding tx
 * confirms. Later kind 31006 updates use ContractStatus 0-13. `pending` and
 * `failed` (14) are not formed.
 */
export const FORMED_ESCROW_STATUSES = new Set([
	'confirmed',
	'active',
	'funded',
	'locked',
	'connected',
	'0',
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'11',
	'12',
	'13'
]);

const UNFORMED_ESCROW_STATUSES = new Set(['', 'pending', 'failed', '14']);

const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 10_000;

const cache = new Map<string, { formed: boolean; at: number }>();

export function clearEscrowFormedCache(): void {
	cache.clear();
}

export function contractEventShowsFormedEscrow(
	event: { pubkey?: string; tags?: string[][] },
	leftPubkey: string,
	rightPubkey: string
): boolean {
	const left = leftPubkey.toLowerCase();
	const right = rightPubkey.toLowerCase();
	if (!left || !right || left === right) return false;

	const parties = new Set<string>();
	if (event.pubkey) parties.add(event.pubkey.toLowerCase());
	for (const tag of event.tags ?? []) {
		if (tag[0] === 'p' && tag[1]) parties.add(tag[1].toLowerCase());
	}
	if (!parties.has(left) || !parties.has(right)) return false;

	const status =
		(event.tags ?? [])
			.find((tag) => tag[0] === 's')?.[1]
			?.trim()
			.toLowerCase() ?? '';
	if (UNFORMED_ESCROW_STATUSES.has(status)) return false;
	if (FORMED_ESCROW_STATUSES.has(status)) return true;
	if (/^\d+$/.test(status)) {
		const value = Number(status);
		return value >= 0 && value <= 13;
	}
	return false;
}

function contractRelays(): string[] {
	const taskRelays = resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);
	return [...new Set([...taskRelays, ...profileRelays()])];
}

async function readContractEvents(filters: NDKFilter[]): Promise<NostrEvent[]> {
	const relays = contractRelays();
	if (relays.length === 0) return [];
	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const events: NostrEvent[] = [];
	for (const filter of filters) {
		const found = await ndk.fetchEvents(filter, { closeOnEose: true, relaySet });
		for (const event of found) {
			const raw = event as { toNostrEvent?: () => Promise<NostrEvent> } & NostrEvent;
			events.push(raw.toNostrEvent ? await raw.toNostrEvent() : raw);
		}
	}
	return events;
}

/** True when a public contract event already ties these two people to escrow. */
export async function pairEscrowIsFormed(
	selfPubkey: string,
	otherPubkey: string
): Promise<boolean> {
	const self = normalizeProfileLookupKey(selfPubkey).hexPubkey.toLowerCase();
	const other = normalizeProfileLookupKey(otherPubkey).hexPubkey.toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(self) || !/^[0-9a-f]{64}$/.test(other) || self === other) {
		return false;
	}

	const key = [self, other].sort().join(':');
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < (hit.formed ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS)) {
		return hit.formed;
	}

	let formed = false;
	try {
		const events = await readContractEvents([
			{ kinds: [KINDS.CONTRACT], authors: [self], '#p': [other], limit: 20 },
			{ kinds: [KINDS.CONTRACT], authors: [other], '#p': [self], limit: 20 },
			{ kinds: [KINDS.CONTRACT_STATUS], authors: [self], '#p': [other], limit: 20 },
			{ kinds: [KINDS.CONTRACT_STATUS], authors: [other], '#p': [self], limit: 20 }
		]);
		formed = events.some((event) => contractEventShowsFormedEscrow(event, self, other));
	} catch (error) {
		console.warn('Escrow lookup failed; keeping the stricter DM filter', error);
		formed = false;
	}

	cache.set(key, { formed, at: Date.now() });
	return formed;
}
