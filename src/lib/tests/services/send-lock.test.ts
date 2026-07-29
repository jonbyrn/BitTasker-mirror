/**
 * Tests for SendLockManager
 *
 * Covers:
 *  - acquire, release, isLocked
 *  - Double acquire throws TransactionInProgressError
 *  - cancel() fires abort callback and releases lock
 *  - cancelAll() fires all callbacks and clears all locks
 *  - Release and cancel are idempotent for missing source
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendLockManager } from '$lib/services/external-wallet/send-lock';
import { TransactionInProgressError } from '$lib/services/external-wallet/types';

describe('SendLockManager', () => {
	let lockManager: SendLockManager;

	beforeEach(() => {
		lockManager = new SendLockManager();
	});

	// ── acquire ─────────────────────────────────────────────────────────

	describe('acquire', () => {
		it('acquires a lock for a source', () => {
			lockManager.acquire('source-a', vi.fn());
			expect(lockManager.isLocked('source-a')).toBe(true);
		});

		it('stores the abort callback for later cancellation', () => {
			const onAbort = vi.fn();
			lockManager.acquire('source-a', onAbort);

			lockManager.cancel('source-a');

			expect(onAbort).toHaveBeenCalledTimes(1);
		});

		it('throws TransactionInProgressError on double acquire', () => {
			lockManager.acquire('source-a', vi.fn());
			expect(() => lockManager.acquire('source-a', vi.fn())).toThrow(TransactionInProgressError);
		});

		it('includes the source ID in the double-acquire error message', () => {
			lockManager.acquire('my-wallet', vi.fn());
			try {
				lockManager.acquire('my-wallet', vi.fn());
			} catch (e) {
				expect(e).toBeInstanceOf(TransactionInProgressError);
				expect((e as TransactionInProgressError).message).toContain('my-wallet');
			}
		});

		it('allows two independent sources to acquire simultaneously', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.acquire('source-b', vi.fn());

			expect(lockManager.isLocked('source-a')).toBe(true);
			expect(lockManager.isLocked('source-b')).toBe(true);
		});
	});

	// ── release ─────────────────────────────────────────────────────────

	describe('release', () => {
		it('releases a held lock', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.release('source-a');
			expect(lockManager.isLocked('source-a')).toBe(false);
		});

		it('is idempotent for a non-existent source (does not throw)', () => {
			expect(() => lockManager.release('i-dont-exist')).not.toThrow();
		});

		it('allows re-acquire after release', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.release('source-a');
			expect(() => lockManager.acquire('source-a', vi.fn())).not.toThrow();
		});
	});

	// ── isLocked ────────────────────────────────────────────────────────

	describe('isLocked', () => {
		it('returns false for a source that was never acquired', () => {
			expect(lockManager.isLocked('never-acquired')).toBe(false);
		});

		it('returns true after acquire', () => {
			lockManager.acquire('source-a', vi.fn());
			expect(lockManager.isLocked('source-a')).toBe(true);
		});

		it('returns false after release', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.release('source-a');
			expect(lockManager.isLocked('source-a')).toBe(false);
		});

		it('returns false after cancel', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.cancel('source-a');
			expect(lockManager.isLocked('source-a')).toBe(false);
		});
	});

	// ── cancel ──────────────────────────────────────────────────────────

	describe('cancel', () => {
		it('fires the abort callback for the specified source', () => {
			const onAbort = vi.fn();
			lockManager.acquire('source-a', onAbort);

			lockManager.cancel('source-a');

			expect(onAbort).toHaveBeenCalledTimes(1);
		});

		it('releases the lock after cancelling', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.cancel('source-a');
			expect(lockManager.isLocked('source-a')).toBe(false);
		});

		it('is idempotent for a non-existent source (does not throw)', () => {
			expect(() => lockManager.cancel('i-dont-exist')).not.toThrow();
		});

		it('does not fire callbacks for unrelated sources', () => {
			const onAbortA = vi.fn();
			const onAbortB = vi.fn();
			lockManager.acquire('source-a', onAbortA);
			lockManager.acquire('source-b', onAbortB);

			lockManager.cancel('source-a');

			expect(onAbortA).toHaveBeenCalledTimes(1);
			expect(onAbortB).not.toHaveBeenCalled();
		});

		it('allows re-acquire after cancelling', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.cancel('source-a');
			expect(() => lockManager.acquire('source-a', vi.fn())).not.toThrow();
		});
	});

	// ── cancelAll ───────────────────────────────────────────────────────

	describe('cancelAll', () => {
		it('fires all abort callbacks', () => {
			const onAbortA = vi.fn();
			const onAbortB = vi.fn();
			lockManager.acquire('source-a', onAbortA);
			lockManager.acquire('source-b', onAbortB);

			lockManager.cancelAll();

			expect(onAbortA).toHaveBeenCalledTimes(1);
			expect(onAbortB).toHaveBeenCalledTimes(1);
		});

		it('clears all locks', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.acquire('source-b', vi.fn());

			lockManager.cancelAll();

			expect(lockManager.isLocked('source-a')).toBe(false);
			expect(lockManager.isLocked('source-b')).toBe(false);
			expect(lockManager.isLocked('source-c')).toBe(false);
		});

		it('is safe to call on an empty manager', () => {
			expect(() => lockManager.cancelAll()).not.toThrow();
		});

		it('allows new acquires after cancelAll', () => {
			lockManager.acquire('source-a', vi.fn());
			lockManager.cancelAll();
			expect(() => lockManager.acquire('source-a', vi.fn())).not.toThrow();
		});
	});
});
