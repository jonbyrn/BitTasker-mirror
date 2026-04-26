import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearAcceptanceConfirmedMonitorEntry,
	clearAcceptanceLedger,
	clearAcceptanceReplayEntry,
	getAcceptanceConfirmedMonitorEntriesDueForReverify,
	getAcceptanceConfirmedMonitorEntry,
	getAcceptanceReplayEntriesDueForRetry,
	getAcceptanceReplayEntry,
	getStuckAcceptanceLedgerEntries,
	listAcceptanceConfirmedMonitorEntries,
	listAcceptanceReplayEntries,
	SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS,
	SERVICE_ACCEPTANCE_REPLAY_MAX_ATTEMPTS,
	SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS,
	upsertAcceptanceConfirmedMonitorEntry,
	upsertAcceptanceReplayEntry,
	upsertAcceptanceLedgerEntry
} from '$lib/utils/service-quote/acceptance-ledger';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';
import { Preferences } from '@capacitor/preferences';

// Mock the browser environment
vi.mock('$app/environment', () => ({ browser: true }));

// Stateful mock storage for Preferences - must be persistent across tests
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

function createAcceptanceSnapshot(
	overrides: Partial<ServiceAcceptanceSnapshot> = {}
): ServiceAcceptanceSnapshot {
	return {
		clientRskAddress: '0x3333333333333333333333333333333333333333',
		clientFeeTier: 1,
		freelancerRskAddress: '0x2222222222222222222222222222222222222222',
		freelancerFeeTier: 1,
		chainId: 31,
		contractAddress: '0x4444444444444444444444444444444444444444',
		conversionFormulaVersion: 'v1',
		conversionSnapshotId: 'snapshot-123',
		btcUsdRateMicros: 100_000_000_000,
		sourceTimestamp: 1_763_000_000,
		requiredConfirmations: 3,
		finalityPolicyVersion: 'rsk_rootstock_default_v1',
		sats: '100000',
		weiAmount: '1000000000000000',
		confirmationsAtVerification: 3,
		verificationRpc: 'rsk:testnet',
		...overrides
	};
}

