/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	processTransactions,
	clearContractAddressesCache
} from '$lib/utils/wallet/transactionHistory';

const mockGetSwapAddress = vi.fn().mockResolvedValue(null);
const mockWeiToSatoshi = vi.fn((wei: bigint) => Number(wei) / 1e10);

vi.mock('@bittasker/wallet-core', () => ({
	getSwapAddress: () => mockGetSwapAddress(),
	weiToSatoshi: (wei: bigint) => mockWeiToSatoshi(wei)
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
			json: async () => ({ items: [] })
		});
		global.fetch = mockFetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		global.fetch = originalFetch;
	});

	describe('processTransactions', () => {
		it('should return empty array when userAddress is empty', async () => {
			const result = await processTransactions([makeTx() as any], '', 'rsk', 100_000);
			expect(result).toEqual([]);
		});

		it('should return empty array when userAddress is null', async () => {
			const result = await processTransactions([makeTx() as any], null as any, 'rsk', 100_000);
			expect(result).toEqual([]);
		});

		it('should classify simple transfer from user as send', async () => {
			const raw = [
				makeTx({ from: { hash: userAddress }, to: { hash: otherAddress, is_contract: false } })
			];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 100_000);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('send');
			expect(result[0].displayType).toBe('send');
			expect(result[0].title).toBe('wallet.sent');
			expect(result[0].borderColor).toBe('warning');
		});

		it('should classify simple transfer to user as receive', async () => {
			const raw = [
				makeTx({ from: { hash: otherAddress }, to: { hash: userAddress, is_contract: false } })
			];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 100_000);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('receive');
			expect(result[0].displayType).toBe('receive');
			expect(result[0].title).toBe('wallet.received');
			expect(result[0].borderColor).toBe('success');
		});

		it('should set running balance with newest transaction first', async () => {
			const older = makeTx({
				hash: '0xolder',
				from: { hash: otherAddress },
				to: { hash: userAddress, is_contract: false },
				value: '50000000000000000000',
				timestamp: '2024-01-14T10:00:00Z'
			});
			const newer = makeTx({
				hash: '0xnewer',
				from: { hash: userAddress },
				to: { hash: otherAddress, is_contract: false },
				value: '20000000000000000000',
				timestamp: '2024-01-15T10:00:00Z'
			});
			const result = await processTransactions([older, newer] as any, userAddress, 'rsk', 100_000);
			expect(result).toHaveLength(2);
			const newestFirst = result[0].timestamp >= result[1].timestamp;
			expect(newestFirst).toBe(true);
			expect(result[0].balanceAfter).toBe(100_000);
			expect(result[0].value).toBeDefined();
			expect(result[1].balanceAfter).toBeDefined();
		});

		it('should skip transactions with missing to or from', async () => {
			const valid = makeTx({ hash: '0xvalid' });
			const noTo = makeTx({ hash: '0xnoto', to: null });
			const noFrom = makeTx({ hash: '0xnofrom', from: null });
			const result = await processTransactions(
				[valid, noTo, noFrom] as any,
				userAddress,
				'rsk',
				100_000
			);
			expect(result).toHaveLength(1);
			expect(result[0].hash).toBe('0xvalid');
		});

		it('should return empty array when rawTransactions is empty and no internal txs', async () => {
			const result = await processTransactions([], userAddress, 'rsk', 0);
			expect(result).toEqual([]);
		});

		it('should include explorer URL for rsk network', async () => {
			const raw = [makeTx()];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 0);
			expect(result).toHaveLength(1);
			expect(result[0].explorerUrl).toMatch(/blockscout\.com\/tx\//);
			expect(result[0].explorerUrl).toContain(result[0].hash);
		});

		it('should not fetch internal transactions for bsc network', async () => {
			await processTransactions([makeTx() as any], userAddress, 'bsc', 0);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should fetch internal transactions for rsk network', async () => {
			await processTransactions([makeTx() as any], userAddress, 'rsk', 0);
			expect(mockFetch).toHaveBeenCalled();
			expect(mockFetch.mock.calls[0][0]).toContain('/internal-transactions');
			expect(mockFetch.mock.calls[0][0]).toContain(userAddress);
		});

		it('should normalize status to confirmed for ok', async () => {
			const raw = [makeTx({ status: 'ok' })];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 0);
			expect(result[0].status.label).toBe('wallet.transaction.status.confirmed');
		});

		it('should normalize status to pending for pending', async () => {
			const raw = [makeTx({ status: 'pending' })];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 0);
			expect(result[0].status.label).toBe('wallet.transaction.status.pending');
		});

		it('should derive BSC USDT amount and fee from token transfers', async () => {
			const raw = [
				makeTx({
					hash: '0xbscsend',
					value: '0',
					token_transfers: [
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '1000000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						},
						{
							from: { hash: userAddress },
							to: { hash: '0xtreasury0000000000000000000000000000000003' },
							total: { value: '25000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					],
					fee: { type: 'actual', value: '123456789' }
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 100);

			expect(result).toHaveLength(1);
			expect(result[0].value).toBe('1');
			expect(result[0].amountUnit).toBe('USDT');
			expect(result[0].feeSats).toBe(0.025);
			expect(result[0].feeUnit).toBe('USDT');
			expect(result[0].balanceAfter).toBe(100);
			expect(result[0].balanceUnit).toBe('USDT');
			expect(result[0].tokenSymbol).toBe('USDT');
			expect(result[0].tokenDecimals).toBe(6);
		});
	});

	describe('clearContractAddressesCache', () => {
		it('should clear cache so next processTransactions refetches addresses', async () => {
			await processTransactions([makeTx() as any], userAddress, 'rsk', 0);
			const callsAfterFirst = mockGetSwapAddress.mock.calls.length;
			expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
			clearContractAddressesCache();
			await processTransactions([makeTx() as any], userAddress, 'rsk', 0);
			expect(mockGetSwapAddress.mock.calls.length).toBeGreaterThan(callsAfterFirst);
		});
	});

	describe('BSC-specific transaction rendering', () => {
		it('should render USDT amounts in token units (6 decimals) not sats', async () => {
			const raw = [
				makeTx({
					hash: '0xbscusdt',
					value: '0',
					token_transfers: [
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '1000000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					],
					fee: { type: 'actual', value: '50000' }
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 100);

			expect(result[0].amountUnit).toBe('USDT');
			expect(result[0].value).toBe('1');
			expect(result[0].tokenDecimals).toBe(6);
		});

		it('should generate BSCscan explorer links for mainnet transactions', async () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			const raw = [makeTx({ hash: '0xbscmainnet' })];
			const result = await processTransactions(raw as any, userAddress, 'bsc', 0);

			expect(result[0].explorerUrl).toMatch(/bscscan\.com\/tx\//);
			expect(result[0].explorerUrl).toContain('0xbscmainnet');
			vi.unstubAllEnvs();
		});

		it('should generate BSCscan testnet explorer links', async () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
			const raw = [makeTx({ hash: '0xbsctestnet' })];
			const result = await processTransactions(raw as any, userAddress, 'bsc', 0);

			expect(result[0].explorerUrl).toMatch(/testnet\.bscscan\.com\/tx\//);
			expect(result[0].explorerUrl).toContain('0xbsctestnet');
			vi.unstubAllEnvs();
		});

		it('should display network badge for BSC transactions', async () => {
			const raw = [makeTx()];
			const result = await processTransactions(raw as any, userAddress, 'bsc', 0);

			expect(result[0]).toHaveProperty('network');
			expect(result[0].network).toBe('bsc');
		});

		it('should calculate fee in USDT for BSC USDT transfers', async () => {
			const raw = [
				makeTx({
					token_transfers: [
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '1000000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					],
					fee: { type: 'actual', value: '10000' }
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 0);

			expect(result[0].feeUnit).toBe('USDT');
			expect(result[0].feeSats).toBe(0);
		});

		it('should filter transactions by network context', async () => {
			const raw = [
				makeTx({ hash: '0x1', value: '1000000000000000000' }),
				makeTx({ hash: '0x2', value: '500000000000000000' })
			];

			const bscResult = await processTransactions(raw as any, userAddress, 'bsc', 100);
			const rskResult = await processTransactions(raw as any, userAddress, 'rsk', 100);

			// Both should process, but network context differs
			expect(bscResult.length).toBe(2);
			expect(rskResult.length).toBe(2);
			bscResult.forEach((tx) => expect(tx.network).toBe('bsc'));
			rskResult.forEach((tx) => expect(tx.network).toBe('rsk'));
		});

		it('should handle USDT balance tracking across transactions', async () => {
			const raw = [
				makeTx({
					hash: '0xtx1',
					from: { hash: otherAddress },
					to: { hash: userAddress, is_contract: false },
					token_transfers: [
						{
							from: { hash: otherAddress },
							to: { hash: userAddress },
							total: { value: '100000000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					]
				}),
				makeTx({
					hash: '0xtx2',
					from: { hash: userAddress },
					to: { hash: otherAddress, is_contract: false },
					token_transfers: [
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '50000000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					]
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 100);

			expect(result.length).toBe(2);
			expect(result[0].balanceUnit).toBe('USDT');
			expect(result[1].balanceUnit).toBe('USDT');
		});

		it('should separate USDT transfers from other tokens on BSC', async () => {
			const raw = [
				makeTx({
					hash: '0xmultitoken',
					value: '0',
					token_transfers: [
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '1000000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						},
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '1000000000000000000', decimals: '18' },
							token: { symbol: 'BNB', decimals: '18' }
						}
					],
					fee: { type: 'actual', value: '100000' }
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 100);

			expect(result[0].tokenSymbol).toBe('USDT');
			expect(result[0].amountUnit).toBe('USDT');
		});
	});

	describe('Network-specific explorer links', () => {
		it('should use Blockscout for RSK mainnet', async () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			const raw = [makeTx({ hash: '0xrskprod' })];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 0);

			expect(result[0].explorerUrl).toMatch(/blockscout\.com\/tx\//);
			vi.unstubAllEnvs();
		});

		it('should use Blockscout testnet for RSK testnet', async () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
			const raw = [makeTx({ hash: '0xrsktestnet' })];
			const result = await processTransactions(raw as any, userAddress, 'rsk', 0);

			expect(result[0].explorerUrl).toContain('blockscout');
			expect(result[0].explorerUrl).toContain('0xrsktestnet');
			vi.unstubAllEnvs();
		});
	});

	describe('Transaction classification and formatting', () => {
		it('should classify USDT send correctly', async () => {
			const raw = [
				makeTx({
					from: { hash: userAddress },
					to: { hash: otherAddress, is_contract: false },
					token_transfers: [
						{
							from: { hash: userAddress },
							to: { hash: otherAddress },
							total: { value: '500000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					]
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 0);

			expect(result[0].type).toBe('send');
			expect(result[0].displayType).toBe('send');
		});

		it('should classify USDT receive correctly', async () => {
			const raw = [
				makeTx({
					from: { hash: otherAddress },
					to: { hash: userAddress, is_contract: false },
					token_transfers: [
						{
							from: { hash: otherAddress },
							to: { hash: userAddress },
							total: { value: '250000', decimals: '6' },
							token: { symbol: 'USDT', decimals: '6' }
						}
					]
				})
			];

			const result = await processTransactions(raw as any, userAddress, 'bsc', 0);

			expect(result[0].type).toBe('receive');
			expect(result[0].displayType).toBe('receive');
		});
	});
});
