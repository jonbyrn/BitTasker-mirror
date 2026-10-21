/**
 * Stops a second completeTask while an earlier completion send may still
 * be pending or already mined.
 *
 * Retry must read the chain and the saved tx hash before broadcasting again.
 * A mined success, or a chain state that no longer accepts completeTask,
 * finishes the flow instead of sending another transaction.
 */

import { ContractStatus } from '$lib/utils/contract/types';

const STORAGE_PREFIX = 'bittasker.complete-task.';

const COMPLETABLE = new Set<number>([
	ContractStatus.Funded,
	ContractStatus.NoShow,
	ContractStatus.WorkInProgress
]);

/** completeTask already landed. Other non-completable states must not look like success. */
const ALREADY_COMPLETED = new Set<number>([ContractStatus.Completed, ContractStatus.FundsReleased]);

export class CompleteSendInFlightError extends Error {
	readonly code = 'in_flight' as const;
	constructor(public readonly paymentId: string) {
		super('A completion transaction is already being sent');
		this.name = 'CompleteSendInFlightError';
	}
}

export type CompleteAttempt = {
	paymentId: string;
	txHash: string | null;
};

export type CompleteGuardSnapshot = {
	localSendInFlight: boolean;
	storedTxHash: string | null;
	/** 1 mined success, 0 reverted, null if there is no receipt yet. */
	receiptStatus: 0 | 1 | null;
	chainState: number | null;
	/** False when the chain read failed. A saved hash then stays blocked. */
	chainCheckComplete: boolean;
};

export type CompleteRetryDecision =
	| { action: 'allow' }
	| { action: 'block'; reason: 'in_flight' | 'pending' | 'not_completable' }
	| { action: 'finish'; reason: 'already_complete' };

const attempts = new Map<string, CompleteAttempt>();
const inFlightPayments = new Set<string>();
const knownIds = new Set<string>();

/** Chain states where completeTask is still a legal write. */
export function chainAllowsComplete(state: number | null | undefined): boolean {
	return state != null && COMPLETABLE.has(state);
}

/**
 * Decide a Retry (or a second click) from on-chain state and the saved hash.
 * Call this before `completeTask`. `finish` means the chain already moved on:
 * refresh and do not broadcast.
 */
export function decideCompleteRetry(snapshot: CompleteGuardSnapshot): CompleteRetryDecision {
	if (snapshot.localSendInFlight) return { action: 'block', reason: 'in_flight' };
	if (snapshot.receiptStatus === 1) return { action: 'finish', reason: 'already_complete' };
	// Only a numeric chain state can prove the escrow already left completeTask.
	// A missing or non-numeric read must not look like success and skip the send.
	if (
		snapshot.chainCheckComplete &&
		typeof snapshot.chainState === 'number' &&
		ALREADY_COMPLETED.has(snapshot.chainState)
	) {
		return { action: 'finish', reason: 'already_complete' };
	}
	if (
		snapshot.chainCheckComplete &&
		typeof snapshot.chainState === 'number' &&
		!chainAllowsComplete(snapshot.chainState)
	) {
		return { action: 'block', reason: 'not_completable' };
	}
	if (snapshot.receiptStatus === 0) return { action: 'allow' };
	if (snapshot.storedTxHash && snapshot.receiptStatus == null) {
		return { action: 'block', reason: 'pending' };
	}
	if (snapshot.storedTxHash && !snapshot.chainCheckComplete) {
		return { action: 'block', reason: 'pending' };
	}
	return { action: 'allow' };
}

export function rememberCompleteAttempt(paymentId: string, attempt: CompleteAttempt): void {
	attempts.set(paymentId, attempt);
	knownIds.add(paymentId);
	try {
		sessionStorage.setItem(STORAGE_PREFIX + paymentId, JSON.stringify(attempt));
	} catch {
		// Private mode can reject storage. The in-memory copy still guards this page.
	}
}

export function readCompleteAttempt(paymentId: string): CompleteAttempt | null {
	const cached = attempts.get(paymentId);
	if (cached) return cached;
	try {
		const raw = sessionStorage.getItem(STORAGE_PREFIX + paymentId);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CompleteAttempt;
		if (!parsed || parsed.paymentId !== paymentId) return null;
		if (parsed.txHash != null && typeof parsed.txHash !== 'string') return null;
		attempts.set(paymentId, parsed);
		knownIds.add(paymentId);
		return parsed;
	} catch {
		return null;
	}
}

export function noteCompleteTxHash(paymentId: string, txHash: string): void {
	const existing = readCompleteAttempt(paymentId);
	rememberCompleteAttempt(paymentId, {
		paymentId,
		txHash: txHash || existing?.txHash || null
	});
}

export function isCompleteSendInFlight(paymentId: string): boolean {
	return inFlightPayments.has(paymentId);
}

/** Synchronous lock around the broadcast. False means another send holds it. */
export function tryBeginCompleteSend(paymentId: string): boolean {
	if (inFlightPayments.has(paymentId)) return false;
	inFlightPayments.add(paymentId);
	return true;
}

export function endCompleteSend(paymentId: string): void {
	inFlightPayments.delete(paymentId);
}

export type ChainRead = { ok: boolean; state: number | null };
export type ReceiptRead = { status: number | null } | null;

export async function loadCompleteGuardSnapshot(args: {
	paymentId: string;
	readChainState: () => Promise<ChainRead>;
	readReceipt: (hash: string) => Promise<ReceiptRead>;
}): Promise<CompleteGuardSnapshot> {
	const attempt = readCompleteAttempt(args.paymentId);
	let chainState: number | null = null;
	let chainCheckComplete = false;
	try {
		const chain = await args.readChainState();
		chainCheckComplete = chain.ok;
		chainState = chain.state;
	} catch {
		chainCheckComplete = false;
		chainState = null;
	}

	let receiptStatus: 0 | 1 | null = null;
	if (attempt?.txHash) {
		try {
			const receipt = await args.readReceipt(attempt.txHash);
			if (receipt?.status === 1) receiptStatus = 1;
			else if (receipt?.status === 0) receiptStatus = 0;
		} catch {
			receiptStatus = null;
			chainCheckComplete = false;
		}
	}

	return {
		localSendInFlight: isCompleteSendInFlight(args.paymentId),
		storedTxHash: attempt?.txHash ?? null,
		receiptStatus,
		chainState,
		chainCheckComplete
	};
}

export function resetCompleteTaskGuard(): void {
	for (const id of knownIds) {
		try {
			sessionStorage.removeItem(STORAGE_PREFIX + id);
		} catch {
			// ignore
		}
	}
	knownIds.clear();
	attempts.clear();
	inFlightPayments.clear();
}
