import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ContractStatus } from '$lib/utils/contract/types';

export type TimelineParticipant = 'tasker' | 'taskee' | 'unknown';

/** Ordered items for the NDK contract timeline (deduped status events + optional initiation). */
export type ContractTimelineEntry =
	| { kind: 'initiation'; contract: NDKPaymentContract }
	| { kind: 'status'; event: NDKContractStatus };

/** Display time for a Kind 31006 row (legacy JSON ms preferred). */
export function statusEventTimestampMs(ev: NDKContractStatus): number {
	const leg = ev.legacyContent as { timestamp?: number } | undefined;
	if (leg && typeof leg.timestamp === 'number') return leg.timestamp;
	return (ev.created_at ?? 0) * 1000;
}

export function timelineParticipantForPubkey(
	pubkey: string,
	tasker: string | undefined,
	taskee: string | undefined
): TimelineParticipant {
	const p = pubkey.toLowerCase();
	const t = tasker?.toLowerCase();
	const k = taskee?.toLowerCase();
	if (t && p === t) return 'tasker';
	if (k && p === k) return 'taskee';
	return 'unknown';
}

/**
 * Dedupe key: `(status, txHash)` when tx is present; else `(status, event id)`.
 * First event per key wins (chronological order).
 */
function dedupeKey(ev: NDKContractStatus, status: ContractStatus): string {
	const tx = ev.transactionHash?.trim() ?? '';
	if (tx) return `${status}:${tx}`;
	return `${status}:${ev.id ?? ''}`;
}

export type BuildContractTimelineRowsOptions = {
	contract: NDKPaymentContract;
	statusEvents: NDKContractStatus[];
	includeInitiation?: boolean;
};

/**
 * Builds ordered, deduplicated timeline entries for the NDK contract drawer.
 */
export function buildContractTimelineRows(
	options: BuildContractTimelineRowsOptions
): ContractTimelineEntry[] {
	const { contract, statusEvents, includeInitiation = true } = options;

	const sorted = [...statusEvents].sort(
		(a, b) => statusEventTimestampMs(a) - statusEventTimestampMs(b)
	);

	const seen = new Set<string>();
	const statusEntries: Extract<ContractTimelineEntry, { kind: 'status' }>[] = [];

	for (const ev of sorted) {
		const cs = ev.status;
		if (cs === undefined) continue;
		const key = dedupeKey(ev, cs);
		if (seen.has(key)) continue;
		seen.add(key);
		statusEntries.push({ kind: 'status', event: ev });
	}

	const rows: ContractTimelineEntry[] = [];

	if (includeInitiation && contract.created_at != null && contract.pubkey) {
		rows.push({ kind: 'initiation', contract });
	}

	rows.push(...statusEntries);
	rows.sort((a, b) => {
		const ta =
			a.kind === 'initiation' ? a.contract.created_at! * 1000 : statusEventTimestampMs(a.event);
		const tb =
			b.kind === 'initiation' ? b.contract.created_at! * 1000 : statusEventTimestampMs(b.event);
		return ta - tb;
	});
	return rows;
}
