/**
 * Exhaustive Boltz + wallet-core swap status mapping.
 * Single source of truth for status classification and pending-modal display.
 */

export type SwapType = 'submarine' | 'reverse' | 'chain';
export type ModalTxStatus = 'sending' | 'confirming' | 'success' | 'error';

export const PENDING_STATUSES: readonly string[] = [
	'swap.created',
	'invoice.set',
	'transaction.mempool',
	'transaction.confirmed',
	'invoice.pending',
	'transaction.claim.pending',
	'minerfee.paid',
	'transaction.server.mempool',
	'transaction.server.confirmed'
] as const;

export const COMPLETED_STATUSES: readonly string[] = [
	'transaction.claimed',
	'invoice.settled',
	'invoice.paid'
] as const;

export const FAILED_STATUSES: readonly string[] = [
	'swap.expired',
	'invoice.failedToPay',
	'invoice.expired',
	'transaction.failed',
	'transaction.refunded',
	'transaction.lockupFailed',
	'transaction.claim.failed'
] as const;

export const FINAL_STATUSES: readonly string[] = [
	...COMPLETED_STATUSES,
	'swap.expired',
	'invoice.failedToPay',
	'invoice.expired',
	'transaction.failed',
	'transaction.refunded',
	'transaction.claim.failed'
] as const;

/** Nostr recovery — swaps in these states are not pending. */
export const NOSTR_FINAL_STATES: readonly string[] = [
	'invoice.settled',
	'invoice.paid',
	'swap.expired',
	'transaction.failed',
	'transaction.claimed',
	'transaction.claim.failed',
	'claimed'
] as const;

export function isSwapCompleted(status: string): boolean {
	return (COMPLETED_STATUSES as readonly string[]).includes(status);
}

export function isSwapFailed(status: string): boolean {
	return (FAILED_STATUSES as readonly string[]).includes(status);
}

export function isSwapFinal(status: string): boolean {
	return (FINAL_STATUSES as readonly string[]).includes(status);
}

export function isSwapPending(status: string): boolean {
	return (PENDING_STATUSES as readonly string[]).includes(status);
}

/** Map raw Boltz status to pending-modal TransactionStatus (no side effects). */
export function mapBoltzModalStatus(
	rawStatus: string | null | undefined,
	swapType: SwapType | undefined
): ModalTxStatus {
	if (!rawStatus || !swapType) return 'confirming';

	if (isSwapCompleted(rawStatus)) return 'success';
	if (isSwapFailed(rawStatus)) return 'error';

	if (swapType === 'submarine') {
		if (rawStatus === 'swap.created' || rawStatus === 'invoice.set') return 'sending';
		return 'confirming';
	}

	if (swapType === 'reverse') {
		if (rawStatus === 'swap.created') return 'sending';
		return 'confirming';
	}

	// chain
	if (rawStatus === 'swap.created') return 'sending';
	if (rawStatus === 'transaction.lockupFailed') return 'confirming';
	return 'confirming';
}

/** Status-derived ETA seed in seconds for cosmetic countdown. */
export function getSwapEtaSeconds(
	rawStatus: string | null | undefined,
	swapType: SwapType | undefined
): number {
	if (!rawStatus || !swapType) return 60;

	if (swapType === 'submarine') {
		if (rawStatus === 'swap.created' || rawStatus === 'invoice.set') return 30;
		if (rawStatus === 'transaction.mempool') return 30;
		if (rawStatus === 'transaction.confirmed' || rawStatus === 'invoice.pending') return 60;
		return 60;
	}

	if (swapType === 'reverse') {
		if (rawStatus === 'swap.created') return 60;
		if (rawStatus === 'transaction.mempool' || rawStatus === 'minerfee.paid') return 45;
		if (rawStatus === 'transaction.confirmed' || rawStatus === 'transaction.claim.pending')
			return 30;
		return 45;
	}

	// chain
	if (
		rawStatus === 'transaction.server.mempool' ||
		rawStatus === 'transaction.server.confirmed' ||
		rawStatus === 'transaction.claim.pending'
	) {
		return 90;
	}
	if (rawStatus === 'transaction.mempool' || rawStatus === 'transaction.confirmed') return 45;
	return 60;
}
