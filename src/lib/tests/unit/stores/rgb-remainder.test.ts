import { describe, expect, it, vi } from 'vitest';
import {
	beginRemainderSend,
	remainderMap,
	WITNESS_REMAINDER_SATS
} from '$lib/stores/wallet/rgb-remainder';

const assetId = 'rgb:f~usdt';
const proxy = 'rpcs://rgb-proxy.utexo.com/json-rpc';
const payee = { recipientId: 'utxob:payee', transportEndpoints: [proxy] };
const remainder = { recipientId: 'wvout:own', transportEndpoints: [proxy] };

describe('remainder map', () => {
	it('names the payee and a witness output that together spend the allocation', () => {
		const map = remainderMap(assetId, payee, 30_000_000, remainder, 70_000_000);
		expect(map?.[assetId]?.map((row) => row.assignment.Fungible)).toEqual([30_000_000, 70_000_000]);
		expect(map?.[assetId]?.[1]?.witnessData).toEqual({ amountSat: String(WITNESS_REMAINDER_SATS) });
		expect(map?.[assetId]?.[0]?.witnessData).toBeNull();
	});

	it('refuses a witness payee, a blinded remainder, and a duplicated recipient', () => {
		expect(remainderMap(assetId, remainder, 30_000_000, payee, 70_000_000)).toBeNull();
		expect(remainderMap(assetId, payee, 30_000_000, payee, 70_000_000)).toBeNull();
		expect(
			remainderMap(assetId, payee, 30_000_000, { ...payee, recipientId: 'utxob:other' }, 70_000_000)
		).toBeNull();
		expect(remainderMap(assetId, payee, 0, remainder, 70_000_000)).toBeNull();
	});
});

describe('beginRemainderSend', () => {
	it('calls the batch sender on the wallet binding when the public method is absent', async () => {
		const sendBeginBatch = vi.fn(async () => 'cHNidP-split');
		const psbt = await beginRemainderSend(
			{
				decodeRGBInvoice: async () => ({
					recipientId: 'utxob:payee',
					transportEndpoints: [proxy]
				}),
				witnessReceive: async () => ({ recipientId: 'wvout:own', batchTransferIdx: 3 }),
				_manager: { rlnBinding: { sendBeginBatch } }
			},
			{
				invoice: 'rgb:payee',
				assetId,
				amount: 30_000_000,
				spendable: 100_000_000,
				feeRate: 2,
				minConfirmations: 1
			}
		);
		expect(psbt).toBe('cHNidP-split');
		expect(sendBeginBatch).toHaveBeenCalledWith(
			expect.objectContaining({ donation: false, feeRate: 2, minConfirmations: 1 })
		);
		const rows = sendBeginBatch.mock.calls[0][0].recipientMap[assetId];
		expect(rows.reduce((sum, row) => sum + row.assignment.Fungible, 0)).toBe(100_000_000);
		expect(rows[1].witnessData?.amountSat).toBe('1000');
	});

	it('fails the witness receive when the batch send cannot be built', async () => {
		const failTransfers = vi.fn(async () => true);
		await expect(
			beginRemainderSend(
				{
					decodeRGBInvoice: async () => ({ recipientId: 'utxob:payee', transportEndpoints: [proxy] }),
					witnessReceive: async () => ({ recipientId: 'wvout:own', batchTransferIdx: 9 }),
					sendBeginBatch: async () => {
						throw new Error('InsufficientBitcoins');
					},
					failTransfers,
					listTransfers: async () => [
						{ kind: 'Send', status: 'Initiated', batchTransferIdx: 8 }
					]
				},
				{ invoice: 'rgb:payee', assetId, amount: 30_000_000, spendable: 100_000_000 }
			)
		).rejects.toThrow(/leaves the rest stuck/);
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 9, skipSync: true });
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 8, skipSync: true });
	});

	it('does not open a witness receive for a witness payee', async () => {
		const witnessReceive = vi.fn();
		await expect(
			beginRemainderSend(
				{
					decodeRGBInvoice: async () => ({ recipientId: 'wvout:payee', transportEndpoints: [proxy] }),
					witnessReceive,
					sendBeginBatch: vi.fn()
				},
				{ invoice: 'rgb:payee', assetId, amount: 30_000_000, spendable: 100_000_000 }
			)
		).resolves.toBeNull();
		expect(witnessReceive).not.toHaveBeenCalled();
	});
});
