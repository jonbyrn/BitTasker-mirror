/** A proxy answer for one recipient. `unknown` is not proof that no consignment exists. */
export type ProbeResult = 'found' | 'absent' | 'unknown';

export type ReleaseKeepReason = 'consignment' | 'not-expired' | 'unknown' | 'none';

export interface ReleaseCandidate {
	batch: number | null;
	recipientId: string | null;
	status: string;
	expiration: number | null;
}

export interface ReleaseOutcome {
	released: number[];
	reason: ReleaseKeepReason | 'released';
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function invoiceBeneficiary(invoice: string): string | null {
	const [path] = invoice.trim().split('?');
	const body = path.startsWith('rgb:') ? path.slice('rgb:'.length) : path;
	const parts = body.split('/');
	if (parts.length < 4) return null;
	const beneficiary = parts.slice(3).join('/');
	return beneficiary.length > 0 ? beneficiary : null;
}

function invoiceExpiry(invoice: string): number | null {
	const match = invoice.match(/[?&]expiry=(\d+)/);
	if (!match) return null;
	const expiry = Number(match[1]);
	return Number.isFinite(expiry) && expiry > 0 ? expiry : null;
}

/**
 * Waiting receives that can lock a coin. A txid on the row is not a payment:
 * a blank invoice stores the blinding UTXO there before anyone pays.
 */
export function blockingReceiveCandidates(rows: unknown): ReleaseCandidate[] {
	if (!Array.isArray(rows)) return [];
	const candidates: ReleaseCandidate[] = [];
	for (const value of rows) {
		const row = record(value);
		if (!row || row.kind !== 'ReceiveBlind') continue;
		const status = typeof row.status === 'string' ? row.status : '';
		const batch = row.batchTransferIdx ?? row.batch_transfer_idx;
		const invoice = typeof row.invoiceString === 'string' ? row.invoiceString : '';
		const direct = row.recipientId ?? row.recipient_id;
		const recipientId =
			typeof direct === 'string' && direct.length > 0 ? direct : invoiceBeneficiary(invoice);
		const listed = row.expiration;
		const expiration =
			typeof listed === 'number' && Number.isFinite(listed)
				? listed
				: invoiceExpiry(invoice);
		candidates.push({
			batch: typeof batch === 'number' ? batch : null,
			recipientId,
			status,
			expiration
		});
	}
	return candidates;
}

function expired(expiration: number | null, nowSec: number): boolean {
	return (
		typeof expiration === 'number' &&
		Number.isFinite(expiration) &&
		expiration > 0 &&
		expiration <= nowSec
	);
}

const SETTLED_OR_CONFIRMING = new Set([
	'WaitingConfirmations',
	'WaitingSafeHeight',
	'Settled',
	'Failed'
]);

/**
 * A blank receive may be failed when it is WaitingCounterparty or its invoice
 * has expired, and the proxy has no consignment. A transfer already waiting on
 * blocks is a payment and stays.
 */
export function canReleaseReceive(row: ReleaseCandidate, nowSec: number): boolean {
	if (typeof row.batch !== 'number') return false;
	if (SETTLED_OR_CONFIRMING.has(row.status)) return false;
	return row.status === 'WaitingCounterparty' || expired(row.expiration, nowSec);
}

/**
 * Fail a WaitingCounterparty or expired receive whose probe is `absent`.
 * A consignment or an unknown probe stays, even when the invoice is old.
 */
export function chooseReleases(
	rows: readonly ReleaseCandidate[],
	probes: ReadonlyMap<string, ProbeResult>,
	nowSec: number
): ReleaseOutcome {
	const actionable = rows.filter((row) => typeof row.batch === 'number');
	if (actionable.length === 0) return { released: [], reason: 'none' };
	const released: number[] = [];
	let sawConsignment = false;
	let sawOpen = false;
	let sawUnknown = false;
	for (const row of actionable) {
		if (!canReleaseReceive(row, nowSec)) {
			if (!SETTLED_OR_CONFIRMING.has(row.status)) sawOpen = true;
			continue;
		}
		const id = row.recipientId?.trim() ?? '';
		const probe = id ? (probes.get(id) ?? 'unknown') : 'unknown';
		if (probe === 'found') {
			sawConsignment = true;
			continue;
		}
		if (probe !== 'absent') {
			sawUnknown = true;
			continue;
		}
		released.push(row.batch as number);
	}
	const unique = [...new Set(released)];
	if (unique.length > 0) return { released: unique, reason: 'released' };
	if (sawConsignment) return { released: [], reason: 'consignment' };
	if (sawOpen) return { released: [], reason: 'not-expired' };
	if (sawUnknown) return { released: [], reason: 'unknown' };
	return { released: [], reason: 'none' };
}

/** Map one `consignment.get` payload. Errors that are not "missing" stay unknown. */
export function consignmentProbeResult(payload: unknown): ProbeResult {
	const body = record(payload);
	if (!body) return 'unknown';
	const error = record(body.error);
	if (error) {
		const code = error.code;
		const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
		if (code === -400 || message.includes('not found') || message.includes('missing')) {
			return 'absent';
		}
		return 'unknown';
	}
	const result = record(body.result);
	if (!result) return 'unknown';
	if (typeof result.consignment === 'string' && result.consignment.length > 0) return 'found';
	return 'absent';
}

/** Lowest confirmation count on a receive that is actually waiting for blocks. */
export function transferConfirmationCount(rows: unknown): number | null {
	if (!Array.isArray(rows)) return null;
	let best: number | null = null;
	for (const value of rows) {
		const row = record(value);
		if (!row) continue;
		if (row.status !== 'WaitingConfirmations' && row.status !== 'WaitingSafeHeight') continue;
		const raw = row.confirmations ?? row.confirmationCount ?? row.numConfirmations;
		if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) continue;
		best = best === null ? raw : Math.min(best, raw);
	}
	return best;
}

/** Confirmations of a real payment. The blinding seal's height is not a payment. */
export function confirmationsBetween(tipHeight: number, txHeight: number): number | null {
	if (!Number.isInteger(tipHeight) || !Number.isInteger(txHeight)) return null;
	if (txHeight < 0 || tipHeight < txHeight) return null;
	return tipHeight - txHeight + 1;
}

export function releaseWarningKey(reason: ReleaseKeepReason): string {
	switch (reason) {
		case 'consignment':
			return 'wallet.release_kept_consignment';
		case 'not-expired':
			return 'wallet.release_kept_open';
		case 'unknown':
			return 'wallet.release_kept_unknown';
		default:
			return 'wallet.release_kept_none';
	}
}
