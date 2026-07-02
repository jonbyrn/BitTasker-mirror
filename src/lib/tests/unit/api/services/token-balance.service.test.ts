import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import tokenBalanceService from '$lib/api/services/token-balance.service';

/** Response-like object so service can call response.headers.entries() */
function mockFetchResponse(data: unknown, options: { ok?: boolean; status?: number } = {}) {
	const ok = options.ok ?? true;
	const status = options.status ?? 200;
	return {
		ok,
		status,
		headers: {
			entries: () => []
		},
		json: async () => data
	};
}

describe('TokenBalanceService', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		global.fetch = mockFetch as unknown as typeof fetch;
		vi.clearAllMocks();
		tokenBalanceService.clearCache();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getRSKTokenBalances', () => {
		it('should fetch and return token balances from Blockscout API', async () => {
			// API returns array directly
			const mockResponse = [
				{
					token: {
						address_hash: '0x1234567890123456789012345678901234567890',
						name: 'Tether USD',
						symbol: 'USDT',
						decimals: '18', // API returns as string
						total_supply: '1000000000000000000000'
					},
					value: '1000000000000000000', // 1 USDT
					token_id: null,
					token_instance: null
				}
			];

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			const result = await tokenBalanceService.getRSKTokenBalances('0xaddress');

			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe('USDT');
			expect(result[0].balance).toBe('1000000000000000000');
			expect(result[0].formattedBalance).toBe('1.0');
			expect(result[0].isNative).toBe(false);
		});

		it('should filter out tokens with zero balance', async () => {
			// API returns array directly
			const mockResponse = [
				{
					token: {
						address_hash: '0x1',
						name: 'Token1',
						symbol: 'T1',
						decimals: '18',
						total_supply: '1000'
					},
					value: '1000000000000000000', // Non-zero
					token_id: null,
					token_instance: null
				},
				{
					token: {
						address_hash: '0x2',
						name: 'Token2',
						symbol: 'T2',
						decimals: '18',
						total_supply: '1000'
					},
					value: '0', // Zero balance - should be filtered
					token_id: null,
					token_instance: null
				},
				{
					token: {
						address_hash: '0x3',
						name: 'Token3',
						symbol: 'T3',
						decimals: '18',
						total_supply: '1000'
					},
					value: '500000000000000000', // Non-zero
					token_id: null,
					token_instance: null
				}
			];

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			const result = await tokenBalanceService.getRSKTokenBalances('0xaddress');

			expect(result).toHaveLength(2);
			expect(result.find((t) => t.symbol === 'T2')).toBeUndefined();
			expect(result.find((t) => t.symbol === 'T1')).toBeDefined();
			expect(result.find((t) => t.symbol === 'T3')).toBeDefined();
		});

		it('should handle API errors gracefully', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(tokenBalanceService.getRSKTokenBalances('0xaddress')).rejects.toThrow(
				'Network error'
			);
		});

		it('should handle invalid API responses', async () => {
			mockFetch.mockResolvedValueOnce(mockFetchResponse({ invalid: 'response' }));

			const result = await tokenBalanceService.getRSKTokenBalances('0xaddress');
			expect(result).toEqual([]);
		});

		it('should handle paginated API responses', async () => {
			// API can also return paginated format with items property
			const mockResponse = {
				items: [
					{
						token: {
							address_hash: '0x1234...',
							name: 'Token',
							symbol: 'TKN',
							decimals: '18',
							total_supply: '1000'
						},
						value: '1000000000000000000',
						token_id: null,
						token_instance: null
					}
				],
				next_page_params: { page: 2 }
			};

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			const result = await tokenBalanceService.getRSKTokenBalances('0xaddress');
			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe('TKN');
		});

		it('should use correct API URL for mainnet', async () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');

			mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

			await tokenBalanceService.getRSKTokenBalances('0xaddress');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('rootstock.blockscout.com'),
				expect.any(Object)
			);
		});

		it('should use correct API URL for testnet', async () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'testnet');

			mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

			await tokenBalanceService.getRSKTokenBalances('0xaddress');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('rootstock-testnet.blockscout.com'),
				expect.any(Object)
			);
		});

		it('should handle timeout errors', async () => {
			mockFetch.mockImplementationOnce(
				() => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
			);

			await expect(tokenBalanceService.getRSKTokenBalances('0xaddress')).rejects.toThrow();
		});

		it('should format token balances correctly with different decimals', async () => {
			// API returns array directly
			const mockResponse = [
				{
					token: {
						address_hash: '0x1234...',
						name: 'Token',
						symbol: 'TKN',
						decimals: '6', // Different decimals, API returns as string
						total_supply: '1000000'
					},
					value: '1000000', // 1 token with 6 decimals
					token_id: null,
					token_instance: null
				}
			];

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			const result = await tokenBalanceService.getRSKTokenBalances('0xaddress');

			expect(result[0].formattedBalance).toBe('1.0');
			expect(result[0].decimals).toBe(6);
		});

		it('should handle HTTP error responses', async () => {
			mockFetch.mockResolvedValueOnce(mockFetchResponse(null, { ok: false, status: 500 }));

			await expect(tokenBalanceService.getRSKTokenBalances('0xaddress')).rejects.toThrow(
				'Blockscout API server error'
			);
		});

		it('should cache token metadata', async () => {
			// API returns array directly
			const mockResponse = [
				{
					token: {
						address_hash: '0x1234...',
						name: 'Test Token',
						symbol: 'TEST',
						decimals: '18', // API returns as string
						total_supply: '1000'
					},
					value: '1000000000000000000',
					token_id: null,
					token_instance: null
				}
			];

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			await tokenBalanceService.getRSKTokenBalances('0xaddress');

			const metadata = tokenBalanceService.getTokenMetadata('0x1234...');
			expect(metadata).toBeDefined();
			expect(metadata?.symbol).toBe('TEST');
			expect(metadata?.name).toBe('Test Token');
		});
	});

	describe('getTokenMetadata', () => {
		it('should return null for uncached token', () => {
			const result = tokenBalanceService.getTokenMetadata('0xunknown');
			expect(result).toBeNull();
		});

		it('should return cached metadata', async () => {
			// API returns array directly
			const mockResponse = [
				{
					token: {
						address_hash: '0x1234...',
						name: 'Cached Token',
						symbol: 'CACHED',
						decimals: '18', // API returns as string
						total_supply: '1000'
					},
					value: '1000000000000000000',
					token_id: null,
					token_instance: null
				}
			];

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			await tokenBalanceService.getRSKTokenBalances('0xaddress');

			const metadata = tokenBalanceService.getTokenMetadata('0x1234...');
			expect(metadata).toBeDefined();
			expect(metadata?.symbol).toBe('CACHED');
		});
	});

	describe('clearCache', () => {
		it('should clear metadata cache', async () => {
			// API returns array directly
			const mockResponse = [
				{
					token: {
						address_hash: '0x1234...',
						name: 'Test',
						symbol: 'TEST',
						decimals: '18', // API returns as string
						total_supply: '1000'
					},
					value: '1000000000000000000',
					token_id: null,
					token_instance: null
				}
			];

			mockFetch.mockResolvedValueOnce(mockFetchResponse(mockResponse));

			await tokenBalanceService.getRSKTokenBalances('0xaddress');
			expect(tokenBalanceService.getTokenMetadata('0x1234...')).toBeDefined();

			tokenBalanceService.clearCache();
			expect(tokenBalanceService.getTokenMetadata('0x1234...')).toBeNull();
		});
	});
});
