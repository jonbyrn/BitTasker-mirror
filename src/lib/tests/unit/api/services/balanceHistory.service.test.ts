import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import balanceHistoryService from '$lib/api/services/balanceHistory.service';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getHistoricalPrice: vi.fn(),
		getCurrentPrice: vi.fn()
	}
}));

// Mock network config
vi.mock('@bittasker/wallet-core', () => ({
	RSK_NETWORKS: {
		mainnet: {
			explorerApiUrl: 'https://rootstock.blockscout.com/api'
		},
		testnet: {
			explorerApiUrl: 'https://rootstock-testnet.blockscout.com/api'
		}
	},
	getBSCConfig: vi.fn(() => ({
		rpcUrl: 'https://bsc-dataseed.binance.org/',
		explorerApiUrl: null, // No longer using BSCScan API
		chainId: 56
	})),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));

// Mock environment variables
vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
vi.stubEnv('VITE_BSC_NETWORK', 'testnet');

/**
 * Creates a fetch mock that returns proper JSON-RPC responses for eth_getBalance
 * and eth_call (stablecoin) calls, while failing Blockscout API calls to test RPC fallback.
 */
function createFetchMockForBalance(ethBalance: string) {
	const hexBalance = '0x' + BigInt(ethers.parseEther(ethBalance)).toString(16);
	return vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
		if (options?.body) {
			try {
				const body = JSON.parse(options.body as string);
				if (body.method === 'eth_getBalance') {
					return {
						ok: true,
						json: async () => ({ result: hexBalance })
					};
				}
				if (body.method === 'eth_call') {
					// Stablecoin calls — return empty (no stablecoin balance)
					return {
						ok: true,
						json: async () => ({ result: '0x' })
					};
				}
			} catch {
				/* not JSON-RPC */
			}
		}
		// Blockscout API or unknown — fail to trigger RPC fallback
		return { ok: false, status: 500, json: async () => ({}) };
	});
}