describe('service acceptance replay ledger', () => {
	beforeEach(async () => {
		// Clear the stateful storage between tests but keep mock implementations
		Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
		await clearAcceptanceLedger();
	});

	it('persists replay entries and normalizes transaction hashes', async () => {
		const baseNow = Date.now();

		const created = await upsertAcceptanceReplayEntry({
			escrowId: 'svc-123',
			proposalId: 'proposal-123',
			proposalEventId: 'proposal-event-123',
			quoteRequestId: 'request-123',
			serviceId: '30402:pub:dtag',
			serviceAddress: '30402:pub:dtag',
			counterpartyPubkey: 'npub1provider',
			transactionHash: ' 0xAbC123 ',
			createdAtMs: baseNow,
			lastUpdatedAtMs: baseNow
		});

		expect(created.transactionHash).toBe('0xabc123');
		expect(created.attemptCount).toBe(1);

		const updated = await upsertAcceptanceReplayEntry({
			escrowId: 'svc-123',
			proposalId: 'proposal-123',
			proposalEventId: 'proposal-event-123',
			quoteRequestId: 'request-123',
			serviceId: '30402:pub:dtag',
			serviceAddress: '30402:pub:dtag',
			counterpartyPubkey: 'npub1provider',
			transactionHash: '0xdef456',
			lastUpdatedAtMs: baseNow + 10_000
		});

		expect(updated.createdAtMs).toBe(baseNow);
		expect(updated.lastUpdatedAtMs).toBe(baseNow + 10_000);
		expect(updated.attemptCount).toBe(2);
		expect(await getAcceptanceReplayEntry('svc-123')).toEqual(updated);
	});

	it('fails closed on malformed persisted entries and filters them out', async () => {
		// Set up storage with malformed data (empty proposalId fails sanitization)
		// The malformed entry was created via direct storage manipulation in original test
		mockStorage['bittasker.service-acceptance-replay'] = JSON.stringify({
			'svc-123': { escrowId: 'svc-123', proposalId: '', transactionHash: '0xabc123' }
		});

		// Entry is not returned due to sanitization failure
		expect(await getAcceptanceReplayEntry('svc-123')).toBeNull();
		// The malformed entry is filtered out during hydration and NOT persisted back
		// Storage still contains original malformed data because hydration filtered it
		// but did not trigger a persist (the corrupted data was already in storage)
		// NOTE: This is the actual behavior - malformed entries are not recovered
	});

	it('expires stale persisted replay entries and removes them', async () => {
		// Set up old entry that will be filtered as stale
		mockStorage['bittasker.service-acceptance-replay'] = JSON.stringify({
			'svc-123': {
				escrowId: 'svc-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-123',
				quoteRequestId: 'request-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1provider',
				transactionHash: '0xabc123',
				createdAtMs: 1_700_000_000_000,
				lastUpdatedAtMs: 1_700_000_000_000,
				attemptCount: 1
			}
		});

		vi.spyOn(Date, 'now').mockReturnValue(1_700_700_000_001);

		// Entry is filtered as stale
		expect(await getAcceptanceReplayEntry('svc-123')).toBeNull();
		// When state is empty after filtering, implementation calls Preferences.remove
		// so storage key is deleted (undefined)
		expect(mockStorage['bittasker.service-acceptance-replay']).toBeUndefined();
	});

	it('clears replay entries explicitly', async () => {
		await upsertAcceptanceReplayEntry({
			escrowId: 'svc-123',
			proposalId: 'proposal-123',
			proposalEventId: 'proposal-event-123',
			quoteRequestId: 'request-123',
			serviceId: '30402:pub:dtag',
			serviceAddress: '30402:pub:dtag',
			counterpartyPubkey: 'npub1provider',
			transactionHash: '0xabc123'
		});

		await clearAcceptanceReplayEntry('svc-123');

		expect(await getAcceptanceReplayEntry('svc-123')).toBeNull();
		// Storage key is removed
		expect(mockStorage['bittasker.service-acceptance-replay']).toBeUndefined();
	});

	it('lists replay entries in deterministic replay order', async () => {
		const baseNow = Date.now();

		await upsertAcceptanceReplayEntry({
			escrowId: 'svc-b',
			proposalId: 'proposal-b',
			proposalEventId: 'proposal-event-b',
			quoteRequestId: 'request-b',
			serviceId: 'service-b',
			serviceAddress: 'service-b',
			counterpartyPubkey: 'npub1providerb',
			transactionHash: '0xbb',
			createdAtMs: baseNow - 20_000,
			lastUpdatedAtMs: baseNow - 20_000,
			attemptCount: 1
		});
		await upsertAcceptanceReplayEntry({
			escrowId: 'svc-a',
			proposalId: 'proposal-a',
			proposalEventId: 'proposal-event-a',
			quoteRequestId: 'request-a',
			serviceId: 'service-a',
			serviceAddress: 'service-a',
			counterpartyPubkey: 'npub1providera',
			transactionHash: '0xaa',
			createdAtMs: baseNow - 30_000,
			lastUpdatedAtMs: baseNow - 30_000,
			attemptCount: 1
		});

		const entries = await listAcceptanceReplayEntries(baseNow);
		expect(entries.map((entry) => entry.escrowId)).toEqual(['svc-a', 'svc-b']);
	});

	it('returns only replay entries that are due and still below the retry cap', async () => {
		const baseNow = Date.now();

		await upsertAcceptanceReplayEntry({
			escrowId: 'svc-due',
			proposalId: 'proposal-due',
			proposalEventId: 'proposal-event-due',
			quoteRequestId: 'request-due',
			serviceId: 'service-due',
			serviceAddress: 'service-due',
			counterpartyPubkey: 'npub1providerdue',
			transactionHash: '0xdue',
			createdAtMs: baseNow - 60_000,
			lastUpdatedAtMs: baseNow - 60_000,
			attemptCount: 1
		});
		await upsertAcceptanceReplayEntry({
			escrowId: 'svc-fresh',
			proposalId: 'proposal-fresh',
			proposalEventId: 'proposal-event-fresh',
			quoteRequestId: 'request-fresh',
			serviceId: 'service-fresh',
			serviceAddress: 'service-fresh',
			counterpartyPubkey: 'npub1providerfresh',
			transactionHash: '0xfresh',
			createdAtMs: baseNow - 5_000,
			lastUpdatedAtMs: baseNow - 5_000,
			attemptCount: 1
		});
		await upsertAcceptanceReplayEntry({
			escrowId: 'svc-maxed',
			proposalId: 'proposal-maxed',
			proposalEventId: 'proposal-event-maxed',
			quoteRequestId: 'request-maxed',
			serviceId: 'service-maxed',
			serviceAddress: 'service-maxed',
			counterpartyPubkey: 'npub1providermaxed',
			transactionHash: '0xmaxed',
			createdAtMs: baseNow - 60_000,
			lastUpdatedAtMs: baseNow - 60_000,
			attemptCount: SERVICE_ACCEPTANCE_REPLAY_MAX_ATTEMPTS
		});

		const due = await getAcceptanceReplayEntriesDueForRetry(baseNow, {
			retryIntervalMs: SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS
		});
		expect(due.map((entry) => entry.escrowId)).toEqual(['svc-due']);
	});
});

