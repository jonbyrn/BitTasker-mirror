/**
 * Send Lock Manager — Prevents concurrent transactions from the same source.
 *
 * Two independent connected wallets can transact simultaneously,
 * but a single wallet cannot have two active sends. Provides AbortSignal
 * integration so in-flight operations can be cancelled cleanly.
 */

import { TransactionInProgressError } from './types';

export type AbortCallback = () => void;

export class SendLockManager {
	private activeSends = new Map<string, AbortCallback>();

	/**
	 * Acquire a lock for a source. Returns an abort callback.
	 * Throws if the source already has an active transaction.
	 */
	acquire(sourceId: string, onAbort: AbortCallback): void {
		if (this.activeSends.has(sourceId)) {
			throw new TransactionInProgressError(sourceId);
		}
		this.activeSends.set(sourceId, onAbort);
	}

	/** Release the lock for a source. Idempotent. */
	release(sourceId: string): void {
		this.activeSends.delete(sourceId);
	}

	/** Check if a source is currently locked. */
	isLocked(sourceId: string): boolean {
		return this.activeSends.has(sourceId);
	}

	/** Cancel an in-progress send and release the lock. */
	cancel(sourceId: string): void {
		const callback = this.activeSends.get(sourceId);
		if (callback) {
			callback();
			this.activeSends.delete(sourceId);
		}
	}

	/** Cancel all active sends and clear all locks. */
	cancelAll(): void {
		for (const callback of this.activeSends.values()) {
			callback();
		}
		this.activeSends.clear();
	}
}

/** Singleton instance */
export const sendLock = new SendLockManager();
