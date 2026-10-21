/**
 * After a completion tx hash exists, poll for the receipt with backoff.
 * The user-facing timeout is about 3 minutes. Polling continues after that
 * so a receipt that lands later can still clear the error.
 *
 * Receipt reads are not aborted. Aborting a Capacitor-proxied RPC reloads
 * the Android WebView.
 */

import { deadlineWithoutAbort } from './completeTaskRelay';

export const COMPLETE_RECEIPT_USER_DEADLINE_MS = 180_000;
export const COMPLETE_RECEIPT_GIVE_UP_MS = 10 * 60_000;
export const COMPLETE_RECEIPT_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 20_000];
export const COMPLETE_RECEIPT_RPC_TIMEOUT_MS = 12_000;

export type ChainReceipt = {
	status: number | null;
	blockNumber?: number | null;
};

export type UserReceiptOutcome =
	| { type: 'confirmed'; receipt: ChainReceipt }
	| { type: 'reverted'; receipt: ChainReceipt }
	| { type: 'timeout' };

export type LateReceiptEvent =
	| { type: 'confirmed'; receipt: ChainReceipt }
	| { type: 'reverted'; receipt: ChainReceipt };

export type CompleteReceiptWatchArgs = {
	getReceipt: () => Promise<ChainReceipt | null>;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	userDeadlineMs?: number;
	giveUpMs?: number;
	backoffMs?: number[];
	shouldStop?: () => boolean;
	onLate?: (event: LateReceiptEvent) => void;
};

function delayFor(backoffMs: number[], attempt: number): number {
	if (backoffMs.length === 0) return 2_000;
	return backoffMs[Math.min(attempt, backoffMs.length - 1)];
}

function classify(receipt: ChainReceipt): 'confirmed' | 'reverted' | 'pending' {
	if (receipt.status === 1) return 'confirmed';
	if (receipt.status === 0) return 'reverted';
	return 'pending';
}

/**
 * Poll `getReceipt` until it is mined, the user-facing deadline passes, or the give-up time passes.
 * The returned `userFacing` promise settles at the deadline. `done` settles when polling stops.
 * A receipt after the deadline is delivered through `onLate` and does not reject `userFacing`.
 */
export function startCompleteReceiptWatch(args: CompleteReceiptWatchArgs): {
	userFacing: Promise<UserReceiptOutcome>;
	done: Promise<void>;
} {
	const sleep =
		args.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const now = args.now ?? Date.now;
	const userDeadlineMs = args.userDeadlineMs ?? COMPLETE_RECEIPT_USER_DEADLINE_MS;
	const giveUpMs = args.giveUpMs ?? COMPLETE_RECEIPT_GIVE_UP_MS;
	const backoffMs = args.backoffMs ?? COMPLETE_RECEIPT_BACKOFF_MS;
	const started = now();

	let resolveUser: (outcome: UserReceiptOutcome) => void = () => {};
	const userFacing = new Promise<UserReceiptOutcome>((resolve) => {
		resolveUser = resolve;
	});
	let userSettled = false;

	const settleUser = (outcome: UserReceiptOutcome) => {
		if (userSettled) return;
		userSettled = true;
		resolveUser(outcome);
	};

	const done = (async () => {
		let attempt = 0;
		while (!args.shouldStop?.()) {
			let receipt: ChainReceipt | null = null;
			try {
				receipt = await args.getReceipt();
			} catch {
				receipt = null;
			}

			if (receipt) {
				const kind = classify(receipt);
				if (kind === 'confirmed' || kind === 'reverted') {
					if (userSettled) {
						try {
							args.onLate?.({ type: kind, receipt });
						} catch {
							// The caller logs. Polling is finished either way.
						}
					} else {
						settleUser({ type: kind, receipt });
					}
					return;
				}
			}

			const elapsed = now() - started;
			if (elapsed >= giveUpMs) {
				settleUser({ type: 'timeout' });
				return;
			}
			if (!userSettled && elapsed >= userDeadlineMs) {
				settleUser({ type: 'timeout' });
			}

			await sleep(delayFor(backoffMs, attempt));
			attempt += 1;
		}
		settleUser({ type: 'timeout' });
	})();

	return { userFacing, done };
}

/**
 * One receipt read with a deadline. The in-flight RPC is left alone on timeout.
 * A late result or rejection after the deadline is ignored. A timeout returns null
 * so the poller can try again on the next backoff.
 */
export async function readReceiptWithoutAbort(
	read: () => Promise<ChainReceipt | null>,
	timeoutMs: number = COMPLETE_RECEIPT_RPC_TIMEOUT_MS
): Promise<ChainReceipt | null> {
	try {
		return await deadlineWithoutAbort(
			read,
			timeoutMs,
			() => new Error(`Receipt read timed out after ${Math.round(timeoutMs / 1000)} seconds`)
		);
	} catch {
		return null;
	}
}
