import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonRpcProvider } from 'ethers';
import {
	getTransactionConfirmationCount,
	SERVICE_ACCEPTANCE_CONFIRMATION_POLL_INTERVAL_MS,
	waitForServiceAcceptanceFinality
} from '$lib/utils/service-contract/finality';

describe('service contract finality policy', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it('reads confirmation counts from numeric and async receipt shapes', async () => {
		expect(await getTransactionConfirmationCount(null)).toBe(0);
		expect(
			await getTransactionConfirmationCount({
				confirmations: 4
			} as never)
		).toBe(4);
		expect(
			await getTransactionConfirmationCount({
				confirmations: async () => 5
			} as never)
		).toBe(5);
		expect(await getTransactionConfirmationCount({} as never)).toBe(1);
	});

	it('returns immediately when the initial receipt already meets the threshold', async () => {
		const provider = {
			getTransactionReceipt: vi.fn()
		} as unknown as JsonRpcProvider;

		const receipt = await waitForServiceAcceptanceFinality(provider, '0xabc', {
			hash: '0xabc',
			confirmations: 3,
			gasUsed: BigInt(100000)
		} as never);

		expect(receipt.hash).toBe('0xabc');
		expect(provider.getTransactionReceipt).not.toHaveBeenCalled();
	});

	it('polls until the confirmation threshold is reached and preserves initial receipt fields', async () => {
		vi.useFakeTimers();
		const provider = {
			getTransactionReceipt: vi
				.fn()
				.mockResolvedValueOnce({ confirmations: 1 })
				.mockResolvedValueOnce({ confirmations: 2 })
				.mockResolvedValueOnce({ confirmations: 3, hash: '0xconfirmed' })
		} as unknown as JsonRpcProvider;

		const promise = waitForServiceAcceptanceFinality(provider, '0xconfirmed', {
			hash: '0xconfirmed',
			confirmations: 1,
			gasUsed: BigInt(100000),
			logs: [{ data: '0x', topics: [] }]
		} as never);

		await vi.runOnlyPendingTimersAsync();
		await vi.runOnlyPendingTimersAsync();
		const receipt = await promise;

		expect(provider.getTransactionReceipt).toHaveBeenCalledTimes(3);
		expect(receipt.hash).toBe('0xconfirmed');
		expect(receipt.gasUsed).toBe(BigInt(100000));
		expect(receipt.logs).toHaveLength(1);
	});

	it('preserves initial receipt logs when the confirmed receipt omits them', async () => {
		vi.useFakeTimers();
		const provider = {
			getTransactionReceipt: vi.fn().mockResolvedValueOnce({
				confirmations: 3,
				hash: '0xconfirmed-without-logs',
				logs: undefined
			})
		} as never;

		const promise = waitForServiceAcceptanceFinality(provider, '0xconfirmed-without-logs', {
			hash: '0xconfirmed-without-logs',
			confirmations: 1,
			gasUsed: BigInt(100000),
			logs: [{ data: '0xdeadbeef', topics: [] }]
		} as never);

		await vi.runOnlyPendingTimersAsync();
		const receipt = await promise;

		expect(receipt.logs).toEqual([{ data: '0xdeadbeef', topics: [] }]);
	});

	it('fails closed with rpc_unavailable when polling stays broken', async () => {
		vi.useFakeTimers();
		const provider = {
			getTransactionReceipt: vi
				.fn()
				.mockRejectedValue(new Error('RPC connection lost while loading transaction receipt'))
		} as never;

		const promise = waitForServiceAcceptanceFinality(provider, '0xrpc', {
			hash: '0xrpc',
			confirmations: 1
		} as never);
		const expectation = expect(promise).rejects.toMatchObject({
			reasonCode: 'rpc_unavailable'
		});

		await vi.advanceTimersByTimeAsync(SERVICE_ACCEPTANCE_CONFIRMATION_POLL_INTERVAL_MS * 60);
		await expectation;
	});
});
