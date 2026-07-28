import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Transaction } from '@bittasker/wallet-core';
import {
	processTransactions,
	clearContractAddressesCache
} from '$lib/utils/wallet/transactionHistory';
import { ESCROW_CONTRACT_ADDRESSES } from '$lib/utils/constants/transactions.constants';

/** Partial API-shaped txs for tests — cast where `processTransactions` expects `Transaction[]`. */
function tx(overrides: Record<string, unknown> = {}): Transaction {
	return makeTx(overrides) as unknown as Transaction;
}

/** Testnet v2 payment contract — keep in sync with `ESCROW_CONTRACT_ADDRESSES.testnet` (second entry today). */
const TESTNET_V2_ESCROW = ESCROW_CONTRACT_ADDRESSES.testnet[1];

const mockGetSwapAddress = vi.fn().mockResolvedValue(null);
const mockWeiToSatoshi = vi.fn((wei: bigint) => Number(wei) / 1e10);

vi.mock('@bittasker/wallet-core', () => ({
	getSwapAddress: () => mockGetSwapAddress(),
	weiToSatoshi: (wei: bigint) => mockWeiToSatoshi(wei),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));

const userAddress = '0xuser000000000000000000000000000000000001';
const otherAddress = '0xother000000000000000000000000000000000002';

function makeTx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		hash: '0xhash1',
		from: { hash: userAddress },
		to: { hash: otherAddress, is_contract: false },
		value: '1000000000000000000',
		timestamp: '2024-01-15T10:00:00Z',
		status: 'ok',
		fee: { type: 'maximum', value: '0' },
		...overrides
	};
}

describe('transactionHistory', () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		clearContractAddressesCache();
		vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
		mockGetSwapAddress.mockResolvedValue(null);
		mockWeiToSatoshi.mockImplementation((wei: bigint) => Number(wei) / 1e10);

		mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: async () => ({ items: [] })
		});
		global.fetch = mockFetch as unknown as typeof global.fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
	});

	describe('processTransactions', () => {
		it('should return empty array when userAddress is empty', async () => {
			const result = await processTransactions([tx()], '', 'rsk', 0);
			expect(result).toEqual([]);
		});

		it('should return empty array when userAddress is null', async () => {
			const result = await processTransactions([tx()], null as unknown as string, 'rsk', 0);
			expect(result).toEqual([]);
		});

		it('should classify simple transfer from user as send', async () => {
			const raw = [
				tx({ from: { hash: userAddress }, to: { hash: otherAddress, is_contract: false } })
			];
			const result = await processTransactions(raw, userAddress, 'rsk', 0);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('send');
			expect(result[0].displayType).toBe('send');
			expect(result[0].title).toBe('wallet.sent');
			expect(result[0].borderColor).toBe('warning');
		});

		it('should classify simple transfer to user as receive', async () => {
			const raw = [
				tx({ from: { hash: otherAddress }, to: { hash: userAddress, is_contract: false } })
			];
			const result = await processTransactions(raw, userAddress, 'rsk', 0);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('receive');
			expect(result[0].displayType).toBe('receive');
			expect(result[0].title).toBe('wallet.received');
			expect(result[0].borderColor).toBe('success');
		});

		it('should return processed transactions with placeholder balanceAfter', async () => {
			const older = tx({
				hash: '0xolder',
				from: { hash: otherAddress },
				to: { hash: userAddress, is_contract: false },
				value: '50000000000000000000',
				timestamp: '2024-01-14T10:00:00Z'
			});
			const newer = tx({
				hash: '0xnewer',
				from: { hash: userAddress },
				to: { hash: otherAddress, is_contract: false },
				value: '20000000000000000000',
				timestamp: '2024-01-15T10:00:00Z'
			});
			const result = await processTransactions([older, newer], userAddress, 'rsk', 0);
			expect(result).toHaveLength(2);
			// processTransactions no longer sorts or calculates running balance
			// that is handled by transactionLedger.applyRunningBalance()
			expect(result[0].value).toBeDefined();
			expect(result[1].value).toBeDefined();
			expect(result[0].balanceAfter).toBe(0); // Placeholder, set by ledger
		});

		it('should skip transactions with missing to or from', async () => {
			const valid = tx({ hash: '0xvalid' });
			const noTo = tx({ hash: '0xnoto', to: null });
			const noFrom = tx({ hash: '0xnofrom', from: null });
			const result = await processTransactions([valid, noTo, noFrom], userAddress, 'rsk', 0);
			expect(result).toHaveLength(1);
			expect(result[0].hash).toBe('0xvalid');
		});

		it('should return empty array when rawTransactions is empty and no internal txs', async () => {
			const result = await processTransactions([], userAddress, 'rsk', 0);
			expect(result).toEqual([]);
		});

		it('should include explorer URL for rsk network', async () => {
			const raw = [tx()];
			const result = await processTransactions(raw, userAddress, 'rsk', 0);
			expect(result).toHaveLength(1);
			expect(result[0].explorerUrl).toMatch(/blockscout\.com\/tx\//);
			expect(result[0].explorerUrl).toContain(result[0].hash);
		});

		it('should not fetch internal transactions for bsc network', async () => {
			await processTransactions([tx()], userAddress, 'bsc', 0);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should fetch internal transactions for rsk network', async () => {
			await processTransactions([tx()], userAddress, 'rsk', 0);
			expect(mockFetch).toHaveBeenCalled();
			expect(mockFetch.mock.calls[0][0]).toContain('/internal-transactions');
			expect(mockFetch.mock.calls[0][0]).toContain(userAddress);
		});

		it('should normalize status to confirmed for ok', async () => {
			const raw = [tx({ status: 'ok' })];
			const result = await processTransactions(raw, userAddress, 'rsk', 0);
			expect(result[0].status.label).toBe('wallet.transaction.status.confirmed');
		});

		it('should normalize status to pending for pending', async () => {
			const raw = [tx({ status: 'pending' })];
			const result = await processTransactions(raw, userAddress, 'rsk', 0);
			expect(result[0].status.label).toBe('wallet.transaction.status.pending');
		});

		it('should map createPaymentContract to Contract Funded (same as v1 createEscrow)', async () => {
			const v2Contract = TESTNET_V2_ESCROW;
			const raw = [
				tx({
					hash: '0xcreatev2',
					from: { hash: userAddress },
					to: { hash: v2Contract, is_contract: true },
					decoded_input: { method_call: 'createPaymentContract(uint256,address,address)' },
					value: '5000000000000000000'
				})
			];
			const result = await processTransactions(raw, userAddress, 'rsk', 0);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('contract');
			expect(result[0].displayType).toBe('send');
			expect(result[0].borderColor).toBe('warning');
			expect(result[0].title).toBe('wallet.transaction.createescrow');
		});
	});

	describe('clearContractAddressesCache', () => {
		it('should clear cache so next processTransactions refetches addresses', async () => {
			await processTransactions([tx()], userAddress, 'rsk', 0);
			const callsAfterFirst = mockGetSwapAddress.mock.calls.length;
			expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
			clearContractAddressesCache();
			await processTransactions([tx()], userAddress, 'rsk', 0);
			expect(mockGetSwapAddress.mock.calls.length).toBeGreaterThan(callsAfterFirst);
		});
	});
});
