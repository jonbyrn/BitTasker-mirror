/**
 * Swap Chain — Persistence Unit Tests
 *
 * Tests the persistence functions from `src/lib/services/swap-chain/persistence.ts`:
 * - loadPersistedClaimData / persistClaimData (Capacitor Preferences)
 * - loadPersistedRefundData / persistRefundData (Capacitor Preferences)
 * - saveClaimDataToNostr / loadClaimDataFromNostr (Nostr NIP-44)
 *
 * All external dependencies are mocked — no real storage or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mutable mocks — shared between vi.mock factories and test assertions
// ---------------------------------------------------------------------------

const { mockPreferencesGet, mockPreferencesSet, mockPreferencesRemove } = vi.hoisted(() => ({
	mockPreferencesGet: vi.fn(),
	mockPreferencesSet: vi.fn(),
	mockPreferencesRemove: vi.fn()
}));

const { mockGetNostrKeyPair } = vi.hoisted(() => ({
	mockGetNostrKeyPair: vi.fn()
}));

const { mockSaveSwapToNostr, mockRecoverSwapsFromNostr } = vi.hoisted(() => ({
	mockSaveSwapToNostr: vi.fn(),
	mockRecoverSwapsFromNostr: vi.fn()
}));

const { mockLog, mockWarn, mockError } = vi.hoisted(() => ({
	mockLog: vi.fn(),
	mockWarn: vi.fn(),
	mockError: vi.fn()
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: mockPreferencesGet,
		set: mockPreferencesSet,
		remove: mockPreferencesRemove
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: mockLog,
		warn: mockWarn,
		error: mockError,
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: mockGetNostrKeyPair
}));

vi.mock('$lib/utils/swapAdapter', () => ({
	saveSwapToNostr: mockSaveSwapToNostr,
	recoverSwapsFromNostr: mockRecoverSwapsFromNostr
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import {
	swapClaimData,
	swapRefundData,
	loadPersistedClaimData,
	persistClaimData,
	loadPersistedRefundData,
	persistRefundData,
	saveClaimDataToNostr,
	loadClaimDataFromNostr
} from '$lib/services/swap-chain/persistence';
import type { SwapClaimData, SwapRefundData } from '$lib/services/swap-chain/persistence';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_CLAIM_DATA: SwapClaimData = {
	preimageHex: 'aabbccdd1234567890abcdef',
	claimDetails: {
		lockupAddress: '0x1111000000000000000000000000000000000aaa',
		amount: 100000,
		refundAddress: '0x2222000000000000000000000000000000000bbb',
		timeoutBlockHeight: 8950000
	},
	lockupClaimAddress: '0x3333000000000000000000000000000000000ccc'
};

const SAMPLE_REFUND_DATA: SwapRefundData = {
	preimageHash: 'deadbeef1234567890',
	lockupAddress: '0x4444000000000000000000000000000000000ddd',
	timeoutBlockHeight: 8950100,
	claimAddress: '0x5555000000000000000000000000000000000eee'
};

// ---------------------------------------------------------------------------
// BeforeEach — reset all mock state and clear in-memory Maps
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();

	// Clear in-memory Maps between tests
	swapClaimData.clear();
	swapRefundData.clear();

	// Default: Preferences.get returns empty (no persisted data)
	mockPreferencesGet.mockResolvedValue({ value: null });
	mockPreferencesSet.mockResolvedValue(undefined);
	mockPreferencesRemove.mockResolvedValue(undefined);

	// Default: Nostr key pair returns null (no keys configured)
	mockGetNostrKeyPair.mockResolvedValue(null);

	// Default: swap adapter functions succeed
	mockSaveSwapToNostr.mockResolvedValue(undefined);
	mockRecoverSwapsFromNostr.mockResolvedValue([]);
});

// ===========================================================================
// Tests
// ===========================================================================

describe('loadPersistedClaimData', () => {
	it('returns empty Map when no data is persisted', async () => {
		// Arrange: Preferences.get returns null (default)

		// Act
		await loadPersistedClaimData();

		// Assert
		expect(swapClaimData.size).toBe(0);
	});

	it('populates Map with valid JSON from Preferences', async () => {
		// Arrange
		const persisted = { 'swap-123': SAMPLE_CLAIM_DATA };
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify(persisted) });

		// Act
		await loadPersistedClaimData();

		// Assert
		expect(swapClaimData.size).toBe(1);
		expect(swapClaimData.get('swap-123')).toEqual(SAMPLE_CLAIM_DATA);
	});

	it('handles corrupt JSON gracefully without throwing', async () => {
		// Arrange: return malformed JSON
		mockPreferencesGet.mockResolvedValueOnce({ value: '{invalid json!!' });

		// Act & Assert: must not throw
		await expect(loadPersistedClaimData()).resolves.toBeUndefined();
		expect(swapClaimData.size).toBe(0);
	});

	it('does not overwrite existing in-memory entries', async () => {
		// Arrange: pre-populate in-memory Map with existing data
		swapClaimData.set('existing-swap', SAMPLE_CLAIM_DATA);
		const newData: SwapClaimData = {
			...SAMPLE_CLAIM_DATA,
			preimageHex: 'newdata999'
		};
		const persisted = { 'existing-swap': newData, 'new-swap': newData };
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify(persisted) });

		// Act
		await loadPersistedClaimData();

		// Assert: existing entry is NOT overwritten
		expect(swapClaimData.get('existing-swap')?.preimageHex).toBe('aabbccdd1234567890abcdef');
		// New entry IS added
		expect(swapClaimData.get('new-swap')?.preimageHex).toBe('newdata999');
		expect(swapClaimData.size).toBe(2);
	});
});

describe('persistClaimData', () => {
	it('serializes Map to Preferences.set with correct key', async () => {
		// Arrange
		swapClaimData.set('swap-456', SAMPLE_CLAIM_DATA);

		// Act
		await persistClaimData();

		// Assert
		expect(mockPreferencesSet).toHaveBeenCalledTimes(1);
		const call = mockPreferencesSet.mock.calls[0][0] as { key: string; value: string };
		expect(call.key).toBe('bittasker_swap_claim_data');
		const parsed = JSON.parse(call.value) as Record<string, SwapClaimData>;
		expect(parsed['swap-456']).toEqual(SAMPLE_CLAIM_DATA);
	});

	it('handles Preferences.set failure gracefully without throwing', async () => {
		// Arrange
		swapClaimData.set('swap-789', SAMPLE_CLAIM_DATA);
		mockPreferencesSet.mockRejectedValueOnce(new Error('Storage full'));

		// Act & Assert: must not throw
		await expect(persistClaimData()).resolves.toBeUndefined();
	});
});

describe('loadPersistedRefundData', () => {
	it('returns empty Map when no data is persisted', async () => {
		// Arrange: Preferences.get returns null (default)

		// Act
		await loadPersistedRefundData();

		// Assert
		expect(swapRefundData.size).toBe(0);
	});

	it('populates Map with valid JSON from Preferences', async () => {
		// Arrange
		const persisted = { 'refund-swap-1': SAMPLE_REFUND_DATA };
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify(persisted) });

		// Act
		await loadPersistedRefundData();

		// Assert
		expect(swapRefundData.size).toBe(1);
		expect(swapRefundData.get('refund-swap-1')).toEqual(SAMPLE_REFUND_DATA);
	});

	it('handles corrupt JSON gracefully without throwing', async () => {
		// Arrange: return malformed JSON
		mockPreferencesGet.mockResolvedValueOnce({ value: 'not-json-at-all' });

		// Act & Assert: must not throw
		await expect(loadPersistedRefundData()).resolves.toBeUndefined();
		expect(swapRefundData.size).toBe(0);
	});
});

describe('persistRefundData', () => {
	it('serializes Map to Preferences.set with correct key', async () => {
		// Arrange
		swapRefundData.set('refund-swap-2', SAMPLE_REFUND_DATA);

		// Act
		await persistRefundData();

		// Assert
		expect(mockPreferencesSet).toHaveBeenCalledTimes(1);
		const call = mockPreferencesSet.mock.calls[0][0] as { key: string; value: string };
		expect(call.key).toBe('bittasker_swap_refund_data');
		const parsed = JSON.parse(call.value) as Record<string, SwapRefundData>;
		expect(parsed['refund-swap-2']).toEqual(SAMPLE_REFUND_DATA);
	});

	it('handles Preferences.set failure gracefully without throwing', async () => {
		// Arrange
		swapRefundData.set('refund-swap-3', SAMPLE_REFUND_DATA);
		mockPreferencesSet.mockRejectedValueOnce(new Error('Quota exceeded'));

		// Act & Assert: must not throw
		await expect(persistRefundData()).resolves.toBeUndefined();
	});
});

describe('saveClaimDataToNostr', () => {
	it('builds correct swap record and calls saveSwapToNostr', async () => {
		// Arrange
		const fakeNsec = new Uint8Array([1, 2, 3]);
		mockGetNostrKeyPair.mockResolvedValueOnce({ nsec: fakeNsec, npub: 'npub1test' });

		// Act
		await saveClaimDataToNostr('swap-nostr-1', SAMPLE_CLAIM_DATA);

		// Assert
		expect(mockGetNostrKeyPair).toHaveBeenCalledTimes(1);
		expect(mockSaveSwapToNostr).toHaveBeenCalledTimes(1);
		const swapRecord = mockSaveSwapToNostr.mock.calls[0][0] as Record<string, unknown>;
		expect(swapRecord.id).toBe('swap-nostr-1');
		expect(swapRecord.type).toBe('chain');
		expect(swapRecord.preimage).toBe(SAMPLE_CLAIM_DATA.preimageHex);
		expect(swapRecord.claimDetails).toEqual(SAMPLE_CLAIM_DATA.claimDetails);
		expect(swapRecord.lockupClaimAddress).toBe(SAMPLE_CLAIM_DATA.lockupClaimAddress);
		// Second arg is nsec, third is tag
		expect(mockSaveSwapToNostr.mock.calls[0][1]).toBe(fakeNsec);
		expect(mockSaveSwapToNostr.mock.calls[0][2]).toBe('bittasker-swap-chain');
	});

	it('handles missing Nostr keys gracefully', async () => {
		// Arrange: getNostrKeyPair returns null (default)
		mockGetNostrKeyPair.mockResolvedValueOnce(null);

		// Act & Assert: must not throw
		await expect(saveClaimDataToNostr('swap-nokeys', SAMPLE_CLAIM_DATA)).resolves.toBeUndefined();
	});

	it('handles saveSwapToNostr failure gracefully', async () => {
		// Arrange
		mockGetNostrKeyPair.mockResolvedValueOnce({ nsec: new Uint8Array([1]), npub: 'npub1test' });
		mockSaveSwapToNostr.mockRejectedValueOnce(new Error('Relay connection failed'));

		// Act & Assert: must not throw
		await expect(saveClaimDataToNostr('swap-fail', SAMPLE_CLAIM_DATA)).resolves.toBeUndefined();
	});
});

describe('loadClaimDataFromNostr', () => {
	it('returns claim data when swap is found in Nostr', async () => {
		// Arrange
		const fakeNsec = new Uint8Array([1, 2, 3]);
		mockGetNostrKeyPair.mockResolvedValueOnce({ nsec: fakeNsec, npub: 'npub1test' });
		mockRecoverSwapsFromNostr.mockResolvedValueOnce([
			{
				id: 'swap-target',
				preimage: 'aabbccdd',
				claimDetails: SAMPLE_CLAIM_DATA.claimDetails,
				lockupClaimAddress: SAMPLE_CLAIM_DATA.lockupClaimAddress
			},
			{
				id: 'swap-other',
				preimage: 'eeff0011'
			}
		]);

		// Act
		const result = await loadClaimDataFromNostr('swap-target');

		// Assert
		expect(result).not.toBeNull();
		expect(result?.preimageHex).toBe('aabbccdd');
		expect(result?.claimDetails).toEqual(SAMPLE_CLAIM_DATA.claimDetails);
		expect(result?.lockupClaimAddress).toBe(SAMPLE_CLAIM_DATA.lockupClaimAddress);
	});

	it('returns null when swap ID is not found', async () => {
		// Arrange
		mockGetNostrKeyPair.mockResolvedValueOnce({ nsec: new Uint8Array([1]), npub: 'npub1test' });
		mockRecoverSwapsFromNostr.mockResolvedValueOnce([{ id: 'swap-other', preimage: 'eeff0011' }]);

		// Act
		const result = await loadClaimDataFromNostr('swap-missing');

		// Assert
		expect(result).toBeNull();
	});

	it('returns null when Nostr recovery fails', async () => {
		// Arrange
		mockGetNostrKeyPair.mockResolvedValueOnce({ nsec: new Uint8Array([1]), npub: 'npub1test' });
		mockRecoverSwapsFromNostr.mockRejectedValueOnce(new Error('No relays available'));

		// Act
		const result = await loadClaimDataFromNostr('swap-err');

		// Assert
		expect(result).toBeNull();
	});

	it('returns null when no Nostr keys are configured', async () => {
		// Arrange: getNostrKeyPair returns null (default)

		// Act
		const result = await loadClaimDataFromNostr('swap-nokeys');

		// Assert
		expect(result).toBeNull();
	});
});
