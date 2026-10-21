import type { ContractStatus } from '$lib/utils/contract/types';

/** Fields the contract timeline reads from a Kind 31006 row. */
export type TimelineStatusLike = {
	status?: ContractStatus;
	transactionHash?: string;
	id?: string;
	created_at?: number;
	pubkey?: string;
	legacyContent?: { timestamp?: number };
};

export function timelineStatusDedupeKey(ev: TimelineStatusLike): string | null {
	if (ev.status === undefined) return null;
	const tx = ev.transactionHash?.trim() ?? '';
	if (tx) return `${ev.status}:${tx}`;
	return `${ev.status}:${ev.id ?? ''}`;
}

/**
 * Append one status row unless the same status and tx hash (or event id) is already present.
 * Returns a new array when the row is new so callers can reassign reactive state.
 */
export function mergeTimelineStatus<T extends TimelineStatusLike>(
	events: readonly T[],
	incoming: T
): { events: T[]; added: boolean } {
	const key = timelineStatusDedupeKey(incoming);
	if (!key) return { events: [...events], added: false };
	if (events.some((ev) => timelineStatusDedupeKey(ev) === key)) {
		return { events: [...events], added: false };
	}
	return { events: [...events, incoming], added: true };
}

export type ContractEventLike = { id?: string };

/**
 * Remote relay rows win on id. Locally published contracts that the relay
 * has not echoed yet stay in the list so the drawer can open without a reload.
 */
export function mergeContractEvents<T extends ContractEventLike>(
	remote: readonly T[],
	local: readonly T[]
): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const event of [...remote, ...local]) {
		const id = event.id ?? '';
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(event);
	}
	return out;
}
