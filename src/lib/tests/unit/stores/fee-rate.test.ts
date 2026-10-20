import { describe, expect, it, vi } from 'vitest';
import { quotedSendFeeRate, resolveSendFeeRate } from '$lib/stores/wallet/fee-rate';

describe('resolveSendFeeRate', () => {
	it('uses 2 sat/vB when this test network has no estimate', () => {
		expect(resolveSendFeeRate(undefined)).toBe(2);
		expect(resolveSendFeeRate(null)).toBe(2);
		expect(resolveSendFeeRate(Number.NaN)).toBe(2);
		expect(resolveSendFeeRate(0)).toBe(2);
		expect(resolveSendFeeRate(-1)).toBe(2);
	});

	it('keeps a sane sat/vB estimate', () => {
		expect(resolveSendFeeRate(1)).toBe(1);
		expect(resolveSendFeeRate(2)).toBe(2);
		expect(resolveSendFeeRate(1.6)).toBe(2);
		expect(resolveSendFeeRate(7)).toBe(7);
		expect(resolveSendFeeRate(10)).toBe(10);
	});

	it('does not pay the 100 sat/vB rate from c68e940b', () => {
		expect(resolveSendFeeRate(100)).toBe(2);
		expect(resolveSendFeeRate(11)).toBe(2);
		expect(resolveSendFeeRate(25)).toBe(2);
	});

	it('does not scale a BTC/kvB figure into sat/vB', () => {
		// 0.001 BTC/kvB * 1e5 is 100 sat/vB. Leave the sub-1 number unscaled.
		expect(resolveSendFeeRate(0.001)).toBe(2);
		expect(resolveSendFeeRate(0.00001)).toBe(2);
	});

	it('reads sat/kvB as sat/vB and still caps it', () => {
		expect(resolveSendFeeRate(1000)).toBe(1);
		expect(resolveSendFeeRate(2000)).toBe(2);
		expect(resolveSendFeeRate(7000)).toBe(7);
		expect(resolveSendFeeRate(100_000)).toBe(2);
	});
});

describe('quotedSendFeeRate', () => {
	it('uses 2 when the wallet cannot estimate or the estimate fails', async () => {
		expect(await quotedSendFeeRate(null)).toBe(2);
		expect(await quotedSendFeeRate({})).toBe(2);
		const failing = {
			estimateFeeRate: vi.fn(async () => {
				throw new Error('CannotEstimateFees');
			})
		};
		expect(await quotedSendFeeRate(failing)).toBe(2);
		expect(failing.estimateFeeRate).toHaveBeenCalledWith(6);
	});

	it('drops an estimate of 100 sat/vB and keeps a sane one', async () => {
		expect(await quotedSendFeeRate({ estimateFeeRate: async () => ({ feeRate: 100 }) })).toBe(2);
		expect(await quotedSendFeeRate({ estimateFeeRate: async () => ({ feeRate: 4 }) })).toBe(4);
		expect(await quotedSendFeeRate({ estimateFeeRate: async () => 3 })).toBe(3);
	});
});
