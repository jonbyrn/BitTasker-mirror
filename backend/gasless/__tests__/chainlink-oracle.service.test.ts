// Chainlink Oracle Service Tests — Token/USD pricing

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
	Injectable: () => (target: any) => target,
	Logger: vi.fn().mockImplementation(() => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('../gasless.config', () => ({
	ETH_USD_FEED: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
	BTC_USD_FEED: '0x6ce185860a4963106506C203335A2910413708e9',
	MAX_ORACLE_STALENESS: 300,
	USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	WBTC_ADDRESS: '0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f',
	TBTC_ADDRESS: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
	ARBITRUM_CHAIN_ID: 42161,
	TOKENS: [
		{
			address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
			symbol: 'USDT0',
			decimals: 18,
			chainId: 42161
		},
		{
			address: '0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f',
			symbol: 'WBTC',
			decimals: 8,
			chainId: 42161
		},
		{
			address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
			symbol: 'TBTC',
			decimals: 18,
			chainId: 42161
		}
	],
	getTokenInfo: vi.fn((addr: string) => {
		const tokens: Record<string, any> = {
			'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': {
				address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				symbol: 'USDT0',
				decimals: 18,
				chainId: 42161
			},
			'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': {
				address: '0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f',
				symbol: 'WBTC',
				decimals: 8,
				chainId: 42161
			},
			'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': {
				address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
				symbol: 'TBTC',
				decimals: 18,
				chainId: 42161
			}
		};
		const token = tokens[addr.toLowerCase()];
		if (!token) throw new Error(`Unknown token: ${addr}`);
		return token;
	})
}));

// Mock ethers — Contract must return tuples (array-like) for roundData
const mockLatestRoundData = vi.fn();
const mockDecimals = vi.fn().mockResolvedValue(8);
vi.mock('ethers', () => {
	return {
		ethers: {
			JsonRpcProvider: vi.fn().mockImplementation(() => ({})),
			Contract: vi.fn().mockImplementation(() => ({
				latestRoundData: mockLatestRoundData,
				decimals: mockDecimals
			}))
		}
	};
});

import { ethers } from 'ethers';

// Helper: create a tuple-like array matching ethers Result format
function makeBtcRoundDataTuple(answer: bigint, updatedAtSeconds: number) {
	// ethers Result is array-like: [answer, startedAt, updatedAt, answeredInRound]
	const result: any = [
		answer,
		BigInt(updatedAtSeconds - 10),
		BigInt(updatedAtSeconds),
		BigInt(updatedAtSeconds)
	];
	result.answer = answer;
	result.startedAt = BigInt(updatedAtSeconds - 10);
	result.updatedAt = BigInt(updatedAtSeconds);
	result.answeredInRound = BigInt(updatedAtSeconds);
	return result;
}

describe('ChainlinkOracleService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('USDT0 Price', () => {
		it('should return constant 1e18 ($1.00) without oracle call', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const price = await service.getTokenPriceUSD('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
			expect(price).toBe(1_000_000_000_000_000_000n);
		});

		it('should not call oracle for USDT0', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			await service.getTokenPriceUSD('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
			expect(mockLatestRoundData).not.toHaveBeenCalled();
		});
	});

	describe('BTC/USD Feed', () => {
		it('should normalize 8-dec answer to 18-dec (answer * 1e10)', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			// 650000000000 = $6500.00 in 8 decimals (6500 * 1e8)
			const btcAnswer = 650000000000n;
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(btcAnswer, now - 10));
			const price = await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			// 650000000000 * 10000000000 = 6500 * 1e18
			expect(price).toBe(btcAnswer * 10_000_000_000n);
		});

		it('should work for TBTC as well', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			const btcAnswer = 650000000000n;
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(btcAnswer, now - 10));
			const price = await service.getTokenPriceUSD('0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40');
			expect(price).toBe(btcAnswer * 10_000_000_000n);
		});
	});

	describe('Staleness Check', () => {
		it('should reject data older than 300 seconds', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(650000000000n, now - 400));
			await expect(
				service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f')
			).rejects.toThrow('stale');
		});

		it('should accept fresh data', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(650000000000n, now - 10));
			const price = await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			expect(price).toBeGreaterThan(0n);
		});
	});

	describe('Price Caching', () => {
		it('should return cached value for second call within 60s', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(650000000000n, now - 10));
			const price1 = await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			vi.advanceTimersByTime(30_000);
			const price2 = await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			expect(price1).toBe(price2);
			expect(mockLatestRoundData).toHaveBeenCalledTimes(1);
		});

		it('should fetch fresh data after cache expires', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(650000000000n, now - 10));
			await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			vi.advanceTimersByTime(61_000);
			await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			expect(mockLatestRoundData).toHaveBeenCalledTimes(2);
		});
	});

	describe('Error Handling', () => {
		it('should throw for unknown token', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			await expect(
				service.getTokenPriceUSD('0x0000000000000000000000000000000000000001')
			).rejects.toThrow();
		});
	});

	describe('clearCache', () => {
		it('should clear cache and fetch fresh data', async () => {
			const { ChainlinkOracleService } = await import('../chainlink-oracle.service');
			const service = new ChainlinkOracleService();
			const now = Math.floor(Date.now() / 1000);
			mockLatestRoundData.mockResolvedValue(makeBtcRoundDataTuple(650000000000n, now - 10));
			await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			service.clearCache();
			await service.getTokenPriceUSD('0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f');
			expect(mockLatestRoundData).toHaveBeenCalledTimes(2);
		});
	});
});
