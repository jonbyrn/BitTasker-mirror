import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeWithRetry, callContractMethod } from '$lib/utils/wallet/rpcHelpers';
import type { Contract } from 'ethers';

describe('rpcHelpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	describe('executeWithRetry', () => {
		it('should return result on first successful call', async () => {
			const result = await executeWithRetry(() => Promise.resolve(42), 'test-op', {
				timeoutMs: 5000
			});
			expect(result).toBe(42);
		});

		it('should throw immediately for non-transient error without retrying', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('invalid argument'));
			await expect(
				executeWithRetry(operation, 'test-op', { maxRetries: 2, timeoutMs: 5000 })
			).rejects.toThrow('invalid argument');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on transient error and return on success', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('network error'))
				.mockResolvedValueOnce('ok');
			const result = await executeWithRetry(operation, 'test-op', {
				maxRetries: 1,
				initialDelayMs: 1,
				maxDelayMs: 5,
				timeoutMs: 5000
			});
			expect(result).toBe('ok');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should throw after exhausting retries on persistent transient error', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('timeout'));
			await expect(
				executeWithRetry(operation, 'test-op', {
					maxRetries: 1,
					initialDelayMs: 1,
					maxDelayMs: 5,
					timeoutMs: 5000
				})
			).rejects.toThrow('timeout');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should treat error with code NETWORK_ERROR as transient', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(Object.assign(new Error('fail'), { code: 'NETWORK_ERROR' }))
				.mockResolvedValueOnce(99);
			const result = await executeWithRetry(operation, 'test-op', {
				maxRetries: 1,
				initialDelayMs: 1,
				maxDelayMs: 5,
				timeoutMs: 5000
			});
			expect(result).toBe(99);
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should throw on timeout when operation exceeds timeoutMs', async () => {
			const operation = () =>
				new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 100));
			await expect(
				executeWithRetry(operation, 'test-op', {
					maxRetries: 0,
					timeoutMs: 10
				})
			).rejects.toThrow(/RPC call timeout after 10ms/);
		});
	});

	describe('callContractMethod', () => {
		it('should call contract method and return result', async () => {
			const mockContract = {
				getBalance: vi.fn().mockResolvedValue(100n)
			};
			const result = await callContractMethod(
				mockContract as unknown as Contract,
				'getBalance',
				['0x123'],
				{
					timeoutMs: 5000
				}
			);
			expect(result).toBe(100n);
			expect(mockContract.getBalance).toHaveBeenCalledWith('0x123');
		});

		it('should propagate contract method rejection', async () => {
			const mockContract = {
				transfer: vi.fn().mockRejectedValue(new Error('revert'))
			};
			await expect(
				callContractMethod(mockContract as unknown as Contract, 'transfer', ['0xabc', 100], {
					maxRetries: 0,
					timeoutMs: 5000
				})
			).rejects.toThrow('revert');
			expect(mockContract.transfer).toHaveBeenCalledWith('0xabc', 100);
		});
	});
});
