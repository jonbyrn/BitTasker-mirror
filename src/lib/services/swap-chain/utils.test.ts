import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	estimateRskGas,
	GAS_LIMIT_RSK_DEFAULT,
	GAS_LIMIT_RSK_MIN,
	GAS_LIMIT_RSK_MAX
} from '$lib/services/swap-chain/utils';

const MOCK_RPC_URL = 'https://test-rpc.rsk.co';

function mockFetchResponse(result: string) {
	return vi.fn().mockResolvedValue({
		json: vi.fn().mockResolvedValue({ result })
	});
}

function mockFetchThrow(error: string) {
	return vi.fn().mockRejectedValue(new Error(error));
}

describe('estimateRskGas', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	const txParams = {
		to: '0xe761e1354097757c019855637746e7dd1bef1654',
		data: '0x12345678',
		value: '0x1000'
	};

	it('should estimate gas and add 20% buffer', async () => {
		// 100000 in hex = 0x186a0
		globalThis.fetch = mockFetchResponse('0x186a0');

		const result = await estimateRskGas(txParams, MOCK_RPC_URL);

		// 100000 * 1.2 = 120000
		expect(result).toBe(120000);
	});

	it('should clamp to GAS_LIMIT_RSK_MIN when estimate is too low', async () => {
		// 50000 in hex = 0xc350
		globalThis.fetch = mockFetchResponse('0xc350');

		const result = await estimateRskGas(txParams, MOCK_RPC_URL);

		// 50000 * 1.2 = 60000, clamped to GAS_LIMIT_RSK_MIN = 100000
		expect(result).toBe(GAS_LIMIT_RSK_MIN);
		expect(result).toBe(100000);
	});

	it('should clamp to GAS_LIMIT_RSK_MAX when estimate is too high', async () => {
		// 1000000 in hex = 0xf4240
		globalThis.fetch = mockFetchResponse('0xf4240');

		const result = await estimateRskGas(txParams, MOCK_RPC_URL);

		// 1000000 * 1.2 = 1200000, clamped to GAS_LIMIT_RSK_MAX = 500000
		expect(result).toBe(GAS_LIMIT_RSK_MAX);
		expect(result).toBe(500000);
	});

	it('should fall back to GAS_LIMIT_RSK_DEFAULT on RPC failure', async () => {
		globalThis.fetch = mockFetchThrow('Network error');

		const result = await estimateRskGas(txParams, MOCK_RPC_URL);

		expect(result).toBe(GAS_LIMIT_RSK_DEFAULT);
		expect(result).toBe(150000);
	});

	it('should fall back to GAS_LIMIT_RSK_DEFAULT when result is missing', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			json: vi.fn().mockResolvedValue({ error: 'method not found' })
		});

		const result = await estimateRskGas(txParams, MOCK_RPC_URL);

		expect(result).toBe(GAS_LIMIT_RSK_DEFAULT);
	});

	it('should call RPC with correct parameters', async () => {
		globalThis.fetch = mockFetchResponse('0x186a0');

		await estimateRskGas(txParams, MOCK_RPC_URL);

		expect(globalThis.fetch).toHaveBeenCalledWith(MOCK_RPC_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_estimateGas',
				params: [{ to: txParams.to, data: txParams.data, value: txParams.value }],
				id: 1
			})
		});
	});
});
