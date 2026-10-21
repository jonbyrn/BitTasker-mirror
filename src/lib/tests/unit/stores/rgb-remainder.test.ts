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

	it('accepts a blinded change output and refuses a witness payee or a duplicated recipient', () => {
		expect(remainderMap(assetId, remainder, 30_000_000, payee, 70_000_000)).toBeNull();
		expect(remainderMap(assetId, payee, 30_000_000, payee, 70_000_000)).toBeNull();
		const blinded = remainderMap(
			assetId,
			payee,
			33_000_000,
			{ ...payee, recipientId: 'utxob:change' },
			67_000_000
		);
		expect(blinded?.[assetId]?.[1]).toMatchObject({
			recipientId: 'utxob:change',
			witnessData: null,
			assignment: { Fungible: 67_000_000 }
		});
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
					decodeRGBInvoice: async () => ({
						recipientId: 'utxob:payee',
						transportEndpoints: [proxy]
					}),
					witnessReceive: async () => ({ recipientId: 'wvout:own', batchTransferIdx: 9 }),
					sendBeginBatch: async () => {
						throw new Error('InsufficientBitcoins');
					},
					failTransfers,
					listTransfers: async () => [{ kind: 'Send', status: 'Initiated', batchTransferIdx: 8 }]
				},
				{ invoice: 'rgb:payee', assetId, amount: 30_000_000, spendable: 100_000_000 }
			)
		).rejects.toThrow(/rest of your dollars/);
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 9, skipSync: true });
		expect(failTransfers).toHaveBeenCalledWith({ batchTransferIdx: 8, skipSync: true });
	});

	it('does not open a witness receive for a witness payee', async () => {
		const witnessReceive = vi.fn();
		await expect(
			beginRemainderSend(
				{
					decodeRGBInvoice: async () => ({
						recipientId: 'wvout:payee',
						transportEndpoints: [proxy]
					}),
					witnessReceive,
					sendBeginBatch: vi.fn()
				},
				{ invoice: 'rgb:payee', assetId, amount: 30_000_000, spendable: 100_000_000 }
			)
		).resolves.toBeNull();
		expect(witnessReceive).not.toHaveBeenCalled();
	});

	it('assigns 33 of 100 to the payee and the other 67 to a witness output', async () => {
		const sendBeginBatch = vi.fn(async () => 'cHNidP-33');
		const createUtxos = vi.fn();
		const onProgress = vi.fn();
		const psbt = await beginRemainderSend(
			{
				decodeRGBInvoice: async () => ({ recipientId: 'utxob:payee', transportEndpoints: [proxy] }),
				witnessReceive: async () => ({ recipientId: 'wvout:own', batchTransferIdx: 2 }),
				sendBeginBatch,
				createUtxos,
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId }],
						utxo: { exists: true, colorable: true, outpoint: { txid: 'aa', vout: 0 } }
					},
					{
						rgbAllocations: [],
						utxo: { exists: true, colorable: true, outpoint: { txid: 'bb', vout: 1 } }
					}
				]
			},
			{
				invoice: 'rgb:payee',
				assetId,
				amount: 33_000_000,
				spendable: 100_000_000,
				feeRate: 100,
				onProgress
			}
		);
		expect(psbt).toBe('cHNidP-33');
		expect(createUtxos).not.toHaveBeenCalled();
		expect(onProgress).not.toHaveBeenCalled();
		const rows = sendBeginBatch.mock.calls[0][0].recipientMap[assetId];
		expect(rows.map((row) => row.assignment.Fungible)).toEqual([33_000_000, 67_000_000]);
		expect(sendBeginBatch).toHaveBeenCalledWith(
			expect.objectContaining({ donation: false, feeRate: 2 })
		);
	});

	it('creates one 1000-sat coin at 2 sat/vB when no colorable output is free', async () => {
		const order: string[] = [];
		const onProgress = vi.fn();
		const sendBeginBatch = vi.fn(async () => {
			order.push('batch');
			return 'cHNidP-change';
		});
		const psbt = await beginRemainderSend(
			{
				decodeRGBInvoice: async () => ({ recipientId: 'utxob:payee', transportEndpoints: [proxy] }),
				witnessReceive: async () => {
					order.push('witness');
					return { recipientId: 'wvout:own', batchTransferIdx: 5 };
				},
				sendBeginBatch,
				createUtxos: async (params) => {
					order.push('create');
					expect(params).toEqual({ upTo: false, num: 1, size: 1000, feeRate: 2 });
					return 1;
				},
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId }],
						utxo: { exists: true, colorable: true, outpoint: { txid: 'aa', vout: 0 } }
					},
					{
						rgbAllocations: [],
						utxo: { exists: true, colorable: false, outpoint: { txid: 'bb', vout: 0 } }
					}
				]
			},
			{
				invoice: 'rgb:payee',
				assetId,
				amount: 33_000_000,
				spendable: 100_000_000,
				feeRate: 100,
				onProgress
			}
		);
		expect(psbt).toBe('cHNidP-change');
		expect(order).toEqual(['create', 'witness', 'batch']);
		expect(onProgress).toHaveBeenCalledWith('change-coin');
		expect(sendBeginBatch.mock.calls[0][0].feeRate).toBe(2);
	});

	it('uses a blinded change when a witness output cannot be opened', async () => {
		const sendBeginBatch = vi.fn(async () => 'cHNidP-blind');
		const psbt = await beginRemainderSend(
			{
				decodeRGBInvoice: async (params: { invoice: string }) =>
					params.invoice === 'rgb:own'
						? { recipientId: 'utxob:change', transportEndpoints: [proxy] }
						: { recipientId: 'utxob:payee', transportEndpoints: [proxy] },
				witnessReceive: async () => {
					throw new Error('insufficient allocations');
				},
				blindReceive: async () => ({ invoice: 'rgb:own', batchTransferIdx: 6 }),
				sendBeginBatch
			},
			{ invoice: 'rgb:payee', assetId, amount: 33_000_000, spendable: 100_000_000 }
		);
		expect(psbt).toBe('cHNidP-blind');
		expect(sendBeginBatch.mock.calls[0][0].recipientMap[assetId][1]).toMatchObject({
			recipientId: 'utxob:change',
			witnessData: null,
			assignment: { Fungible: 67_000_000 }
		});
	});

	it('does not spend the colored coin to make change and does not sign a one-recipient send', async () => {
		const witnessReceive = vi.fn(async () => {
			throw new Error('insufficient allocations');
		});
		const createUtxos = vi.fn();
		const sendBeginBatch = vi.fn();
		await expect(
			beginRemainderSend(
				{
					decodeRGBInvoice: async () => ({
						recipientId: 'utxob:payee',
						transportEndpoints: [proxy]
					}),
					witnessReceive,
					sendBeginBatch,
					createUtxos,
					listUnspents: async () => [
						{
							rgbAllocations: [{ assetId }],
							utxo: { exists: true, colorable: true, outpoint: { txid: 'aa', vout: 0 } }
						}
					]
				},
				{ invoice: 'rgb:payee', assetId, amount: 33_000_000, spendable: 100_000_000 }
			)
		).rejects.toThrow(/rest of your dollars/);
		expect(createUtxos).not.toHaveBeenCalled();
		expect(sendBeginBatch).not.toHaveBeenCalled();
	});
});
