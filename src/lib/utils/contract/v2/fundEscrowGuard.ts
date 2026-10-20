/**
 * Stops a second createPaymentContract while an earlier funding send
 * may still be pending or already mined.
 *
 * The first attempt can sit on the RSK RPC until the client gives up.
 * That send is not aborted: aborting a Capacitor-proxied request reloads
 * the WebView. The retry must look at the saved nonce, the tx hash, and
 * the payment contract before broadcasting again.
 */

import { ethers } from 'ethers';

export const FUND_ESCROW_RPC_TIMEOUT_MS = 60_000;
const STORAGE_PREFIX = 'bittasker.fund-escrow.';

export class FundEscrowTimeoutError extends Error {
	readonly code = 'timeout' as const;
	constructor(timeoutMs: number) {
		const seconds = Math.max(1, Math.round(timeoutMs / 1000));
		super(`Funding request timed out after ${seconds} seconds`);
		this.name = 'FundEscrowTimeoutError';
	}
}

export type FundAttempt = {
	sender: string;
	nonce: number;
	txHash: string | null;
	contractAddress: string;
	fromBlock: number;
	taskee: string;
};

export type FundGuardSnapshot = {
	localSendInFlight: boolean;
	storedNonce: number | null;
	storedTxHash: string | null;
	latestNonce: number;
	pendingNonce: number;
	/** 1 mined success, 0 reverted, null if there is no receipt. */
	receiptStatus: 0 | 1 | null;
	txFound: boolean;
	onChainEscrow: boolean;
	/** False when the log scan failed. A consumed nonce then stays blocked. */
	chainCheckComplete: boolean;
};

export type FundGuardDecision =
	| { action: 'allow' }
	| { action: 'block'; reason: 'in_flight' | 'pending' | 'already_funded' };

export type FundGuardReader = {
	getTransactionCount(address: string, blockTag: 'latest' | 'pending'): Promise<number>;
	getTransaction(hash: string): Promise<{ from: string; nonce: number } | null>;
	getTransactionReceipt(hash: string): Promise<{ status: number | null } | null>;
	getBlockNumber(): Promise<number>;
	getLogs(filter: {
		address: string;
		topics: string[];
		fromBlock: number;
		toBlock: number;
	}): Promise<{ transactionHash: string }[]>;
};

const attempts = new Map<string, FundAttempt>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(inFlight: boolean) => void>>();

export function logFundEscrow(
	step: 'sign' | 'send tx' | 'receipt' | 'guard' | 'timeout' | 'failed',
	detail: Record<string, unknown>
): void {
	console.log(`[fund-escrow] ${step}`, detail);
}

export function decideFundRetry(snapshot: FundGuardSnapshot): FundGuardDecision {
	if (snapshot.localSendInFlight) return { action: 'block', reason: 'in_flight' };
	if (snapshot.receiptStatus === 1 || snapshot.onChainEscrow) {
		return { action: 'block', reason: 'already_funded' };
	}
	if (snapshot.receiptStatus === 0) return { action: 'allow' };
	if (snapshot.storedTxHash && snapshot.txFound && snapshot.receiptStatus == null) {
		return { action: 'block', reason: 'pending' };
	}
	if (
		snapshot.storedNonce != null &&
		snapshot.pendingNonce > snapshot.latestNonce &&
		snapshot.latestNonce <= snapshot.storedNonce &&
		snapshot.pendingNonce > snapshot.storedNonce
	) {
		return { action: 'block', reason: 'pending' };
	}
	if (
		snapshot.storedNonce != null &&
		snapshot.latestNonce > snapshot.storedNonce &&
		!snapshot.chainCheckComplete
	) {
		return { action: 'block', reason: 'pending' };
	}
	return { action: 'allow' };
}

export function fundEscrowErrorKey(code: string | undefined): string {
	switch (code) {
		case 'timeout':
			return 'dashboard.bids.bid_acceptance.error_timeout';
		case 'in_flight':
			return 'dashboard.bids.bid_acceptance.error_in_flight';
		case 'pending':
			return 'dashboard.bids.bid_acceptance.error_pending';
		case 'already_funded':
			return 'dashboard.bids.bid_acceptance.error_already_funded';
		default:
			return 'dashboard.bids.bid_acceptance.error_generic';
	}
}

type ErrorToast = (
	message: string,
	timeout?: number,
	options?: { actions?: { label: string; onClick: () => void }[] }
) => void;

/** Sticky funding error with Retry. Does not navigate or reload. */
export function presentFundEscrowFailure(args: {
	showErrorToast: ErrorToast;
	message: string;
	retry: () => void;
}): void {
	args.showErrorToast(args.message, 0, {
		actions: [
			{
				label: 'dashboard.bids.bid_acceptance.retry',
				onClick: args.retry
			}
		]
	});
}

