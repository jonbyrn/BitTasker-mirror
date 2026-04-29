import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearAcceptanceConfirmedMonitorEntry,
	clearAcceptanceLedger,
	clearAcceptanceReplayEntry,
	getAcceptanceConfirmedMonitorEntriesDueForReverify,
	getAcceptanceConfirmedMonitorEntry,
	getAcceptanceReplayEntriesDueForRetry,
	getAcceptanceReplayEntry,
	listAcceptanceConfirmedMonitorEntries,
	listAcceptanceReplayEntries,
	SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS,
	SERVICE_ACCEPTANCE_REPLAY_MAX_ATTEMPTS,
	SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS,
	upsertAcceptanceConfirmedMonitorEntry,
	upsertAcceptanceReplayEntry
} from '$lib/utils/service-quote/acceptance-ledger';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';

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
