/**
 * Unit tests for connected-wallet-transactions.ts
 *
 * Tests the Blockscout API fetcher for connected wallet transactions
 * across RSK and Arbitrum networks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	fetchAllConnectedWalletTransactions,
	fetchConnectedWalletTransactionsForWallet,
	type ConnectedWalletInfo
} from '$lib/services/connected-wallet-transactions';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/utils/wallet/explorerProxy', () => ({
	getBlockscoutApiUrl: () => 'https://test-rsk.blockscout.com/api/v2'
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WALLET_A: ConnectedWalletInfo = {
	id: 'metamask-1',
	walletName: 'MetaMask',
	walletType: 'metamask',
	address: '0xUserAAAA0000000000000000000000000000aa'
};

const WALLET_B: ConnectedWalletInfo = {
	id: 'ledger-1',
	walletName: 'Ledger',
	walletType: 'ledger',
	address: '0xUserBBBB0000000000000000000000000000bb'
};

function makeBlockscoutTx(overrides: Record<string, unknown> = {}) {
	return {
		hash: '0xTxHash1234567890abcdef1234567890abcdef',
		from: { hash: WALLET_A.address.toLowerCase() },
		to: { hash: '0xRecipient1111111111111111111111111111' },
		value: '1000000000000000000', // 1 RBTC = 10^10 sats
		gas_used: '21000',
		gas_price: '60000000', // 60 gwei
		block_number: 12345,
		timestamp: '2026-06-12T10:00:00Z',
		status: 'ok',
		method: undefined,
		decoded_input: null,
		...overrides
	};
}

function makeBlockscoutResponse(txs: unknown[] = [makeBlockscoutTx()]) {
	return { items: txs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connected-wallet-transactions', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	// =========================================================================
	// fetchAllConnectedWalletTransactions
	// =========================================================================

	describe('fetchAllConnectedWalletTransactions', () => {
		it('returns empty array for empty wallets', async () => {
			const result = await fetchAllConnectedWalletTransactions([]);
			expect(result).toEqual([]);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('fetches from RSK and Arbitrum for each wallet', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeBlockscoutResponse([]))
			});

			await fetchAllConnectedWalletTransactions([WALLET_A]);

			// Should call fetch 3 times: RSK native, Arbitrum native, Arbitrum token transfers
			// (RSK token transfers are skipped — only Arbitrum has known ERC-20 tokens)
			expect(mockFetch).toHaveBeenCalledTimes(3);
			const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
			expect(urls.some((u: string) => u.includes('test-rsk.blockscout'))).toBe(true);
			expect(urls.some((u: string) => u.includes('arbitrum.blockscout'))).toBe(true);
			expect(urls.some((u: string) => u.includes('token-transfers'))).toBe(true);
		});

		it('merges and sorts transactions by timestamp descending', async () => {
			const tx1 = makeBlockscoutTx({
				hash: '0xTx1',
				timestamp: '2026-06-10T10:00:00Z',
				from: { hash: WALLET_A.address.toLowerCase() }
			});
			const tx2 = makeBlockscoutTx({
				hash: '0xTx2',
				timestamp: '2026-06-12T10:00:00Z',
				from: { hash: WALLET_A.address.toLowerCase() }
			});

			// RSK native, Arbitrum native, Arbitrum token transfers
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx1]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx2]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ items: [] })
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toHaveLength(2);
			expect(result[0].hash).toBe('0xTx2'); // newest first
			expect(result[1].hash).toBe('0xTx1');
		});

		it('deduplicates transactions by hash', async () => {
			const tx = makeBlockscoutTx({ hash: '0xSameHash' });

			// Both RSK and Arbitrum return the same tx
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toHaveLength(1);
			expect(result[0].hash).toBe('0xSameHash');
		});

		it('returns results from one network when the other fails', async () => {
			const tx = makeBlockscoutTx({ hash: '0xRskTx' });

			// RSK succeeds, Arbitrum fails
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toHaveLength(1);
			expect(result[0].hash).toBe('0xRskTx');
		});

		it('returns empty array when all fetches fail', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'));

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toEqual([]);
		});

		it('fetches for multiple wallets in parallel', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeBlockscoutResponse([]))
			});

			await fetchAllConnectedWalletTransactions([WALLET_A, WALLET_B]);

			// 2 wallets × 3 fetches (RSK native + Arbitrum native + Arbitrum token-transfers) = 6
			expect(mockFetch).toHaveBeenCalledTimes(6);
		});
	});

	// =========================================================================
	// fetchConnectedWalletTransactionsForWallet
	// =========================================================================

	describe('fetchConnectedWalletTransactionsForWallet', () => {
		it('fetches from both networks for a single wallet', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeBlockscoutResponse([]))
			});

			await fetchConnectedWalletTransactionsForWallet(WALLET_A);

			// RSK native + Arbitrum native + Arbitrum token-transfers = 3
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('merges and sorts results from both networks', async () => {
			const rskTx = makeBlockscoutTx({
				hash: '0xRskTx',
				timestamp: '2026-06-10T10:00:00Z'
			});
			const arbTx = makeBlockscoutTx({
				hash: '0xArbTx',
				timestamp: '2026-06-12T10:00:00Z'
			});

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([rskTx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([arbTx]))
				});

			const result = await fetchConnectedWalletTransactionsForWallet(WALLET_A);

			expect(result).toHaveLength(2);
			expect(result[0].hash).toBe('0xArbTx'); // newest first
		});
	});

	// =========================================================================
	// Transaction mapping
	// =========================================================================

	describe('Transaction mapping', () => {
		it('detects send type when from matches user address', async () => {
			const tx = makeBlockscoutTx({
				from: { hash: WALLET_A.address.toLowerCase() },
				to: { hash: '0xsomeoneelse' }
			});

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].type).toBe('send');
		});

		it('detects receive type when from does not match user address', async () => {
			const tx = makeBlockscoutTx({
				from: { hash: '0xsomeoneelse' },
				to: { hash: WALLET_A.address.toLowerCase() }
			});

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].type).toBe('receive');
		});

		it('converts wei to sats correctly', async () => {
			const tx = makeBlockscoutTx({
				value: '5000000000000000000' // 5 RBTC = 500_000_000 sats
			});

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].valueSats).toBe(500_000_000);
		});

		it('calculates fee correctly', async () => {
			// gas_used=21000, gas_price=60000000 (60 gwei)
			// fee_wei = 21000 * 60000000 = 1260000000000
			// fee_sats = 1260000000000 / 10^10 = 126 sats
			const tx = makeBlockscoutTx({
				gas_used: '21000',
				gas_price: '60000000'
			});

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].feeSats).toBe(126);
		});

		it('maps status ok to success', async () => {
			const tx = makeBlockscoutTx({ status: 'ok' });

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].status).toBe('success');
		});

		it('maps status error to failed', async () => {
			const tx = makeBlockscoutTx({ status: 'error' });

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].status).toBe('failed');
		});

		it('maps unknown status to pending', async () => {
			const tx = makeBlockscoutTx({ status: 'pending' });

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].status).toBe('pending');
		});

		it('generates correct explorer URL for RSK', async () => {
			const tx = makeBlockscoutTx({ hash: '0xTestHash' });

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			const rskTx = result.find((t) => t.network === 'rsk');
			expect(rskTx?.explorerUrl).toContain('blockscout.com');
			expect(rskTx?.explorerUrl).toContain('0xTestHash');
		});

		it('populates wallet metadata correctly', async () => {
			const tx = makeBlockscoutTx();

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].walletId).toBe('metamask-1');
			expect(result[0].walletName).toBe('MetaMask');
			expect(result[0].walletType).toBe('metamask');
			expect(result[0].walletAddress).toBe(WALLET_A.address);
		});

		it('handles decoded_input method name', async () => {
			const tx = makeBlockscoutTx({
				decoded_input: { method_call: 'transfer(address,uint256)' }
			});

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([tx]))
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(makeBlockscoutResponse([]))
				});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result[0].methodName).toBe('transfer(address,uint256)');
		});
	});

	// =========================================================================
	// Error handling
	// =========================================================================

	describe('Error handling', () => {
		it('returns empty array on timeout', async () => {
			mockFetch.mockImplementation(
				() =>
					new Promise((_, reject) => {
						const err = new Error('The operation was aborted');
						err.name = 'AbortError';
						reject(err);
					})
			);

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toEqual([]);
		});

		it('returns empty array on network error', async () => {
			mockFetch.mockRejectedValue(new Error('fetch failed'));

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toEqual([]);
		});

		it('handles empty items array in response', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ items: [] })
			});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toEqual([]);
		});

		it('handles missing items in response', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({})
			});

			const result = await fetchAllConnectedWalletTransactions([WALLET_A]);

			expect(result).toEqual([]);
		});
	});
});