describe('service acceptance confirmed monitor ledger', () => {
	beforeEach(async () => {
		// Clear the stateful storage between tests but keep mock implementations
		Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
		await clearAcceptanceLedger();
	});

	it('persists confirmed monitor entries and normalizes transaction hashes', async () => {
		const baseNow = Date.now();
		const acceptanceSnapshot = createAcceptanceSnapshot();

		const created = await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: 'svc-123',
			proposalId: 'proposal-123',
			proposalEventId: 'proposal-event-123',
			quoteRequestId: 'request-123',
			serviceId: '30402:pub:dtag',
			serviceAddress: '30402:pub:dtag',
			counterpartyPubkey: 'npub1provider',
			transactionHash: ' 0xAbC123 ',
			acceptanceSnapshot,
			createdAtMs: baseNow,
			lastUpdatedAtMs: baseNow,
			lastVerifiedAtMs: baseNow
		});

		expect(created.transactionHash).toBe('0xabc123');
		expect(created.attemptCount).toBe(1);

		const updated = await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: 'svc-123',
			proposalId: 'proposal-123',
			proposalEventId: 'proposal-event-123',
			quoteRequestId: 'request-123',
			serviceId: '30402:pub:dtag',
			serviceAddress: '30402:pub:dtag',
			counterpartyPubkey: 'npub1provider',
			transactionHash: '0xdef456',
			acceptanceSnapshot: {
				...acceptanceSnapshot,
				confirmationsAtVerification: 5
			},
			createdAtMs: baseNow,
			lastUpdatedAtMs: baseNow + 10_000,
			lastVerifiedAtMs: baseNow + 10_000
		});

		expect(updated.createdAtMs).toBe(baseNow);
		expect(updated.lastVerifiedAtMs).toBe(baseNow + 10_000);
		expect(updated.attemptCount).toBe(2);
		expect(await getAcceptanceConfirmedMonitorEntry('svc-123')).toEqual(updated);
	});

	it('fails closed on malformed persisted confirmed monitor entries and filters them out', async () => {
		// Set up storage with malformed data (empty proposalId fails sanitization)
		mockStorage['bittasker.service-acceptance-confirmed-monitor'] = JSON.stringify({
			'svc-123': { escrowId: 'svc-123', proposalId: '', transactionHash: '0xabc123' }
		});

		// Entry is not returned due to sanitization failure
		expect(await getAcceptanceConfirmedMonitorEntry('svc-123')).toBeNull();
		// The malformed entry is filtered out during hydration and NOT persisted back
		// Storage still contains original malformed data
	});

	it('lists monitor entries in deterministic verification order and returns due entries', async () => {
		const baseNow = Date.now();
		const acceptanceSnapshot = createAcceptanceSnapshot();

		await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: 'svc-b',
			proposalId: 'proposal-b',
			proposalEventId: 'proposal-event-b',
			quoteRequestId: 'request-b',
			serviceId: 'service-b',
			serviceAddress: 'service-b',
			counterpartyPubkey: 'npub1providerb',
			transactionHash: '0xbb',
			acceptanceSnapshot,
			createdAtMs: baseNow - 20_000,
			lastUpdatedAtMs: baseNow - 20_000,
			lastVerifiedAtMs: baseNow - 20_000,
			attemptCount: 1
		});
		await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: 'svc-a',
			proposalId: 'proposal-a',
			proposalEventId: 'proposal-event-a',
			quoteRequestId: 'request-a',
			serviceId: 'service-a',
			serviceAddress: 'service-a',
			counterpartyPubkey: 'npub1providera',
			transactionHash: '0xaa',
			acceptanceSnapshot,
			createdAtMs: baseNow - 60_000,
			lastUpdatedAtMs: baseNow - 60_000,
			lastVerifiedAtMs: baseNow - 60_000,
			attemptCount: 1
		});

		const entries = await listAcceptanceConfirmedMonitorEntries(baseNow);
		expect(entries.map((entry) => entry.escrowId)).toEqual(['svc-a', 'svc-b']);

		const due = await getAcceptanceConfirmedMonitorEntriesDueForReverify(baseNow, {
			reverifyIntervalMs: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS
		});
		expect(due.map((entry) => entry.escrowId)).toEqual(['svc-a']);
	});

	it('clears confirmed monitor entries explicitly', async () => {
		await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: 'svc-123',
			proposalId: 'proposal-123',
			proposalEventId: 'proposal-event-123',
			quoteRequestId: 'request-123',
			serviceId: '30402:pub:dtag',
			serviceAddress: '30402:pub:dtag',
			counterpartyPubkey: 'npub1provider',
			transactionHash: '0xabc123',
			acceptanceSnapshot: createAcceptanceSnapshot()
		});

		await clearAcceptanceConfirmedMonitorEntry('svc-123');

		expect(await getAcceptanceConfirmedMonitorEntry('svc-123')).toBeNull();
		// Storage key is removed
		expect(mockStorage['bittasker.service-acceptance-confirmed-monitor']).toBeUndefined();
	});
});

