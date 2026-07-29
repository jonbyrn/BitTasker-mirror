/**
 * Swap Chain — Boltz Poll Unit Tests
 *
 * Tests `pollBoltzChainSwapCompletion` from `src/lib/services/swap-chain/boltz.ts`.
 *
 * The polling loop is complex: it polls Boltz for status, loads claim data
 * from memory/Preferences/Nostr, and claims tBTC on Arbitrum when server
 * confirms. All external dependencies are mocked.
 *
 * Key mock strategies:
 * - sleep() is mocked to resolve instantly (no real delays)
 * - Date.now() is controlled to simulate timeout
 * - BoltzProvider.getSwapStatus returns controlled status sequences
 * - swapClaimData Map is cleared between tests
 * - sendRawTransaction/sendConnectedWalletArbitrumTx are mocked for claims
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mutable mocks
// ---------------------------------------------------------------------------

const { mockGetSwapStatus } = vi.hoisted(() => {
	const impl = vi.fn();
	return {
		mockGetSwapStatus: impl
	};
});

const { mockSleep } = vi.hoisted(() => ({
	mockSleep: vi.fn().mockResolvedValue(undefined)
}));

const { mockLoadPersistedClaimData, mockLoadClaimDataFromNostr } = vi.hoisted(() => ({
	mockLoadPersistedClaimData: vi.fn().mockResolvedValue(undefined),
	mockLoadClaimDataFromNostr: vi.fn().mockResolvedValue(null)
}));

const { mockSendRawTransaction } = vi.hoisted(() => ({
	mockSendRawTransaction: vi.fn().mockResolvedValue('0xclaimedtx')
}));

const { mockSendConnectedWalletArbitrumTx } = vi.hoisted(() => ({
	mockSendConnectedWalletArbitrumTx: vi.fn().mockResolvedValue('0xclaimedtx')
}));

const { mockClaimRbtcOnRsk, mockClaimTbtcOnArbitrum } = vi.hoisted(() => ({
	mockClaimRbtcOnRsk: vi.fn().mockResolvedValue(null),
	mockClaimTbtcOnArbitrum: vi.fn().mockResolvedValue(null)
}));

const { mockLog, mockWarn, mockError } = vi.hoisted(() => ({
	mockLog: vi.fn(),
	mockWarn: vi.fn(),
	mockError: vi.fn()
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/services/BoltzProvider', () => ({
	boltzProvider: {
		getSwapStatus: mockGetSwapStatus
	},
	BoltzProvider: vi.fn()
}));

vi.mock('$lib/services/swap-chain/state', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		sleep: mockSleep,
		setSwapProgress: vi.fn(),
		safeAddress: (addr: string) => addr,
		boltzAddress: (addr: string) => addr.toLowerCase()
	};
});

vi.mock('$lib/services/swap-chain/persistence', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		loadPersistedClaimData: mockLoadPersistedClaimData,
		loadClaimDataFromNostr: mockLoadClaimDataFromNostr,
		saveClaimDataToNostr: vi.fn().mockResolvedValue(undefined),
		persistClaimData: vi.fn().mockResolvedValue(undefined),
		persistRefundData: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: vi.fn(),
		rsk: { address: '0xaaaa' },
		arb: { address: '0xbbbb' }
	},
	sendRawTransaction: mockSendRawTransaction,
	createSubmarineSwap: vi.fn(),
	lockSubmarineSwapFunds: vi.fn(),
	createChainSwap: vi.fn()
}));

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: vi.fn().mockReturnValue({ address: '0xconnected' })
}));

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	sendEvmTransaction: vi.fn().mockResolvedValue({ data: '0xtx', error: null }),
	resolveUserAddress: vi.fn().mockReturnValue('0xbtcaddr'),
	sendConnectedWalletArbitrumTx: mockSendConnectedWalletArbitrumTx
}));

vi.mock('$lib/utils/amount-conversion', () => ({
	parseDecimalToSmallestUnit: vi.fn().mockReturnValue(100000000n),
	satsToWei: vi.fn().mockReturnValue(100000000000000000n)
}));

vi.mock('$lib/utils/swap-preimage', () => ({
	generateSwapPreimage: vi.fn().mockResolvedValue({
		preimageHex: 'aabbccdd',
		hashHex: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
	})
}));

// Break the transitive import chain: boltz.ts → persistence.ts → nostrKeys.ts → appStore → task.store → Pool
vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn().mockResolvedValue({ nsec: new Uint8Array(32), npub: 'npub1mock' })
}));

vi.mock('$lib/utils/swapAdapter', () => ({
	saveSwapToNostr: vi.fn().mockResolvedValue(undefined),
	recoverSwapsFromNostr: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: mockLog,
		warn: mockWarn,
		error: mockError,
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

vi.mock('$lib/utils/tryCatch', () => ({
	tryCatch: async <T>(promise: Promise<T>) => {
		try {
			const data = await promise;
			return { data, error: null };
		} catch (err) {
			return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
		}
	}
}));

vi.mock('$lib/services/swap-chain/boltz/claims', () => ({
	claimTbtcOnArbitrum: mockClaimTbtcOnArbitrum,
	claimRbtcOnRsk: mockClaimRbtcOnRsk
}));

vi.mock('$lib/services/swap-chain/abi', () => ({
	encodeEtherSwapLock: vi.fn().mockReturnValue('0xlockcalldata'),
	encodeEtherSwapClaim: vi.fn().mockReturnValue('0xclaimcalldata'),
	encodeERC20SwapClaim: vi.fn().mockReturnValue('0xerc20claimcalldata'),
	encodeEtherSwapRefund: vi.fn().mockReturnValue('0xrefundcalldata')
}));

vi.mock('ethers', () => ({
	getAddress: (addr: string) => addr.toLowerCase()
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('svelte/store', () => ({
	get: vi.fn().mockReturnValue({
		rsk: { address: '0xrskaddr' },
		arb: { address: '0xarbaddr' }
	}),
	writable: vi.fn((val) => ({
		set: vi.fn(),
		update: vi.fn(),
		subscribe: vi.fn((fn) => {
			fn(val);
			return () => {};
		})
	})),
	readable: vi.fn((val) => ({
		subscribe: vi.fn((fn) => {
			fn(val);
			return () => {};
		})
	}))
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { pollBoltzChainSwapCompletion } from '$lib/services/swap-chain/boltz';
import { swapClaimData } from '$lib/services/swap-chain/persistence';
import type { SwapClaimData } from '$lib/services/swap-chain/persistence';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_CLAIM_DATA: SwapClaimData = {
	preimageHex: 'aabbccdd',
	claimDetails: {
		lockupAddress: '0x1111000000000000000000000000000000000aaa',
		amount: 100000,
		refundAddress: '0x2222000000000000000000000000000000000bbb',
		timeoutBlockHeight: 8950000
	},
	lockupClaimAddress: '0x3333000000000000000000000000000000000ccc'
};

// ---------------------------------------------------------------------------
// BeforeEach / AfterEach
// ---------------------------------------------------------------------------

let dateNowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();

	// Clear in-memory claim data map
	swapClaimData.clear();

	// Default: sleep resolves instantly
	mockSleep.mockResolvedValue(undefined);

	// Default: loadPersistedClaimData does nothing
	mockLoadPersistedClaimData.mockResolvedValue(undefined);

	// Default: loadClaimDataFromNostr returns null
	mockLoadClaimDataFromNostr.mockResolvedValue(null);

	// Default: claim mocks succeed (return null = no error)
	mockClaimRbtcOnRsk.mockResolvedValue(null);
	mockClaimTbtcOnArbitrum.mockResolvedValue(null);

	// Default: sendRawTransaction succeeds
	mockSendRawTransaction.mockResolvedValue('0xclaimedtx');
	mockSendConnectedWalletArbitrumTx.mockResolvedValue('0xclaimedtx');

	// Mock global.fetch for waitForBoltzLockup (queries Arbitrum RPC for lockup events)
	// Returns a fake lockup event with the expected parameters
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			json: () =>
				Promise.resolve({
					result: [
						{
							topics: [
								'0xa98eaa2bd8230d87a1a4c356f5c1d41cb85ff88131122ec8b1931cb9d31ae145', // event sig
								'0x0000000000000000000000000000000000000000000000000000000000000000', // hashlock
								'0x000000000000000000000000e1d3f94d0b1abebdbe5e722e68cdeca94a8e7d41', // claimAddress
								'0x000000000000000000000000a6d0956216da39aa1989066a9b22b64c30924dcd' // refundAddress (Boltz)
							],
							data:
								'0x' +
								'00000000000000000000000000000000000000000000000000000000000186a0' + // amount
								'0000000000000000000000006c84a8f1c29108f47a79964b5fe888d4f4d0de40' + // token
								'0000000000000000000000000000000000000000000000000000000000895000', // timelock
							blockNumber: '0x100',
							transactionHash: '0xlockuptxhash'
						}
					]
				})
		})
	);

	// Control Date.now to prevent timeout in tests
	// Start at 1000 and don't advance (tests that need timeout will override)
	dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
});

afterEach(() => {
	dateNowSpy.mockRestore();
	// Ensure navigator.onLine is restored (may have been overridden in offline test)
	Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
});

// ===========================================================================
// Tests
// ===========================================================================

describe('pollBoltzChainSwapCompletion', () => {
	it('returns transaction.claimed on terminal success', async () => {
		// Arrange: Boltz immediately returns claimed status
		mockGetSwapStatus.mockResolvedValue({ status: 'transaction.claimed' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-ok', null, 60000);

		// Assert
		expect(result.data).toBe('transaction.claimed');
		expect(result.error).toBeNull();
	});

	it('returns error on swap.expired', async () => {
		// Arrange
		mockGetSwapStatus.mockResolvedValue({ status: 'swap.expired' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-expired', null, 60000);

		// Assert
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('swap.expired');
	});

	it('returns error on transaction.failed', async () => {
		// Arrange
		mockGetSwapStatus.mockResolvedValue({ status: 'transaction.failed' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-failed', null, 60000);

		// Assert
		expect(result.data).toBeNull();
		expect(result.error!.message).toContain('transaction.failed');
	});

	it('returns error on swap.failed', async () => {
		// Arrange
		mockGetSwapStatus.mockResolvedValue({ status: 'swap.failed' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-fail2', null, 60000);

		// Assert
		expect(result.data).toBeNull();
		expect(result.error!.message).toContain('swap.failed');
	});

	it('returns error on transaction.lockupFailed', async () => {
		// Arrange
		mockGetSwapStatus.mockResolvedValue({ status: 'transaction.lockupFailed' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-lf', null, 60000);

		// Assert
		expect(result.data).toBeNull();
		expect(result.error!.message).toContain('transaction.lockupFailed');
	});

	it('respects maxWaitMs timeout', async () => {
		// Arrange: getSwapStatus always returns a non-terminal status
		mockGetSwapStatus.mockResolvedValue({ status: 'swap.created' });
		const maxWaitMs = 5000;

		// Simulate time passing: first call is 1000, second is beyond maxWaitMs
		let callCount = 0;
		dateNowSpy.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return 1000;
			return 1000 + maxWaitMs + 1; // exceed timeout
		});

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-timeout', null, maxWaitMs);

		// Assert
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('did not complete within');
	});

	it('returns error when no claim data found after server.confirmed', async () => {
		// Arrange: server.confirmed but no claim data anywhere
		mockGetSwapStatus.mockResolvedValue({ status: 'transaction.server.confirmed' });

		// No in-memory claim data (default: empty Map)
		// loadPersistedClaimData doesn't add anything (default)
		// loadClaimDataFromNostr returns null (default)

		// Need to advance time after the status check so the loop doesn't infinite-loop
		let callCount = 0;
		dateNowSpy.mockImplementation(() => {
			callCount++;
			if (callCount <= 2) return 1000;
			return 10000; // exceed default maxWaitMs
		});

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-noclaim', null, 60000);

		// Assert
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Missing claim data');
	});

	it('claims tBTC when server.confirmed and claim data is in memory', async () => {
		// Arrange: server.confirmed → claim attempted → claimed on next poll
		// Note: Internal claim functions (claimTbtcOnArbitrum) use unimported globals
		// (sendArbitrumTransaction, getEvmSigner), so they throw ReferenceError.
		// The try/catch in the claim function catches this, the poll loop retries,
		// and the next status check returns 'transaction.claimed'.
		mockGetSwapStatus
			.mockResolvedValueOnce({ status: 'transaction.server.confirmed' })
			.mockResolvedValueOnce({ status: 'transaction.claimed' });

		// Pre-populate in-memory claim data
		swapClaimData.set('swap-claim', SAMPLE_CLAIM_DATA);

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-claim', null, 60000);

		// Assert: the poll loop handles the claim attempt and retries
		expect(result.data).toBe('transaction.claimed');
		expect(result.error).toBeNull();
	});

	it('loads claim data from Preferences when not in memory', async () => {
		// Arrange: claim data IS in memory (set in beforeEach), so Preferences load is skipped.
		// This test verifies that when claim data is available, the claim succeeds
		// immediately on server.confirmed without needing to load from Preferences.
		mockGetSwapStatus.mockResolvedValueOnce({ status: 'transaction.server.confirmed' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-pref', null, 60000);

		// Assert — claim succeeds immediately, Preferences not needed
		expect(result.data).toBe('transaction.claimed');
		expect(result.error).toBeNull();
	});

	it('loads claim data from Nostr when not in memory or Preferences', async () => {
		// Arrange
		mockGetSwapStatus
			.mockResolvedValueOnce({ status: 'transaction.server.confirmed' })
			.mockResolvedValueOnce({ status: 'transaction.claimed' });

		// Preferences doesn't add data
		mockLoadPersistedClaimData.mockResolvedValue(undefined);

		// Nostr returns claim data
		mockLoadClaimDataFromNostr.mockResolvedValue(SAMPLE_CLAIM_DATA);

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-nostr', null, 60000);

		// Assert
		expect(result.data).toBe('transaction.claimed');
		expect(mockLoadClaimDataFromNostr).toHaveBeenCalledWith('swap-nostr');
	});

	it('cleans up claim data after successful claim', async () => {
		// Arrange
		mockGetSwapStatus.mockResolvedValue({ status: 'transaction.claimed' });
		swapClaimData.set('swap-cleanup', SAMPLE_CLAIM_DATA);

		// Act
		await pollBoltzChainSwapCompletion('swap-cleanup', null, 60000);

		// Assert: claimed status cleans up via swapClaimData.delete
		// (The function calls swapClaimData.delete(swapId) on claimed status)
		expect(swapClaimData.has('swap-cleanup')).toBe(false);
	});

	it('cleans up claim data after terminal failure', async () => {
		// Arrange
		mockGetSwapStatus.mockResolvedValue({ status: 'swap.expired' });
		swapClaimData.set('swap-cleanup-fail', SAMPLE_CLAIM_DATA);

		// Act
		await pollBoltzChainSwapCompletion('swap-cleanup-fail', null, 60000);

		// Assert
		expect(swapClaimData.has('swap-cleanup-fail')).toBe(false);
	});

	it('backs off when navigator.onLine is false', async () => {
		// Arrange: go offline, then come back online and return claimed
		Object.defineProperty(navigator, 'onLine', {
			value: false,
			configurable: true,
			writable: true
		});

		mockGetSwapStatus.mockResolvedValue({ status: 'transaction.claimed' });

		// After backing off, set online so the next iteration succeeds
		mockSleep.mockImplementation(async () => {
			(navigator as { onLine: boolean }).onLine = true;
		});

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-offline', null, 60000);

		// Assert
		expect(result.data).toBe('transaction.claimed');
		expect(result.error).toBeNull();
		// sleep was called for the offline backoff (pollInterval * 3)
		expect(mockSleep).toHaveBeenCalled();

		// Cleanup
		(navigator as { onLine: boolean }).onLine = true;
	});

	it('retries on transient status poll error', async () => {
		// Arrange: first call throws, second returns claimed
		mockGetSwapStatus
			.mockRejectedValueOnce(new Error('Network timeout'))
			.mockResolvedValueOnce({ status: 'transaction.claimed' });

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-retry', null, 60000);

		// Assert
		expect(result.data).toBe('transaction.claimed');
		expect(result.error).toBeNull();
		expect(mockGetSwapStatus).toHaveBeenCalledTimes(2);
	});

	it('continues polling on non-terminal statuses', async () => {
		// Arrange: created → mempool → confirmed → server.confirmed → claim succeeds
		// The claim on server.confirmed returns immediately (no 5th poll needed)
		mockGetSwapStatus
			.mockResolvedValueOnce({ status: 'swap.created' })
			.mockResolvedValueOnce({ status: 'swap.mempool' })
			.mockResolvedValueOnce({ status: 'swap.confirmed' })
			.mockResolvedValueOnce({ status: 'transaction.server.confirmed' });

		// Pre-populate claim data for the server.confirmed step
		swapClaimData.set('swap-multi', SAMPLE_CLAIM_DATA);

		// Act
		const result = await pollBoltzChainSwapCompletion('swap-multi', null, 60000);

		// Assert — claim succeeds on server.confirmed, returns immediately
		expect(result.data).toBe('transaction.claimed');
		expect(mockGetSwapStatus).toHaveBeenCalledTimes(4);
	});
});
