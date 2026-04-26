import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAcceptanceLedger } from '$lib/utils/service-quote/acceptance-ledger';

// Mock the browser environment
vi.mock('$app/environment', () => ({ browser: true }));

// Stateful mock storage for Preferences
const mockStorage: Record<string, string> = {};

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockImplementation(async ({ key }: { key: string }) => ({
			value: mockStorage[key] ?? null
		})),
		set: vi.fn().mockImplementation(async ({ key, value }: { key: string; value: string }) => {
			mockStorage[key] = value;
		}),
		remove: vi.fn().mockImplementation(async ({ key }: { key: string }) => {
			delete mockStorage[key];
		})
	}
}));

describe('acceptance ledger mutex', () => {
	beforeEach(async () => {
		// Clear the stateful storage between tests
		Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
		await clearAcceptanceLedger();
	});

	it('serializes concurrent upserts for the same proposalId', async () => {
		const { upsertAcceptanceLedgerEntry } = await import(
			'$lib/utils/service-quote/acceptance-ledger'
		);

		const operations: number[] = [];
		const proposalId = 'test-proposal-mutex-1';

		// Simulate 3 concurrent operations
		const op1 = upsertAcceptanceLedgerEntry(proposalId, 'accepting').then(() => {
			operations.push(1);
		});
		const op2 = upsertAcceptanceLedgerEntry(proposalId, 'accept_unknown', {
			reasonCode: 'pending_timeout'
		}).then(() => {
			operations.push(2);
		});
		const op3 = upsertAcceptanceLedgerEntry(proposalId, 'accepting').then(() => {
			operations.push(3);
		});

		await Promise.all([op1, op2, op3]);

		// Operations must complete in strict order (1, 2, 3)
		// because they all target the same proposalId
		expect(operations).toEqual([1, 2, 3]);
	});

	it('allows concurrent upserts for different proposalIds', async () => {
		const { upsertAcceptanceLedgerEntry } = await import(
			'$lib/utils/service-quote/acceptance-ledger'
		);

		const operations: number[] = [];
		const proposalId1 = 'test-proposal-mutex-p1';
		const proposalId2 = 'test-proposal-mutex-p2';
		const proposalId3 = 'test-proposal-mutex-p3';

		// Simulate concurrent operations on different proposalIds
		// These should complete in parallel (order not deterministic)
		const op1 = upsertAcceptanceLedgerEntry(proposalId1, 'accepting').then(() => {
			operations.push(1);
		});
		const op2 = upsertAcceptanceLedgerEntry(proposalId2, 'accepting').then(() => {
			operations.push(2);
		});
		const op3 = upsertAcceptanceLedgerEntry(proposalId3, 'accepting').then(() => {
			operations.push(3);
		});

		await Promise.all([op1, op2, op3]);

		// All should complete (order doesn't matter for different IDs)
		expect(operations).toHaveLength(3);
		expect(operations.sort()).toEqual([1, 2, 3]);
	});

	it('does not orphan operations when mutex is released', async () => {
		const { upsertAcceptanceLedgerEntry, _getAcceptanceLedgerEntry } = await import(
			'$lib/utils/service-quote/acceptance-ledger'
		);

		const proposalId = 'test-proposal-orphan';

		// Fire multiple concurrent operations
		const operations = Promise.all([
			upsertAcceptanceLedgerEntry(proposalId, 'accepting'),
			upsertAcceptanceLedgerEntry(proposalId, 'accept_unknown', {
				reasonCode: 'pending_timeout'
			}),
			upsertAcceptanceLedgerEntry(proposalId, 'accepting')
		]);

		await operations;

		// The ledger should have exactly ONE entry (the last one won)
		const entry = getAcceptanceLedgerEntry(proposalId);
		expect(entry).not.toBeNull();
		expect(entry?.state).toBe('accepting');
		// Last write should have increment to 3 attempts
		expect(entry?.attemptCount).toBe(3);
	});

	it('enforces max attempts limit under concurrent access', async () => {
		const { upsertAcceptanceLedgerEntry } = await import(
			'$lib/utils/service-quote/acceptance-ledger'
		);

		const proposalId = 'test-proposal-max-attempts';

		// Fire 15 concurrent operations (more than MAX_LEDGER_ATTEMPTS = 10)
		const operations = Array.from({ length: 15 }, (_, i) =>
			upsertAcceptanceLedgerEntry(proposalId, 'accepting').then(() => i + 1)
		);

		// First 10 should succeed, 11th onwards should fail with error
		const results = await Promise.allSettled(operations);

		// Count successes and failures
		const successes = results.filter((r) => r.status === 'fulfilled');
		const failures = results.filter((r) => r.status === 'rejected');

		// Exactly 10 should succeed (MAX_LEDGER_ATTEMPTS)
		expect(successes.length).toBe(10);
		// 5 should fail
		expect(failures.length).toBe(5);

		// All failures should be the max attempts error
		for (const failure of failures) {
			if (failure.status === 'rejected') {
				expect(failure.reason.message).toContain('maximum attempts');
			}
		}
	});

	it('enforces max attempts at exactly the limit', async () => {
		const { upsertAcceptanceLedgerEntry, _getAcceptanceLedgerEntry } = await import(
			'$lib/utils/service-quote/acceptance-ledger'
		);

		const proposalId = 'test-proposal-exact-limit';

		// Exactly 10 operations (the limit) - all should succeed
		const operations = Array.from({ length: 10 }, (_, i) =>
			upsertAcceptanceLedgerEntry(proposalId, 'accepting').then(() => i + 1)
		);

		const results = await Promise.allSettled(operations);

		const successes = results.filter((r) => r.status === 'fulfilled');
		const failures = results.filter((r) => r.status === 'rejected');

		// All 10 should succeed
		expect(successes.length).toBe(10);
		expect(failures.length).toBe(0);

		// Verify final state
		const entry = getAcceptanceLedgerEntry(proposalId);
		expect(entry?.attemptCount).toBe(10);
	});

	it('cleans up mutex after operation throws error', async () => {
		const { upsertAcceptanceLedgerEntry, _getAcceptanceLedgerEntry } = await import(
			'$lib/utils/service-quote/acceptance-ledger'
		);

		const proposalId = 'test-proposal-error-cleanup';

		// First reach max attempts
		await Promise.allSettled(
			Array.from({ length: 10 }, () => upsertAcceptanceLedgerEntry(proposalId, 'accepting'))
		);

		// This 11th operation should fail
		const failingOp = upsertAcceptanceLedgerEntry(proposalId, 'accepting');
		await expect(failingOp).rejects.toThrow('maximum attempts');

		// Now verify mutex is cleaned up by successfully completing a NEW operation
		// with a different proposalId (proves the mutex didn't block other operations)
		const newProposalId = 'test-proposal-cleanup-verification';
		const result = await upsertAcceptanceLedgerEntry(newProposalId, 'accepting');
		expect(result.attemptCount).toBe(1);
	});
});