export function rememberFundAttempt(taskId: string, attempt: FundAttempt): void {
	attempts.set(taskId, attempt);
	try {
		sessionStorage.setItem(STORAGE_PREFIX + taskId, JSON.stringify(attempt));
	} catch {
		// Private mode can reject storage. The in-memory copy still guards this page.
	}
}

export function readFundAttempt(taskId: string): FundAttempt | null {
	const cached = attempts.get(taskId);
	if (cached) return cached;
	try {
		const raw = sessionStorage.getItem(STORAGE_PREFIX + taskId);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as FundAttempt;
		if (!parsed || typeof parsed.nonce !== 'number' || typeof parsed.sender !== 'string')
			return null;
		attempts.set(taskId, parsed);
		return parsed;
	} catch {
		return null;
	}
}

export function noteFundTxHash(taskId: string, txHash: string): void {
	const existing = readFundAttempt(taskId);
	if (!existing) return;
	rememberFundAttempt(taskId, { ...existing, txHash });
}

export function isFundSendInFlight(taskId: string): boolean {
	return inFlight.has(taskId);
}

export function trackFundSend(taskId: string, promise: Promise<unknown>): void {
	inFlight.set(taskId, promise);
	emitFundSend(taskId);
	promise.then(
		() => {
			if (inFlight.get(taskId) === promise) inFlight.delete(taskId);
			emitFundSend(taskId);
		},
		() => {
			if (inFlight.get(taskId) === promise) inFlight.delete(taskId);
			emitFundSend(taskId);
		}
	);
}

export function subscribeFundSend(
	taskId: string,
	listener: (sending: boolean) => void
): () => void {
	let bucket = listeners.get(taskId);
	if (!bucket) {
		bucket = new Set();
		listeners.set(taskId, bucket);
	}
	bucket.add(listener);
	return () => {
		bucket?.delete(listener);
	};
}

function emitFundSend(taskId: string): void {
	const sending = inFlight.has(taskId);
	for (const listener of listeners.get(taskId) ?? []) listener(sending);
}

export async function loadFundGuardSnapshot(args: {
	reader: FundGuardReader;
	attempt: FundAttempt | null;
	localSendInFlight: boolean;
}): Promise<FundGuardSnapshot> {
	const { reader, attempt, localSendInFlight } = args;
	if (!attempt) {
		return {
			localSendInFlight,
			storedNonce: null,
			storedTxHash: null,
			latestNonce: 0,
			pendingNonce: 0,
			receiptStatus: null,
			txFound: false,
			onChainEscrow: false,
			chainCheckComplete: true
		};
	}

	const [latestNonce, pendingNonce] = await Promise.all([
		reader.getTransactionCount(attempt.sender, 'latest'),
		reader.getTransactionCount(attempt.sender, 'pending')
	]);

	let receiptStatus: 0 | 1 | null = null;
	let txFound = false;
	if (attempt.txHash) {
		const [tx, receipt] = await Promise.all([
			reader.getTransaction(attempt.txHash),
			reader.getTransactionReceipt(attempt.txHash)
		]);
		txFound = tx != null;
		if (receipt && (receipt.status === 0 || receipt.status === 1)) {
			receiptStatus = receipt.status;
		}
	}

	let onChainEscrow = receiptStatus === 1;
	let chainCheckComplete = true;
	if (!onChainEscrow && latestNonce > attempt.nonce) {
		try {
			onChainEscrow = await escrowMinedAtNonce(reader, attempt);
		} catch {
			chainCheckComplete = false;
		}
	}

	return {
		localSendInFlight,
		storedNonce: attempt.nonce,
		storedTxHash: attempt.txHash,
		latestNonce,
		pendingNonce,
		receiptStatus,
		txFound,
		onChainEscrow,
		chainCheckComplete
	};
}

async function escrowMinedAtNonce(reader: FundGuardReader, attempt: FundAttempt): Promise<boolean> {
	const head = await reader.getBlockNumber();
	const fromBlock = Math.max(0, Math.min(attempt.fromBlock, head));
	const topic = ethers.id('PaymentContractCreated(uint32)');
	const logs = await reader.getLogs({
		address: attempt.contractAddress,
		topics: [topic],
		fromBlock,
		toBlock: head
	});
	for (const log of logs) {
		const tx = await reader.getTransaction(log.transactionHash);
		if (!tx) continue;
		if (tx.from.toLowerCase() !== attempt.sender.toLowerCase()) continue;
		if (tx.nonce !== attempt.nonce) continue;
		return true;
	}
	return false;
}

/** Test helper. Clears memory and this page's session copies. */
export function resetFundEscrowGuardForTests(): void {
	attempts.clear();
	inFlight.clear();
	listeners.clear();
	try {
		const keys: string[] = [];
		for (let i = 0; i < sessionStorage.length; i += 1) {
			const key = sessionStorage.key(i);
			if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
		}
		for (const key of keys) sessionStorage.removeItem(key);
	} catch {
		// sessionStorage can be missing in a non-browser test.
	}
}
