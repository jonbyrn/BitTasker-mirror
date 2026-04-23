import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearAcceptanceConfirmedMonitorEntry,
	clearAcceptanceLedger,
	getAcceptanceConfirmedMonitorEntriesDueForReverify,
	getAcceptanceConfirmedMonitorEntry,
	clearAcceptanceReplayEntry,
	getAcceptanceReplayEntriesDueForRetry,
	getAcceptanceReplayEntry,
	listAcceptanceConfirmedMonitorEntries,
	listAcceptanceReplayEntries,
	SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS,
	SERVICE_ACCEPTANCE_REPLAY_MAX_ATTEMPTS,
	SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS,
	upsertAcceptanceConfirmedMonitorEntry,
	upsertAcceptanceReplayEntry,
	type StorageLike
} from '$lib/utils/service-quote/acceptance-ledger';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';

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
	beforeEach(() => {
		vi.restoreAllMocks();
		clearAcceptanceLedger();
	});

	it('persists replay entries and normalizes transaction hashes', () => {
		const storage = createStorage();
		const baseNow = Date.now();

		const created = upsertAcceptanceReplayEntry(
			{
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
			},
			storage
		);

		expect(created.transactionHash).toBe('0xabc123');
		expect(created.attemptCount).toBe(1);

		const updated = upsertAcceptanceReplayEntry(
			{
				escrowId: 'svc-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-123',
				quoteRequestId: 'request-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1provider',
				transactionHash: '0xdef456',
				lastUpdatedAtMs: baseNow + 10_000
			},
			storage
		);

		expect(updated.createdAtMs).toBe(baseNow);
		expect(updated.lastUpdatedAtMs).toBe(baseNow + 10_000);
		expect(updated.attemptCount).toBe(2);
		expect(getAcceptanceReplayEntry('svc-123', storage)).toEqual(updated);
	});

	it('fails closed on malformed persisted entries and clears them', () => {
		const storage = createStorage();
		storage.setItem(
			'bittasker.service-acceptance-replay',
			JSON.stringify({
				'svc-123': { escrowId: 'svc-123', proposalId: '', transactionHash: '0xabc123' }
			})
		);

		expect(getAcceptanceReplayEntry('svc-123', storage)).toBeNull();
		expect(storage.getItem('bittasker.service-acceptance-replay')).toBeNull();
	});

	it('expires stale persisted replay entries and removes them', () => {
		const storage = createStorage();
		storage.setItem(
			'bittasker.service-acceptance-replay',
			JSON.stringify({
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
			})
		);
		vi.spyOn(Date, 'now').mockReturnValue(1_700_700_000_001);

		expect(getAcceptanceReplayEntry('svc-123', storage)).toBeNull();
		expect(storage.getItem('bittasker.service-acceptance-replay')).toBeNull();
	});

	it('clears replay entries explicitly', () => {
		const storage = createStorage();
		upsertAcceptanceReplayEntry(
			{
				escrowId: 'svc-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-123',
				quoteRequestId: 'request-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1provider',
				transactionHash: '0xabc123'
			},
			storage
		);

		clearAcceptanceReplayEntry('svc-123', storage);

		expect(getAcceptanceReplayEntry('svc-123', storage)).toBeNull();
		expect(storage.getItem('bittasker.service-acceptance-replay')).toBeNull();
	});

	it('lists replay entries in deterministic replay order', () => {
		const storage = createStorage();
		const baseNow = Date.now();

		upsertAcceptanceReplayEntry(
			{
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
			},
			storage
		);
		upsertAcceptanceReplayEntry(
			{
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
			},
			storage
		);

		expect(listAcceptanceReplayEntries(storage, baseNow).map((entry) => entry.escrowId)).toEqual([
			'svc-a',
			'svc-b'
		]);
	});

	it('returns only replay entries that are due and still below the retry cap', () => {
		const storage = createStorage();
		const baseNow = Date.now();

		upsertAcceptanceReplayEntry(
			{
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
			},
			storage
		);
		upsertAcceptanceReplayEntry(
			{
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
			},
			storage
		);
		upsertAcceptanceReplayEntry(
			{
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
			},
			storage
		);

		expect(
			getAcceptanceReplayEntriesDueForRetry(storage, baseNow, {
				retryIntervalMs: SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS
			}).map((entry) => entry.escrowId)
		).toEqual(['svc-due']);
	});
});

describe('service acceptance confirmed monitor ledger', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		clearAcceptanceLedger();
	});

	it('persists confirmed monitor entries and normalizes transaction hashes', () => {
		const storage = createStorage();
		const baseNow = Date.now();
		const acceptanceSnapshot = createAcceptanceSnapshot();

		const created = upsertAcceptanceConfirmedMonitorEntry(
			{
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
			},
			storage
		);

		expect(created.transactionHash).toBe('0xabc123');
		expect(created.attemptCount).toBe(1);

		const updated = upsertAcceptanceConfirmedMonitorEntry(
			{
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
			},
			storage
		);

		expect(updated.createdAtMs).toBe(baseNow);
		expect(updated.lastVerifiedAtMs).toBe(baseNow + 10_000);
		expect(updated.attemptCount).toBe(2);
		expect(getAcceptanceConfirmedMonitorEntry('svc-123', storage)).toEqual(updated);
	});

	it('fails closed on malformed persisted confirmed monitor entries and clears them', () => {
		const storage = createStorage();
		storage.setItem(
			'bittasker.service-acceptance-confirmed-monitor',
			JSON.stringify({
				'svc-123': { escrowId: 'svc-123', proposalId: '', transactionHash: '0xabc123' }
			})
		);

		expect(getAcceptanceConfirmedMonitorEntry('svc-123', storage)).toBeNull();
		expect(storage.getItem('bittasker.service-acceptance-confirmed-monitor')).toBeNull();
	});

	it('lists monitor entries in deterministic verification order and returns due entries', () => {
		const storage = createStorage();
		const baseNow = Date.now();
		const acceptanceSnapshot = createAcceptanceSnapshot();

		upsertAcceptanceConfirmedMonitorEntry(
			{
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
			},
			storage
		);
		upsertAcceptanceConfirmedMonitorEntry(
			{
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
			},
			storage
		);

		expect(
			listAcceptanceConfirmedMonitorEntries(storage, baseNow).map((entry) => entry.escrowId)
		).toEqual(['svc-a', 'svc-b']);
		expect(
			getAcceptanceConfirmedMonitorEntriesDueForReverify(storage, baseNow, {
				reverifyIntervalMs: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS
			}).map((entry) => entry.escrowId)
		).toEqual(['svc-a']);
	});

	it('clears confirmed monitor entries explicitly', () => {
		const storage = createStorage();
		upsertAcceptanceConfirmedMonitorEntry(
			{
				escrowId: 'svc-123',
				proposalId: 'proposal-123',
				proposalEventId: 'proposal-event-123',
				quoteRequestId: 'request-123',
				serviceId: '30402:pub:dtag',
				serviceAddress: '30402:pub:dtag',
				counterpartyPubkey: 'npub1provider',
				transactionHash: '0xabc123',
				acceptanceSnapshot: createAcceptanceSnapshot()
			},
			storage
		);

		clearAcceptanceConfirmedMonitorEntry('svc-123', storage);

		expect(getAcceptanceConfirmedMonitorEntry('svc-123', storage)).toBeNull();
		expect(storage.getItem('bittasker.service-acceptance-confirmed-monitor')).toBeNull();
	});
});
