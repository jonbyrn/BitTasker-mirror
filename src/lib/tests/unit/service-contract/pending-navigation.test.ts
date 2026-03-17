import { describe, expect, it } from 'vitest';
import {
	clearPendingServiceContractNavigation,
	consumePendingServiceContractNavigation,
	consumePendingServiceContractNavigationForContractsPage,
	createPendingServiceContractNavigation,
	matchesPendingServiceContractNavigation,
	readPendingServiceContractNavigation,
	writePendingServiceContractNavigation,
	type StorageLike
} from '$lib/utils/service-contract/pending-navigation';

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

describe('pending service contract navigation', () => {
	it('normalizes transaction hashes when creating pending navigation state', () => {
		expect(createPendingServiceContractNavigation(' 0xAbC123 ', 1_700_000_000_000)).toEqual({
			transactionHash: '0xabc123',
			createdAtMs: 1_700_000_000_000
		});
	});

	it('rejects invalid hashes and timestamps when creating pending navigation state', () => {
		expect(() => createPendingServiceContractNavigation('   ', 1_700_000_000_000)).toThrow(
			'Pending service contract navigation requires a transaction hash.'
		);
		expect(() => createPendingServiceContractNavigation('0xabc123', 0)).toThrow(
			'Pending service contract navigation requires a valid timestamp.'
		);
	});

	it('writes, reads, and consumes the matching escrow highlight from storage', () => {
		const storage = createStorage();

		writePendingServiceContractNavigation(storage, '0xAbC123', 1_700_000_000_000);

		expect(readPendingServiceContractNavigation(storage, 1_700_000_000_500)).toEqual({
			transactionHash: '0xabc123',
			createdAtMs: 1_700_000_000_000
		});
		expect(
			consumePendingServiceContractNavigation(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xabc123'
				},
				1_700_000_001_000
			)
		).toBe('svc-escrow-123');
		expect(readPendingServiceContractNavigation(storage, 1_700_000_001_000)).toBeNull();
	});

	it('keeps pending navigation when the contract creation event does not match', () => {
		const storage = createStorage();
		const pendingNavigation = writePendingServiceContractNavigation(
			storage,
			'0xabc123',
			1_700_000_000_000
		);

		expect(
			consumePendingServiceContractNavigation(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xdef456'
				},
				1_700_000_001_000
			)
		).toBeNull();
		expect(matchesPendingServiceContractNavigation(pendingNavigation, '0xAbC123')).toBe(true);
		expect(readPendingServiceContractNavigation(storage, 1_700_000_001_000)).toEqual({
			transactionHash: '0xabc123',
			createdAtMs: 1_700_000_000_000
		});
	});

	it('matches pending navigation when a replacement transaction hash aliases the original', () => {
		const storage = createStorage();
		writePendingServiceContractNavigation(storage, '0xabc123', 1_700_000_000_000);

		expect(
			consumePendingServiceContractNavigation(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xdef456',
					transactionHashes: ['0xabc123', '0xdef456']
				},
				1_700_000_001_000
			)
		).toBe('svc-escrow-123');
	});

	it('fails closed and clears malformed or expired storage entries', () => {
		const storage = createStorage();
		storage.setItem(
			'bittasker.pending-service-contract-navigation',
			JSON.stringify({ transactionHash: '', createdAtMs: 'bad' })
		);

		expect(readPendingServiceContractNavigation(storage, 1_700_000_000_000)).toBeNull();

		storage.setItem('bittasker.pending-service-contract-navigation', '{bad json');
		expect(readPendingServiceContractNavigation(storage, 1_700_000_000_000)).toBeNull();

		writePendingServiceContractNavigation(storage, '0xabc123', 1_700_000_000_000);
		expect(readPendingServiceContractNavigation(storage, Number.NaN)).toBeNull();
		writePendingServiceContractNavigation(storage, '0xabc123', 1_700_000_000_000);
		expect(readPendingServiceContractNavigation(storage, 1_700_000_901_000, 900_000)).toBeNull();
	});

	it('clears pending navigation explicitly', () => {
		const storage = createStorage();
		writePendingServiceContractNavigation(storage, '0xabc123', 1_700_000_000_000);

		clearPendingServiceContractNavigation(storage);

		expect(readPendingServiceContractNavigation(storage, 1_700_000_000_500)).toBeNull();
	});

	it('handles missing storage and missing pending entries without side effects', () => {
		expect(writePendingServiceContractNavigation(null, '0xabc123', 1_700_000_000_000)).toBeNull();
		expect(readPendingServiceContractNavigation(null, 1_700_000_000_000)).toBeNull();
		expect(
			consumePendingServiceContractNavigation(null, {
				escrowId: 'svc-escrow-123',
				transactionHash: '0xabc123'
			})
		).toBeNull();
		expect(readPendingServiceContractNavigation(createStorage(), 1_700_000_000_000)).toBeNull();
	});

	it('matches transaction hashes defensively and requires escrow ids to consume', () => {
		const storage = createStorage();
		const pendingNavigation = writePendingServiceContractNavigation(
			storage,
			'0xabc123',
			1_700_000_000_000
		);

		expect(matchesPendingServiceContractNavigation(null, '0xabc123')).toBe(false);
		expect(matchesPendingServiceContractNavigation(pendingNavigation, undefined)).toBe(false);
		expect(
			consumePendingServiceContractNavigation(
				storage,
				{
					transactionHash: '0xabc123'
				},
				1_700_000_001_000
			)
		).toBeNull();
	});

	it('consumes pending navigation only on the service contracts dashboard route', () => {
		const storage = createStorage();
		writePendingServiceContractNavigation(storage, '0xabc123', 1_700_000_000_000);

		expect(
			consumePendingServiceContractNavigationForContractsPage(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xabc123'
				},
				{
					activeTabId: 'quotes',
					contractsContext: 'services',
					highlightEscrowId: null
				},
				1_700_000_001_000
			)
		).toBeNull();

		expect(
			consumePendingServiceContractNavigationForContractsPage(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xabc123'
				},
				{
					activeTabId: 'contracts',
					contractsContext: 'all',
					highlightEscrowId: null
				},
				1_700_000_001_000
			)
		).toBeNull();

		expect(
			consumePendingServiceContractNavigationForContractsPage(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xabc123'
				},
				{
					activeTabId: 'contracts',
					contractsContext: 'services',
					highlightEscrowId: 'already-highlighted'
				},
				1_700_000_001_000
			)
		).toBeNull();

		expect(
			consumePendingServiceContractNavigationForContractsPage(
				storage,
				{
					escrowId: 'svc-escrow-123',
					transactionHash: '0xabc123'
				},
				{
					activeTabId: 'contracts',
					contractsContext: 'services',
					highlightEscrowId: null
				},
				1_700_000_001_000
			)
		).toBe('svc-escrow-123');
	});
});
