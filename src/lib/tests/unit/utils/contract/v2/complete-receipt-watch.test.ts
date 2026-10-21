import { describe, expect, it, vi } from 'vitest';
import {
	readReceiptWithoutAbort,
	startCompleteReceiptWatch,
	type ChainReceipt,
	type LateReceiptEvent
} from '$lib/utils/contract/v2/completeReceiptWatch';

describe('completion receipt watch', () => {
	it('confirms before the user-facing deadline', async () => {
		let clock = 0;
		let calls = 0;
		const late: LateReceiptEvent[] = [];
		const watch = startCompleteReceiptWatch({
			getReceipt: async () => {
				calls += 1;
				if (calls >= 3) return { status: 1, blockNumber: 12 };
				return null;
			},
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock,
			userDeadlineMs: 10_000,
			giveUpMs: 30_000,
			backoffMs: [1_000],
			onLate: (event) => late.push(event)
		});

		await expect(watch.userFacing).resolves.toEqual({
			type: 'confirmed',
			receipt: { status: 1, blockNumber: 12 }
		});
		await watch.done;
		expect(late).toEqual([]);
		expect(clock).toBe(2_000);
	});

	it('returns timeout at the deadline and then reports a late receipt', async () => {
		let clock = 0;
		let calls = 0;
		const late: LateReceiptEvent[] = [];
		const watch = startCompleteReceiptWatch({
			getReceipt: async () => {
				calls += 1;
				if (calls >= 5) return { status: 1, blockNumber: 9 };
				return null;
			},
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock,
			userDeadlineMs: 3_000,
			giveUpMs: 20_000,
			backoffMs: [1_000, 2_000],
			onLate: (event) => late.push(event)
		});

		await expect(watch.userFacing).resolves.toEqual({ type: 'timeout' });
		await watch.done;
		expect(late).toEqual([{ type: 'confirmed', receipt: { status: 1, blockNumber: 9 } }]);
	});

	it('reports a reverted receipt and stops', async () => {
		const watch = startCompleteReceiptWatch({
			getReceipt: async () => ({ status: 0, blockNumber: 4 }),
			sleep: async () => {
				throw new Error('should not keep polling');
			},
			now: () => 0,
			userDeadlineMs: 180_000,
			giveUpMs: 600_000,
			backoffMs: [2_000]
		});

		await expect(watch.userFacing).resolves.toEqual({
			type: 'reverted',
			receipt: { status: 0, blockNumber: 4 }
		});
		await watch.done;
	});

	it('gives up without a late event when the receipt never arrives', async () => {
		let clock = 0;
		const late: LateReceiptEvent[] = [];
		const watch = startCompleteReceiptWatch({
			getReceipt: async () => null,
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock,
			userDeadlineMs: 1_000,
			giveUpMs: 3_000,
			backoffMs: [1_000],
			onLate: (event) => late.push(event)
		});

		await expect(watch.userFacing).resolves.toEqual({ type: 'timeout' });
		await watch.done;
		expect(late).toEqual([]);
		expect(clock).toBeGreaterThanOrEqual(3_000);
	});

	it('does not abort a hung receipt read', async () => {
		vi.useFakeTimers();
		const abort = vi.fn();
		let rejectLate: (reason: unknown) => void = () => {};
		const hanging = new Promise<ChainReceipt | null>((_resolve, reject) => {
			rejectLate = reject;
		});
		const pending = readReceiptWithoutAbort(() => hanging, 20);
		await vi.advanceTimersByTimeAsync(25);
		await expect(pending).resolves.toBeNull();
		rejectLate(new Error('late rpc failure'));
		await Promise.resolve();
		expect(abort).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
