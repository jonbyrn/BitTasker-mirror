import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: vi.fn().mockResolvedValue('test-device-id')
}));
vi.mock('$lib/utils/constants/storage', () => ({
	StorageKeys: { ACCESS_TOKEN: 'access_token' }
}));

// Mock the entire apiService module so BaseApiService.get is controllable
const mockGet = vi.fn();
vi.mock('$lib/api/apiService', () => {
	class MockBaseApiService {
		constructor(baseURL?: string) {
			void baseURL;
		}
		protected get(url: string) {
			return mockGet(url);
		}
	}
	return {
		BaseApiService: MockBaseApiService,
		ApiError: class ApiError extends Error {
			status: number;
			data: unknown;
			constructor(message: string, status = 500, data?: unknown) {
				super(message);
				this.name = 'ApiError';
				this.status = status;
				this.data = data;
			}
		}
	};
});

async function getService() {
	vi.resetModules();
	const mod = await import('$lib/api/services/crypto-price.service');
	// Clear internal cache
	(mod.default as { cache: Record<string, unknown> }).cache = {};
	return mod.default;
}

describe('CryptoPriceService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('getCurrentPrice returns cached value when cache is fresh', async () => {
		mockGet.mockResolvedValue({ data: { data: { amount: '50000' } }, status: 200 });
		const service = await getService();

		// First call populates cache
		const price1 = await service.getCurrentPrice('BTC');
		expect(price1).toBe(50000);
		expect(mockGet).toHaveBeenCalledTimes(1);

		// Second call within 5-minute window uses cache
		const price2 = await service.getCurrentPrice('BTC');
		expect(price2).toBe(50000);
		expect(mockGet).toHaveBeenCalledTimes(1);
	});

	it('getCurrentPrice fetches from Coinbase API for BTC', async () => {
		mockGet.mockResolvedValue({ data: { data: { amount: '65000.50' } }, status: 200 });
		const service = await getService();

		const price = await service.getCurrentPrice('BTC');

		expect(price).toBe(65000.5);
		expect(mockGet).toHaveBeenCalledWith('/v2/prices/BTC-USD/spot');
	});

	it('getCurrentPrice maps RBTC to BTC price (1:1 peg)', async () => {
		mockGet.mockResolvedValue({ data: { data: { amount: '60000' } }, status: 200 });
		const service = await getService();

		const rbtcPrice = await service.getCurrentPrice('RBTC');
		// BTC will read from cache set by RBTC path
		const btcPrice = await service.getCurrentPrice('BTC');

		expect(rbtcPrice).toBe(60000);
		expect(btcPrice).toBe(60000);
		// Only one HTTP call: RBTC path fetches BTC-USD endpoint, BTC reads from cache
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('/v2/prices/BTC-USD/spot');
	});

	it('getExchangeRate returns 1 for RBTC/BTC pair', async () => {
		const service = await getService();

		const rate = await service.getExchangeRate('RBTC', 'BTC');

		expect(rate).toBe(1.0);
		// 1:1 peg requires no HTTP call
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('getHistoricalPrice returns null on API error', async () => {
		mockGet.mockRejectedValue(new Error('Network failure'));
		const service = await getService();

		const price = await service.getHistoricalPrice(1);

		expect(price).toBeNull();
	});

	it('getHistoricalPrice uses 1-hour cache', async () => {
		mockGet.mockResolvedValue({ data: { data: { amount: '55000' } }, status: 200 });
		const service = await getService();

		// First call
		const price1 = await service.getHistoricalPrice(7);
		expect(price1).toBe(55000);
		expect(mockGet).toHaveBeenCalledTimes(1);

		// Advance time by 30 minutes — within 1-hour cache window
		vi.advanceTimersByTime(30 * 60 * 1000);

		// Second call should use cache, not make another HTTP call
		const price2 = await service.getHistoricalPrice(7);
		expect(price2).toBe(55000);
		expect(mockGet).toHaveBeenCalledTimes(1);

		// Advance past the full 1-hour expiry (total: 61 minutes)
		vi.advanceTimersByTime(31 * 60 * 1000);

		// Third call should fetch fresh data
		mockGet.mockResolvedValue({ data: { data: { amount: '56000' } }, status: 200 });
		const price3 = await service.getHistoricalPrice(7);
		expect(price3).toBe(56000);
		expect(mockGet).toHaveBeenCalledTimes(2);
	});

	it('getCurrentPrice throws when API fails', async () => {
		mockGet.mockRejectedValue(new Error('API error'));
		const service = await getService();

		await expect(service.getCurrentPrice('ETH')).rejects.toThrow('Failed to get price for ETH');
	});
});