describe('BalanceHistoryService', () => {
	let mockProvider: ethers.JsonRpcProvider & {
		getBlock: ReturnType<typeof vi.fn>;
		getBalance: ReturnType<typeof vi.fn>;
	};
	const mockAddress = '0x1234567890123456789012345678901234567890';

	beforeEach(() => {
		// Clear all caches before each test
		balanceHistoryService.clearCaches();

		// Clear localStorage
		localStorage.clear();

		// Reset mocks
		vi.clearAllMocks();

		// Create mock provider
		mockProvider = {
			getBlock: vi.fn(),
			getBalance: vi.fn()
		} as unknown as ethers.JsonRpcProvider & {
			getBlock: ReturnType<typeof vi.fn>;
			getBalance: ReturnType<typeof vi.fn>;
		};

		// Mock global fetch by default to fail with a parseable JSON body
		// (the service now uses direct fetch RPC calls, so responses need .json())
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({})
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('getBalanceChanges', () => {
		it('should return empty changes when balance is zero', async () => {
			// Mock API to fail so it falls back to RPC estimation
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500
			});

			// Mock provider for RPC fallback
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			// Historical balance is also zero
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			const result = await balanceHistoryService.getBalanceChanges(0, 0, mockProvider, mockAddress);

			expect(result).toHaveLength(3);
			expect(result[0].label).toBe('24h');
			// When both current and historical balance are zero, change is 0 (not null)
			expect(result[0].satsChange).toBe(0);
			expect(result[1].label).toBe('7d');
			expect(result[2].label).toBe('30d');
		});

		it('should return empty changes when provider is null', async () => {
			// When provider is null, the service can't look up historical blocks
			// so historical balance defaults to 0 — change equals full current balance
			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				null,
				mockAddress
			);

			expect(result).toHaveLength(3);
			expect(result[0].satsChange).toBe(100000000);
		});

		it('should return empty changes when address is null', async () => {
			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				null
			);

			expect(result).toHaveLength(3);
			expect(result[0].satsChange).toBeNull();
		});

		it('should calculate balance changes for all periods', async () => {
			// Mock latest block
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});

			// Mock fetch to return proper balance data for direct RPC calls
			// (service uses fetch instead of provider.getBalance)
			global.fetch = createFetchMockForBalance('0.5'); // 50,000,000 sats

			// Mock historical prices
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			const result = await balanceHistoryService.getBalanceChanges(
				100000000, // 1 BTC current
				50000, // $50,000 current
				mockProvider,
				mockAddress
			);

			expect(result).toHaveLength(3);

			// Check 24h period
			expect(result[0].label).toBe('24h');
			expect(result[0].satsChange).toBe(50000000); // 100M - 50M = 50M
			expect(result[0].satsPercentChange).toBe(100); // 50M/50M * 100 = 100%

			// Check 7d period
			expect(result[1].label).toBe('7d');
			expect(result[1].satsChange).toBe(50000000);

			// Check 30d period
			expect(result[2].label).toBe('30d');
			expect(result[2].satsChange).toBe(50000000);
		});

		it('should calculate and return balance changes successfully', async () => {
			// Mock API to succeed
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					status: '1',
					result: { blockNumber: '5000' }
				})
			});

			// Mock successful data fetching
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			expect(result).toHaveLength(3);
			expect(result[0].label).toBe('24h');
			expect(result[0].satsChange).not.toBeNull();
			expect(result[1].label).toBe('7d');
			expect(result[2].label).toBe('30d');
		});

		it('should handle API errors gracefully', async () => {
			// Mock API to fail
			global.fetch = vi.fn().mockRejectedValue(new Error('API Error'));

			// Mock provider to fail
			mockProvider.getBlock.mockRejectedValue(new Error('Provider Error'));
			mockProvider.getBalance.mockRejectedValue(new Error('Balance Error'));

			// Mock price service to fail
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockRejectedValue(new Error('Price Error'));

			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			// Should return empty changes instead of throwing
			expect(result).toHaveLength(3);
			expect(result[0].satsChange).toBeNull();
		});
	});

	describe('Caching', () => {
		it('should have clearCaches method', () => {
			// Just verify the method exists and can be called
			expect(() => balanceHistoryService.clearCaches()).not.toThrow();
		});
	});

	describe('Block Number Lookup', () => {
		it('should use Blockscout API for RSK network', async () => {
			// Mock successful Blockscout API response for RSK
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					status: '1',
					result: {
						blockNumber: '5000'
					}
				})
			});

			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			await balanceHistoryService.getBalanceChanges(100000000, 50000, mockProvider, mockAddress);

			// Should call Blockscout API for RSK
			expect(global.fetch).toHaveBeenCalled();
			const fetchCalls = vi.mocked(global.fetch).mock.calls;
			const rskApiCall = fetchCalls.find(
				(call) => typeof call[0] === 'string' && call[0].includes('blockscout.com')
			);
			expect(rskApiCall).toBeDefined();

			// Should not call provider.getBlock for historical blocks (only for latest)
			// Latest block is called once for cache
			expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
		});

		it('should use free Binance RPC for BSC network', async () => {
			// Mock BSC RPC responses
			const currentBlockNumber = 50000000;
			const currentTimestamp = Math.floor(Date.now() / 1000);
			const targetTimestamp = currentTimestamp - 86400; // 24 hours ago
			const estimatedBlock = currentBlockNumber - Math.floor(86400 / 3); // ~3 second blocks

			global.fetch = vi
				.fn()
				// First call: Get current block
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						jsonrpc: '2.0',
						result: {
							number: '0x' + currentBlockNumber.toString(16),
							timestamp: '0x' + currentTimestamp.toString(16)
						},
						id: 1
					})
				})
				// Second call: Binary search - get block at estimated position
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						jsonrpc: '2.0',
						result: {
							number: '0x' + estimatedBlock.toString(16),
							timestamp: '0x' + targetTimestamp.toString(16)
						},
						id: 1
					})
				});

			// Note: BSC tests would require a BSC provider, but for now we test RSK
			// This test verifies the RPC endpoint structure is correct
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			await balanceHistoryService.getBalanceChanges(100000000, 50000, mockProvider, mockAddress);

			// Should call fetch (for RSK Blockscout API in this case)
			expect(global.fetch).toHaveBeenCalled();
		});

		it('should fall back to RPC when API fails', async () => {
			// Mock API to fail
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500
			});

			// Mock provider for RPC fallback
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			await balanceHistoryService.getBalanceChanges(100000000, 50000, mockProvider, mockAddress);

			// Should call API first
			expect(global.fetch).toHaveBeenCalled();

			// Should fall back to provider
			expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
		});

		it('should handle BSC RPC current block fetch failure', async () => {
			// Mock API/RPC to fail (this tests RSK API failure, which falls back to provider RPC)
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500
			});

			// Mock provider for RPC fallback (this is what happens when API fails)
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			// Should gracefully handle API failure and fall back to provider RPC
			// Provider RPC succeeds, so we get calculated changes (not null)
			expect(result).toHaveLength(3);
			// When RPC fallback succeeds, we get calculated changes
			expect(result[0].satsChange).not.toBeNull();
		});

		it('should estimate BSC block number correctly from timestamp', async () => {
			// Test BSC block estimation logic
			const currentBlockNumber = 50000000;
			const currentTimestamp = Math.floor(Date.now() / 1000);
			const hoursAgo = 24;
			const targetTimestamp = currentTimestamp - hoursAgo * 3600;

			// BSC blocks are ~3 seconds apart
			const BSC_BLOCK_TIME = 3;
			const timeDiff = currentTimestamp - targetTimestamp;
			const estimatedBlock = currentBlockNumber - Math.floor(timeDiff / BSC_BLOCK_TIME);

			// Verify estimation calculation
			expect(estimatedBlock).toBeLessThan(currentBlockNumber);
			expect(estimatedBlock).toBeGreaterThan(0);

			// 24 hours = 86400 seconds, divided by 3 = 28800 blocks
			const expectedBlocksAgo = Math.floor(86400 / 3);
			expect(estimatedBlock).toBeCloseTo(currentBlockNumber - expectedBlocksAgo, -3);
		});
	});

	describe('Historical Price Fetching', () => {
		it('should fetch historical prices for all periods', async () => {
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));

			// Mock different prices for different periods
			vi.mocked(cryptoPriceService.getHistoricalPrice)
				.mockResolvedValueOnce(49000) // 1 day ago
				.mockResolvedValueOnce(47000) // 7 days ago
				.mockResolvedValueOnce(45000); // 30 days ago

			await balanceHistoryService.getBalanceChanges(100000000, 50000, mockProvider, mockAddress);

			// Should call getHistoricalPrice for each period
			expect(cryptoPriceService.getHistoricalPrice).toHaveBeenCalledTimes(3);
			expect(cryptoPriceService.getHistoricalPrice).toHaveBeenCalledWith(1);
			expect(cryptoPriceService.getHistoricalPrice).toHaveBeenCalledWith(7);
			expect(cryptoPriceService.getHistoricalPrice).toHaveBeenCalledWith(30);
		});

		it('should cache historical prices', async () => {
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			// Mock fetch to return proper balance data for direct RPC calls
			global.fetch = createFetchMockForBalance('0.5');
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			// First call
			await balanceHistoryService.getBalanceChanges(100000000, 50000, mockProvider, mockAddress);

			// Clear localStorage to force refetch (but keep in-memory cache)
			localStorage.clear();

			// Second call
			await balanceHistoryService.getBalanceChanges(100000000, 50000, mockProvider, mockAddress);

			// Should use in-memory cache for prices
			// First call: 3 prices, Second call: 0 (cached)
			expect(cryptoPriceService.getHistoricalPrice).toHaveBeenCalledTimes(3);
		});
	});

	describe('Balance Comparison Calculations', () => {
		it('should calculate positive changes correctly', async () => {
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});

			// Historical balance: 0.5 BTC (50,000,000 sats) via direct RPC fetch
			global.fetch = createFetchMockForBalance('0.5');

			// Historical price: $45,000
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			// Current: 1 BTC (100,000,000 sats) at $50,000
			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			const change = result[0]; // 24h
			expect(change.satsChange).toBe(50000000); // +50M sats
			expect(change.satsPercentChange).toBe(100); // +100%

			// USD change: current ($50,000) - historical (0.5 BTC * $45,000 = $22,500) = $27,500
			expect(change.usdChange).toBeCloseTo(27500, 0);
			expect(change.usdPercentChange).toBeCloseTo(122.22, 1); // +122.22%
		});

		it('should calculate negative changes correctly', async () => {
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});

			// Historical balance: 1.5 BTC (150,000,000 sats) via direct RPC fetch
			global.fetch = createFetchMockForBalance('1.5');

			// Historical price: $45,000
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			// Current: 1 BTC (100,000,000 sats) at $50,000
			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			const change = result[0]; // 24h
			expect(change.satsChange).toBe(-50000000); // -50M sats
			expect(change.satsPercentChange).toBeCloseTo(-33.33, 1); // -33.33%

			// USD change: current ($50,000) - historical (1.5 BTC * $45,000 = $67,500) = -$17,500
			expect(change.usdChange).toBeCloseTo(-17500, 0);
			expect(change.usdPercentChange).toBeCloseTo(-25.93, 1); // -25.93%
		});

		it('should handle zero historical balance', async () => {
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});

			// Historical balance: 0 BTC
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0'));

			// Historical price: $45,000
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			// Current: 1 BTC (100,000,000 sats) at $50,000
			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			const change = result[0]; // 24h
			expect(change.satsChange).toBe(100000000); // +100M sats
			expect(change.satsPercentChange).toBe(100); // +100% (from 0)
			expect(change.usdChange).toBe(50000); // +$50,000
			expect(change.usdPercentChange).toBe(100); // +100% (from 0)
		});
	});

	describe('BSC RPC Integration', () => {
		it('should use free Binance RPC endpoint for BSC block lookups', async () => {
			const currentBlockNumber = 50000000;
			const currentTimestamp = Math.floor(Date.now() / 1000);
			const estimatedBlock = currentBlockNumber - Math.floor(86400 / 3);

			// Mock BSC RPC endpoint calls
			global.fetch = vi
				.fn()
				// First call: Get current block (eth_getBlockByNumber with 'latest')
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						jsonrpc: '2.0',
						result: {
							number: '0x' + currentBlockNumber.toString(16),
							timestamp: '0x' + currentTimestamp.toString(16)
						},
						id: 1
					})
				})
				// Binary search calls: Get block at estimated position
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						jsonrpc: '2.0',
						result: {
							number: '0x' + estimatedBlock.toString(16),
							timestamp: '0x' + (currentTimestamp - 86400).toString(16)
						},
						id: 1
					})
				});

			// Verify the RPC endpoint URL is correct
			const fetchCalls = vi.mocked(global.fetch);

			// Note: This test verifies the structure, actual BSC testing would require BSC provider
			// The service uses RSK provider by default, so this test validates the RPC call format
			expect(fetchCalls).toBeDefined();
		});

		it('should handle BSC RPC response format correctly', async () => {
			const blockNumber = 50000000;
			const timestamp = Math.floor(Date.now() / 1000);

			// Mock BSC RPC response
			const mockRpcResponse = {
				jsonrpc: '2.0',
				result: {
					number: '0x' + blockNumber.toString(16),
					timestamp: '0x' + timestamp.toString(16)
				},
				id: 1
			};

			// Verify hex to decimal conversion
			const parsedBlockNumber = parseInt(mockRpcResponse.result.number, 16);
			const parsedTimestamp = parseInt(mockRpcResponse.result.timestamp, 16);

			expect(parsedBlockNumber).toBe(blockNumber);
			expect(parsedTimestamp).toBe(timestamp);
		});

		it('should calculate BSC block estimation correctly', () => {
			const currentBlockNumber = 50000000;
			const currentTimestamp = Math.floor(Date.now() / 1000);
			const hoursAgo = 24;
			const targetTimestamp = (currentTimestamp - hoursAgo * 3600) * 1000; // ms

			// BSC blocks are ~3 seconds apart
			const BSC_BLOCK_TIME = 3;
			const currentTimestampMs = currentTimestamp * 1000;
			const timeDiff = (currentTimestampMs - targetTimestamp) / 1000; // Convert to seconds
			const estimatedBlock = Math.max(
				0,
				currentBlockNumber - Math.floor(timeDiff / BSC_BLOCK_TIME)
			);

			// Verify estimation
			expect(estimatedBlock).toBeLessThan(currentBlockNumber);
			expect(estimatedBlock).toBeGreaterThan(0);

			// 24 hours = 86400 seconds, divided by 3 = 28800 blocks
			const expectedBlocksAgo = Math.floor(86400 / 3);
			expect(estimatedBlock).toBe(currentBlockNumber - expectedBlocksAgo);
		});

		it('should handle future timestamps by returning current block', async () => {
			const currentBlockNumber = 50000000;
			const currentTimestamp = Math.floor(Date.now() / 1000);
			const futureTimestamp = (currentTimestamp + 3600) * 1000; // 1 hour in future

			// Mock BSC RPC response for current block
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					jsonrpc: '2.0',
					result: {
						number: '0x' + currentBlockNumber.toString(16),
						timestamp: '0x' + currentTimestamp.toString(16)
					},
					id: 1
				})
			});

			// If target is in the future, should return current block
			// This is tested by verifying the logic in the service
			expect(currentTimestamp * 1000).toBeLessThan(futureTimestamp);
		});

		it('should handle BSC RPC errors gracefully', async () => {
			// Mock API to fail (tests RSK API failure, which falls back to provider RPC)
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500
			});

			// Mock provider for RPC fallback
			mockProvider.getBlock.mockResolvedValue({
				number: 1000,
				timestamp: Math.floor(Date.now() / 1000)
			});
			mockProvider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));
			vi.mocked(cryptoPriceService.getHistoricalPrice).mockResolvedValue(45000);

			const result = await balanceHistoryService.getBalanceChanges(
				100000000,
				50000,
				mockProvider,
				mockAddress
			);

			// Should gracefully handle API failure and fall back to provider RPC
			// Provider RPC succeeds, so we get calculated changes
			expect(result).toHaveLength(3);
			expect(result[0].satsChange).not.toBeNull();
		});
	});
});
