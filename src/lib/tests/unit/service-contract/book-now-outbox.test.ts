import { describe, expect, it } from 'vitest';
import {
	acquireBookNowSubmissionLock,
	BOOK_NOW_OUTBOX_STORAGE_KEY,
	clearBookNowOutboxEntry,
	clearTerminalOrStaleBookNowOutboxEntries,
	createBookNowSubmissionLockEntry,
	readRecoverableBookNowOutboxEntries,
	readRecoverableBookNowOutboxEntry,
	updateBookNowOutboxEntry,
	type StorageLike
} from '$lib/utils/service-contract/book-now-outbox';

function createStorage(): StorageLike {
	const values = new Map<string, string>();

	return {
		getItem(key) {
			return values.get(key) ?? null;
		},
		setItem(key, value) {
			values.set(key, value);
		},
		removeItem(key) {
			values.delete(key);
		}
	};
}

describe('book now outbox', () => {
	it('creates and persists normalized submission locks', () => {
		const storage = createStorage();

		const result = acquireBookNowSubmissionLock(
			storage,
			'  Purchase:Service:Tier  ',
			'session-a',
			1_700_000_000_000,
			60_000
		);

		expect(result).toEqual({
			acquired: true,
			reason: 'acquired',
			entry: {
				fingerprint: 'purchase:service:tier',
				state: 'submission_locked',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_000_000,
				lockOwnerId: 'session-a',
				lockExpiresAtMs: 1_700_000_060_000
			}
		});
		expect(
			readRecoverableBookNowOutboxEntry(storage, 'purchase:service:tier', 1_700_000_000_100)
		).toEqual(result.entry);
	});

	it('rejects invalid fingerprints, owners, and timestamps', () => {
		expect(() => createBookNowSubmissionLockEntry('   ', 'session-a', 1_700_000_000_000)).toThrow(
			'Book Now outbox requires a fingerprint.'
		);
		expect(() =>
			createBookNowSubmissionLockEntry('purchase:service:tier', '   ', 1_700_000_000_000)
		).toThrow('Book Now outbox requires a lock owner id.');
		expect(() =>
			createBookNowSubmissionLockEntry('purchase:service:tier', 'session-a', Number.NaN)
		).toThrow('Book Now outbox requires a valid timestamp.');
	});

	it('blocks competing sessions while a submission lock is active and lets the owner renew it', () => {
		const storage = createStorage();

		acquireBookNowSubmissionLock(
			storage,
			'purchase:service:tier',
			'session-a',
			1_700_000_000_000,
			60_000
		);

		expect(
			acquireBookNowSubmissionLock(
				storage,
				'purchase:service:tier',
				'session-b',
				1_700_000_030_000,
				60_000
			)
		).toEqual({
			acquired: false,
			reason: 'already_locked',
			entry: {
				fingerprint: 'purchase:service:tier',
				state: 'submission_locked',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_000_000,
				lockOwnerId: 'session-a',
				lockExpiresAtMs: 1_700_000_060_000
			}
		});

		expect(
			acquireBookNowSubmissionLock(
				storage,
				'purchase:service:tier',
				'session-a',
				1_700_000_040_000,
				60_000
			)
		).toEqual({
			acquired: true,
			reason: 'renewed',
			entry: {
				fingerprint: 'purchase:service:tier',
				state: 'submission_locked',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_040_000,
				lockOwnerId: 'session-a',
				lockExpiresAtMs: 1_700_000_100_000
			}
		});
	});

	it('allows a new session to acquire a stale or expired lock', () => {
		const storage = createStorage();

		acquireBookNowSubmissionLock(
			storage,
			'purchase:service:tier',
			'session-a',
			1_700_000_000_000,
			60_000
		);

		expect(
			acquireBookNowSubmissionLock(
				storage,
				'purchase:service:tier',
				'session-b',
				1_700_000_061_000,
				60_000
			)
		).toEqual({
			acquired: true,
			reason: 'acquired',
			entry: {
				fingerprint: 'purchase:service:tier',
				state: 'submission_locked',
				createdAtMs: 1_700_000_061_000,
				updatedAtMs: 1_700_000_061_000,
				lockOwnerId: 'session-b',
				lockExpiresAtMs: 1_700_000_121_000
			}
		});
	});

	it('returns existing recoverable entries instead of creating a second in-flight purchase', () => {
		const storage = createStorage();

		updateBookNowOutboxEntry(storage, {
			fingerprint: 'purchase:service:tier',
			state: 'funding_submitted',
			nowMs: 1_700_000_000_000,
			transactionHash: '0xAbC123',
			instantOrderId: 'sib_1234567890abcd'
		});

		expect(
			acquireBookNowSubmissionLock(storage, 'purchase:service:tier', 'session-b', 1_700_000_010_000)
		).toEqual({
			acquired: false,
			reason: 'recoverable_exists',
			entry: {
				fingerprint: 'purchase:service:tier',
				state: 'funding_submitted',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_000_000,
				instantOrderId: 'sib_1234567890abcd',
				transactionHash: '0xabc123'
			}
		});
	});

	it('updates entries through funding submitted and contract sync pending states', () => {
		const storage = createStorage();

		acquireBookNowSubmissionLock(
			storage,
			'purchase:service:tier',
			'session-a',
			1_700_000_000_000,
			60_000
		);

		expect(
			updateBookNowOutboxEntry(storage, {
				fingerprint: 'purchase:service:tier',
				state: 'funding_submitted',
				nowMs: 1_700_000_005_000,
				expectedLockOwnerId: 'session-a',
				amountRbtc: '0.00001450',
				transactionHash: '0xAbC123',
				instantOrderId: 'sib_1234567890abcd'
			})
		).toEqual({
			fingerprint: 'purchase:service:tier',
			state: 'funding_submitted',
			createdAtMs: 1_700_000_000_000,
			updatedAtMs: 1_700_000_005_000,
			instantOrderId: 'sib_1234567890abcd',
			amountRbtc: '0.00001450',
			transactionHash: '0xabc123'
		});

		expect(
			updateBookNowOutboxEntry(storage, {
				fingerprint: 'purchase:service:tier',
				state: 'contract_sync_pending',
				nowMs: 1_700_000_010_000,
				transactionHash: '0xabc123',
				escrowId: 'svc-escrow-123'
			})
		).toEqual({
			fingerprint: 'purchase:service:tier',
			state: 'contract_sync_pending',
			createdAtMs: 1_700_000_000_000,
			updatedAtMs: 1_700_000_010_000,
			instantOrderId: 'sib_1234567890abcd',
			amountRbtc: '0.00001450',
			transactionHash: '0xabc123',
			escrowId: 'svc-escrow-123'
		});

		expect(readRecoverableBookNowOutboxEntries(storage, 1_700_000_010_100)).toEqual([
			{
				fingerprint: 'purchase:service:tier',
				state: 'contract_sync_pending',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_010_000,
				instantOrderId: 'sib_1234567890abcd',
				amountRbtc: '0.00001450',
				transactionHash: '0xabc123',
				escrowId: 'svc-escrow-123'
			}
		]);
	});

	it('requires the current lock owner when transitioning from a submission lock', () => {
		const storage = createStorage();

		acquireBookNowSubmissionLock(
			storage,
			'purchase:service:tier',
			'session-a',
			1_700_000_000_000,
			60_000
		);

		expect(() =>
			updateBookNowOutboxEntry(storage, {
				fingerprint: 'purchase:service:tier',
				state: 'funding_submitted',
				nowMs: 1_700_000_005_000,
				expectedLockOwnerId: 'session-b',
				transactionHash: '0xabc123'
			})
		).toThrow('Book Now outbox submission lock is owned by another session.');
	});

	it('clears terminal and stale entries while preserving active recoverable entries', () => {
		const storage = createStorage();

		updateBookNowOutboxEntry(storage, {
			fingerprint: 'purchase:ready',
			state: 'contract_ready',
			nowMs: 1_700_000_000_000,
			escrowId: 'svc-escrow-ready'
		});
		updateBookNowOutboxEntry(storage, {
			fingerprint: 'purchase:funding',
			state: 'funding_submitted',
			nowMs: 1_700_000_000_000,
			transactionHash: '0xabc123'
		});
		updateBookNowOutboxEntry(storage, {
			fingerprint: 'purchase:pending',
			state: 'contract_sync_pending',
			nowMs: 1_700_000_010_000,
			transactionHash: '0xdef456'
		});

		const removed = clearTerminalOrStaleBookNowOutboxEntries(storage, 1_700_090_000_000, 60_000);

		expect(removed).toEqual([
			{
				fingerprint: 'purchase:ready',
				state: 'contract_ready',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_000_000,
				escrowId: 'svc-escrow-ready'
			},
			{
				fingerprint: 'purchase:funding',
				state: 'funding_submitted',
				createdAtMs: 1_700_000_000_000,
				updatedAtMs: 1_700_000_000_000,
				transactionHash: '0xabc123'
			},
			{
				fingerprint: 'purchase:pending',
				state: 'contract_sync_pending',
				createdAtMs: 1_700_000_010_000,
				updatedAtMs: 1_700_000_010_000,
				transactionHash: '0xdef456'
			}
		]);
		expect(readRecoverableBookNowOutboxEntries(storage, 1_700_090_000_000, 60_000)).toEqual([]);
	});

	it('fails closed for malformed storage and supports explicit entry clearing', () => {
		const storage = createStorage();

		storage.setItem(
			BOOK_NOW_OUTBOX_STORAGE_KEY,
			JSON.stringify({
				entries: {
					'purchase:service:tier': {
						fingerprint: '',
						state: 'funding_submitted',
						createdAtMs: 'bad',
						updatedAtMs: 1_700_000_000_000
					}
				}
			})
		);

		expect(readRecoverableBookNowOutboxEntries(storage, 1_700_000_000_000)).toEqual([]);

		updateBookNowOutboxEntry(storage, {
			fingerprint: 'purchase:service:tier',
			state: 'funding_submitted',
			nowMs: 1_700_000_000_000,
			transactionHash: '0xabc123'
		});
		clearBookNowOutboxEntry(storage, 'purchase:service:tier');
		expect(
			readRecoverableBookNowOutboxEntry(storage, 'purchase:service:tier', 1_700_000_000_100)
		).toBeNull();
	});
});
