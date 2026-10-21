import { describe, expect, it, vi } from 'vitest';
import {
	ensureRgbAllocations,
	freeAllocationCount,
	NeedBitcoinError,
	parseWalletUtxos,
	receiveWithAllocations,
	shortOfColorableBitcoin,
	uncoloredSats
} from '$lib/stores/wallet/rgb-allocations';
import { walletStore } from '$lib/stores/wallet/wallet-state';

const free = {
	utxo: { exists: true, colorable: true },
	rgbAllocations: [],
	pendingBlinded: 0
};
const locked = {
	utxo: { exists: true, colorable: true },
	rgbAllocations: [],
	pendingBlinded: 1
};
const colored = {
	utxo: { exists: true, colorable: true },
	rgbAllocations: [{ assetId: 'rgb:used' }],
	pendingBlinded: 0
};
const vanilla = {
	utxo: { exists: true, colorable: false },
	rgbAllocations: [],
	pendingBlinded: 0
};

describe('parseWalletUtxos', () => {
	it('keeps existing coins and labels free, colored, locked, and vanilla rows', () => {
		const rows = parseWalletUtxos([
			{
				utxo: { exists: true, colorable: true, btcAmount: 1000, outpoint: { txid: 'aa', vout: 1 } },
				rgbAllocations: [],
				pendingBlinded: 0
			},
			{
				utxo: { exists: true, colorable: true, btcAmount: 2000, outpoint: { txid: 'bb', vout: 0 } },
				rgbAllocations: [{ assetId: 'rgb:used' }],
				pendingBlinded: 0
			},
			locked,
			{
				...vanilla,
				utxo: { exists: true, colorable: false, btcAmount: 500, outpoint: { txid: 'cc', vout: 2 } }
			},
			{ utxo: { exists: false, colorable: true }, rgbAllocations: [] }
		]);
		expect(rows.map((row) => row.kind)).toEqual(['free', 'colored', 'receiving', 'vanilla']);
		expect(rows[0]).toMatchObject({ outpoint: 'aa:1', sats: 1000, allocations: 0 });
		expect(rows[1]?.allocations).toBe(1);
	});

	it('returns an empty list for a malformed payload', () => {
		expect(parseWalletUtxos(null)).toEqual([]);
		expect(parseWalletUtxos([{ utxo: 'nope' }])).toEqual([]);
	});
});

describe('freeAllocationCount', () => {
	it('counts unlocked uncolored colorable utxos', () => {
		expect(freeAllocationCount([])).toBe(0);
		expect(freeAllocationCount([locked, colored, vanilla])).toBe(0);
		expect(freeAllocationCount([free, locked])).toBe(1);
	});
});

const funded = {
	utxo: { exists: true, colorable: false, btcAmount: 20_000 },
	rgbAllocations: [],
	pendingBlinded: 0
};

describe('shortOfColorableBitcoin', () => {
	it('is short when the wallet has no coins and no balance', () => {
		expect(shortOfColorableBitcoin([], 0)).toBe(true);
	});

	it('is not short when the balance can pay for a colorable output', () => {
		expect(shortOfColorableBitcoin([], 20_000)).toBe(false);
		expect(shortOfColorableBitcoin([funded], 0)).toBe(false);
	});
});

describe('ensureRgbAllocations', () => {
	it('stops before a self-transfer when the wallet has no bitcoin', async () => {
		const createUtxos = vi.fn().mockResolvedValue(5);
		await expect(
			ensureRgbAllocations({ listUnspents: async () => [], createUtxos })
		).rejects.toBeInstanceOf(NeedBitcoinError);
		expect(createUtxos).not.toHaveBeenCalled();
	});

	it('creates utxos when a plain output can pay for them', async () => {
		const createUtxos = vi.fn().mockResolvedValue(5);
		await ensureRgbAllocations({ listUnspents: async () => [funded], createUtxos });
		expect(createUtxos).toHaveBeenCalledWith({ upTo: true, num: 5, feeRate: 2 });
	});

	it('creates utxos when the balance is funded even if the coin list is empty', async () => {
		const createUtxos = vi.fn().mockResolvedValue(5);
		walletStore.update((current) => ({
			...current,
			rgb: { ...current.rgb, balanceSats: 20_000 }
		}));
		try {
			await ensureRgbAllocations({ listUnspents: async () => [], createUtxos });
			expect(createUtxos).toHaveBeenCalledWith({ upTo: true, num: 5, feeRate: 2 });
		} finally {
			walletStore.update((current) => ({
				...current,
				rgb: { ...current.rgb, balanceSats: 0 }
			}));
		}
	});

	it('does not self-transfer when every output is waiting on a receive', async () => {
		const createUtxos = vi.fn().mockResolvedValue(1);
		await ensureRgbAllocations({ listUnspents: async () => [locked], createUtxos });
		expect(createUtxos).not.toHaveBeenCalled();
	});

	it('does not self-transfer when an output already carries USDT', async () => {
		const createUtxos = vi.fn().mockResolvedValue(1);
		await ensureRgbAllocations({ listUnspents: async () => [colored, vanilla], createUtxos });
		expect(createUtxos).not.toHaveBeenCalled();
	});

	it('skips createUtxos when a free allocation exists', async () => {
		const createUtxos = vi.fn();
		await ensureRgbAllocations({ listUnspents: async () => [free], createUtxos });
		expect(createUtxos).not.toHaveBeenCalled();
	});

	it('ignores an already-available allocation error', async () => {
		const createUtxos = vi.fn().mockRejectedValue(new Error('Allocations already available'));
		await expect(
			ensureRgbAllocations({ listUnspents: async () => [funded], createUtxos })
		).resolves.toBeUndefined();
	});
});

describe('receiveWithAllocations', () => {
	it('allocates once and retries when the invoice reports insufficient allocations', async () => {
		const createUtxos = vi.fn().mockResolvedValue(1);
		const receive = vi
			.fn()
			.mockRejectedValueOnce(new Error('RGB invoice error: Insufficient allocations'))
			.mockResolvedValueOnce({ invoice: 'rgb:ok' });
		const wallet = { listUnspents: async () => [free], createUtxos };

		await expect(receiveWithAllocations(wallet, receive)).resolves.toEqual({ invoice: 'rgb:ok' });
		expect(createUtxos).toHaveBeenCalledWith({ upTo: false, num: 1, feeRate: 2 });
		expect(receive).toHaveBeenCalledTimes(2);
	});

	it('refuses a new output when USDT is already on a coin', async () => {
		const createUtxos = vi.fn();
		const receive = vi.fn().mockRejectedValue(new Error('Insufficient allocations'));
		const wallet = { listUnspents: async () => [colored], createUtxos };
		await expect(receiveWithAllocations(wallet, receive)).rejects.toBeInstanceOf(NeedBitcoinError);
		expect(createUtxos).not.toHaveBeenCalled();
	});
});

describe('uncoloredSats', () => {
	it('ignores outputs that carry USDT', () => {
		expect(
			uncoloredSats([
				{
					utxo: {
						exists: true,
						colorable: true,
						btcAmount: 1000,
						outpoint: { txid: 'aa', vout: 0 }
					},
					rgbAllocations: [{}]
				},
				{
					utxo: {
						exists: true,
						colorable: false,
						btcAmount: 5000,
						outpoint: { txid: 'bb', vout: 1 }
					},
					rgbAllocations: []
				}
			])
		).toBe(5000);
	});
});