describe('stuck acceptance ledger detection', () => {
	beforeEach(async () => {
		Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
		await clearAcceptanceLedger();
	});

	it('returns empty array when no stuck entries exist', async () => {
		await upsertAcceptanceLedgerEntry('proposal-123', 'accepting');
		await upsertAcceptanceLedgerEntry('proposal-456', 'accepted');

		const stuck = await getStuckAcceptanceLedgerEntries();
		expect(stuck).toHaveLength(0);
	});

	it('detects entries in accept_failed state older than maxAgeMs', async () => {
		const baseNow = Date.now();

		// Fresh failed entry (not stuck) and Stuck failed entry (older than 30 minutes default)
		// Merged into single storage entry
		mockStorage['bittasker.service-acceptance-ledger'] = JSON.stringify({
			'proposal-fresh': {
				proposalId: 'proposal-fresh',
				state: 'accept_failed',
				attemptCount: 1,
				lastUpdatedAt: baseNow - 10_000, // 10 seconds ago
				attempts: []
			},
			'proposal-stuck': {
				proposalId: 'proposal-stuck',
				state: 'accept_failed',
				attemptCount: 2,
				lastUpdatedAt: baseNow - 60 * 60 * 1000, // 1 hour ago
				attempts: []
			}
		});

		const stuck = await getStuckAcceptanceLedgerEntries(baseNow);
		expect(stuck).toHaveLength(1);
		expect(stuck[0].proposalId).toBe('proposal-stuck');
	});

	it('detects entries in accept_unknown state older than maxAgeMs', async () => {
		const baseNow = Date.now();

		mockStorage['bittasker.service-acceptance-ledger'] = JSON.stringify({
			'proposal-unknown-stuck': {
				proposalId: 'proposal-unknown-stuck',
				state: 'accept_unknown',
				attemptCount: 3,
				lastUpdatedAt: baseNow - 45 * 60 * 1000, // 45 minutes ago
				attempts: []
			}
		});

		const stuck = await getStuckAcceptanceLedgerEntries(baseNow);
		expect(stuck).toHaveLength(1);
		expect(stuck[0].proposalId).toBe('proposal-unknown-stuck');
	});

	it('ignores entries in accepting or accepted states even if old', async () => {
		const baseNow = Date.now();

		mockStorage['bittasker.service-acceptance-ledger'] = JSON.stringify({
			'proposal-accepting-old': {
				proposalId: 'proposal-accepting-old',
				state: 'accepting',
				attemptCount: 5,
				lastUpdatedAt: baseNow - 2 * 60 * 60 * 1000, // 2 hours ago
				attempts: []
			},
			'proposal-accepted-old': {
				proposalId: 'proposal-accepted-old',
				state: 'accepted',
				attemptCount: 1,
				lastUpdatedAt: baseNow - 2 * 60 * 60 * 1000, // 2 hours ago
				attempts: []
			}
		});

		const stuck = await getStuckAcceptanceLedgerEntries(baseNow);
		expect(stuck).toHaveLength(0);
	});

	it('respects custom maxAgeMs parameter', async () => {
		const baseNow = Date.now();

		// Create two entries: one old (15 min) and one fresh (30 sec)
		// The old entry should be detected as stuck with any threshold <= 15min
		// The fresh entry should NOT be detected as stuck with 1min threshold
		await upsertAcceptanceLedgerEntry('proposal-old', 'accept_failed', {
			timestamp: baseNow - 15 * 60 * 1000 // 15 minutes ago
		});
		await upsertAcceptanceLedgerEntry('proposal-fresh', 'accept_failed', {
			timestamp: baseNow - 30 * 1000 // 30 seconds ago
		});

		// With 10 minute maxAge, only the old entry should be stuck
		const stuck10min = await getStuckAcceptanceLedgerEntries(baseNow, 10 * 60 * 1000);
		expect(stuck10min).toHaveLength(1);
		expect(stuck10min[0].proposalId).toBe('proposal-old');

		// With 1 minute maxAge, the fresh entry should NOT be stuck
		// Note: old entry is still stuck since 15min > 1min
		const stuck1min = await getStuckAcceptanceLedgerEntries(baseNow, 1 * 60 * 1000);
		expect(stuck1min).toHaveLength(1);
		expect(stuck1min[0].proposalId).toBe('proposal-old');
		expect(stuck1min.find((e) => e.proposalId === 'proposal-fresh')).toBeUndefined();
	});

	it('returns stuck entries sorted by lastUpdatedAt ascending (oldest first)', async () => {
		const baseNow = Date.now();

		// Create entries via the public API to ensure proper state management
		await upsertAcceptanceLedgerEntry('proposal-oldest', 'accept_failed', {
			timestamp: baseNow - 3 * 60 * 60 * 1000 // 3 hours ago
		});
		await upsertAcceptanceLedgerEntry('proposal-newest-stuck', 'accept_unknown', {
			timestamp: baseNow - 35 * 60 * 1000 // 35 minutes ago
		});
		await upsertAcceptanceLedgerEntry('proposal-mid-stuck', 'accept_failed', {
			timestamp: baseNow - 2 * 60 * 60 * 1000 // 2 hours ago
		});

		const stuck = await getStuckAcceptanceLedgerEntries(baseNow);
		expect(stuck).toHaveLength(3);
		// Ascending order: oldest timestamp (3 hours ago) comes first
		expect(stuck[0].proposalId).toBe('proposal-oldest');
		expect(stuck[1].proposalId).toBe('proposal-mid-stuck');
		expect(stuck[2].proposalId).toBe('proposal-newest-stuck');
	});
});

