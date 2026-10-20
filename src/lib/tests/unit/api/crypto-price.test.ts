import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchBtcUsd } from '$lib/api/services/crypto-price.service';

vi.mock('axios', () => ({
	default: { get: vi.fn() }
}));

describe('fetchBtcUsd', () => {
	beforeEach(() => {
		vi.mocked(axios.get).mockReset();
	});

	it('reads the mempool price when that feed answers', async () => {
		vi.mocked(axios.get).mockImplementation(async (url) => {
			expect(String(url)).toContain('mempool.space/api/v1/prices');
			return { data: { USD: 81000 } };
		});
		await expect(fetchBtcUsd()).resolves.toBe(81000);
	});

	it('uses Coinbase when mempool is blocked', async () => {
		vi.mocked(axios.get).mockImplementation(async (url) => {
			if (String(url).includes('mempool.space')) throw new Error('403');
			return { data: { data: { amount: '82000.5' } } };
		});
		await expect(fetchBtcUsd()).resolves.toBe(82000.5);
	});

	it('fails when neither feed returns a price', async () => {
		vi.mocked(axios.get).mockRejectedValue(new Error('down'));
		await expect(fetchBtcUsd()).rejects.toThrow('Invalid BTC price response');
	});
});