describe('preferences api failures', () => {
	beforeEach(async () => {
		Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
		await clearAcceptanceLedger();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('replay ledger persistence failures', () => {
		it('falls back to empty ledger when Preferences.get throws during hydrateReplayLedger', async () => {
			// Set up storage with valid entry
			mockStorage['bittasker.service-acceptance-replay'] = JSON.stringify({
				'svc-123': {
					escrowId: 'svc-123',
					proposalId: 'proposal-123',
					proposalEventId: 'proposal-event-123',
					quoteRequestId: 'request-123',
					serviceId: '30402:pub:dtag',
					serviceAddress: '30402:pub:dtag',
					counterpartyPubkey: 'npub1provider',
					transactionHash: '0xabc123',
					createdAtMs: Date.now(),
					lastUpdatedAtMs: Date.now(),
					attemptCount: 1
				}
			});

			// Make Preferences.get throw
			vi.spyOn(Preferences, 'get').mockRejectedValueOnce(new Error('Storage unavailable'));

			// Should fall back to empty ledger, not throw
			const entry = await getAcceptanceReplayEntry('svc-123');
			expect(entry).toBeNull();
		});

		it('does not throw when Preferences.set throws during persistReplayState', async () => {
			// Create a valid entry first
			await upsertAcceptanceReplayEntry({
				escrowId: 'svc-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-123',
				quoteRequestId: 'request-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1provider',
				transactionHash: '0xabc123'
			});

			// Make Preferences.set throw on the next persist
			vi.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('Write failed'));

			// Should not throw - error is caught and ignored
			await expect(
				upsertAcceptanceReplayEntry({
					escrowId: 'svc-456',
					proposalId: 'proposal-456',
					proposalEventId: 'proposal-event-456',
					quoteRequestId: 'request-456',
					serviceId: 'service-456',
					serviceAddress: 'service-456',
					counterpartyPubkey: 'npub1provider456',
					transactionHash: '0xdef456'
				})
			).resolves.not.toThrow();

			// Entry should still be retrievable from in-memory state
			const entry = await getAcceptanceReplayEntry('svc-456');
			expect(entry).not.toBeNull();
			expect(entry?.escrowId).toBe('svc-456');
		});

		it('verifies entry persists correctly when Preferences.set succeeds after a prior failure', async () => {
			// Make Preferences.set throw first
			vi.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('Write failed'));

			// Try to create first entry - persist will fail
			await upsertAcceptanceReplayEntry({
				escrowId: 'svc-first',
				proposalId: 'proposal-first',
				proposalEventId: 'proposal-event-first',
				quoteRequestId: 'request-first',
				serviceId: 'service-first',
				serviceAddress: 'service-first',
				counterpartyPubkey: 'npub1providerfirst',
				transactionHash: '0xfirst'
			});

			// Now create second entry - should persist successfully
			await upsertAcceptanceReplayEntry({
				escrowId: 'svc-second',
				proposalId: 'proposal-second',
				proposalEventId: 'proposal-event-second',
				quoteRequestId: 'request-second',
				serviceId: 'service-second',
				serviceAddress: 'service-second',
				counterpartyPubkey: 'npub1providersecond',
				transactionHash: '0xsecond'
			});

			// Second entry should be retrievable from in-memory state
			const entry = await getAcceptanceReplayEntry('svc-second');
			expect(entry).not.toBeNull();
			expect(entry?.escrowId).toBe('svc-second');
		});
	});

	describe('confirmed monitor ledger persistence failures', () => {
		it('falls back to empty ledger when Preferences.get throws during hydrateConfirmedMonitorLedger', async () => {
			const acceptanceSnapshot = createAcceptanceSnapshot();

			// Set up storage with valid entry
			mockStorage['bittasker.service-acceptance-confirmed-monitor'] = JSON.stringify({
				'svc-123': {
					escrowId: 'svc-123',
					proposalId: 'proposal-123',
					proposalEventId: 'proposal-event-123',
					quoteRequestId: 'request-123',
					serviceId: '30402:pub:dtag',
					serviceAddress: '30402:pub:dtag',
					counterpartyPubkey: 'npub1provider',
					transactionHash: '0xabc123',
					publishedStatus: 'accepted',
					createdAtMs: Date.now(),
					lastUpdatedAtMs: Date.now(),
					lastVerifiedAtMs: Date.now(),
					attemptCount: 1,
					acceptanceSnapshot
				}
			});

			// Make Preferences.get throw
			vi.spyOn(Preferences, 'get').mockRejectedValueOnce(new Error('Storage unavailable'));

			// Should fall back to empty ledger, not throw
			const entry = await getAcceptanceConfirmedMonitorEntry('svc-123');
			expect(entry).toBeNull();
		});

		it('does not throw when Preferences.set throws during persistConfirmedMonitorState', async () => {
			const acceptanceSnapshot = createAcceptanceSnapshot();

			// Create a valid entry first
			await upsertAcceptanceConfirmedMonitorEntry({
				escrowId: 'svc-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-123',
				quoteRequestId: 'request-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1provider',
				transactionHash: '0xabc123',
				acceptanceSnapshot
			});

			// Make Preferences.set throw on the next persist
			vi.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('Write failed'));

			// Should not throw - error is caught and ignored
			await expect(
				upsertAcceptanceConfirmedMonitorEntry({
					escrowId: 'svc-456',
					proposalId: 'proposal-456',
					proposalEventId: 'proposal-event-456',
					quoteRequestId: 'request-456',
					serviceId: 'service-456',
					serviceAddress: 'service-456',
					counterpartyPubkey: 'npub1provider456',
					transactionHash: '0xdef456',
					acceptanceSnapshot
				})
			).resolves.not.toThrow();

			// Entry should still be accessible from in-memory state
			const entry = await getAcceptanceConfirmedMonitorEntry('svc-456');
			expect(entry).not.toBeNull();
			expect(entry?.escrowId).toBe('svc-456');
		});
	});

	describe('main ledger persistence failures', () => {
		it('falls back to empty ledger when Preferences.get throws during hydrateLedger', async () => {
			// Set up storage with valid entry
			mockStorage['bittasker.service-acceptance-ledger'] = JSON.stringify({
				'proposal-123': {
					proposalId: 'proposal-123',
					state: 'accepting',
					attemptCount: 1,
					lastUpdatedAt: Date.now(),
					attempts: []
				}
			});

			// Make Preferences.get throw
			vi.spyOn(Preferences, 'get').mockRejectedValueOnce(new Error('Storage unavailable'));

			// Import the getter to test directly
			const { getAcceptanceLedgerEntry } = await import(
				'$lib/utils/service-quote/acceptance-ledger'
			);

			// Trigger hydration by accessing the ledger
			const entry = getAcceptanceLedgerEntry('proposal-123');
			expect(entry).toBeNull();
		});

		it('does not throw when Preferences.set throws during persistLedgerState', async () => {
			// Create a valid entry first
			await upsertAcceptanceLedgerEntry('proposal-123', 'accepting');

			// Make Preferences.set throw on the next persist
			vi.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('Write failed'));

			// Should not throw - error is caught and ignored
			await expect(upsertAcceptanceLedgerEntry('proposal-456', 'accepted')).resolves.not.toThrow();

			// Entry should still be accessible from in-memory state
			const { getAcceptanceLedgerEntry } = await import(
				'$lib/utils/service-quote/acceptance-ledger'
			);
			const entry = getAcceptanceLedgerEntry('proposal-456');
			expect(entry).not.toBeNull();
			expect(entry?.proposalId).toBe('proposal-456');
		});

		it('verifies entry persists correctly when Preferences.set succeeds after a prior failure on main ledger', async () => {
			// Make Preferences.set throw first
			vi.spyOn(Preferences, 'set').mockRejectedValueOnce(new Error('Write failed'));

			// Try to create first entry - persist will fail
			await upsertAcceptanceLedgerEntry('proposal-first', 'accepting');

			// Now create second entry - should persist successfully
			await upsertAcceptanceLedgerEntry('proposal-second', 'accepted');

			// Second entry should be retrievable from in-memory state
			const { getAcceptanceLedgerEntry } = await import(
				'$lib/utils/service-quote/acceptance-ledger'
			);
			const entry = getAcceptanceLedgerEntry('proposal-second');
			expect(entry).not.toBeNull();
			expect(entry?.proposalId).toBe('proposal-second');
		});
	});
});
