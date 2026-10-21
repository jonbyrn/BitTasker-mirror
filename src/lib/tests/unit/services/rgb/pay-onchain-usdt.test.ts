import { beforeEach, describe, expect, it, vi } from 'vitest';
import { payOnchainUsdt } from '$lib/services/rgb/escrow-rails/rgb-onchain';
import { esploraOutputSpent } from '$lib/stores/wallet/signet-broadcast';

vi.mock('$lib/stores/wallet/signet-broadcast', () => ({
	esploraHasTx: vi.fn(async () => false),
	esploraOutputSpent: vi.fn(async () => ({ spent: false }))
}));

const assetId = 'rgb:f~usdt';
const seal = 'ab'.repeat(32);
const spentBy = '11'.repeat(32);

function walletDouble() {
	return {
		refreshWallet: vi.fn(async () => undefined),
		syncWallet: vi.fn(async () => undefined),
		listUnspents: vi.fn(async () => [
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 110_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'cd'.repeat(32), vout: 1 } }
			}
		]),
		listAssets: vi.fn(async () => ({
			ifa: [{ assetId, balance: { spendable: 110_000_000 } }]
		})),
		onchainSendBegin: vi.fn(async () => 'cHNidP'),
		signPsbt: vi.fn(async () => 'cHNidP-signed'),
		onchainSendEnd: vi.fn(async () => ({ txid: 'ef'.repeat(32) }))
	};
}

describe('payOnchainUsdt', () => {
	beforeEach(() => {
		vi.mocked(esploraOutputSpent).mockReset();
		vi.mocked(esploraOutputSpent).mockResolvedValue({ spent: false });
	});

	it('refuses a seal the chain already spent before building a PSBT', async () => {
		vi.mocked(esploraOutputSpent).mockResolvedValue({ spent: true, txid: spentBy });
		const wallet = walletDouble();
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 1_000_000)).rejects.toThrow(
			'0.00 USDT can be sent. 110.00 is locked or unconfirmed. Tap Repair wallet, then try again.'
		);
		expect(wallet.refreshWallet).toHaveBeenCalled();
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
	});

	it('pays from the live output when another allocation is already spent', async () => {
		vi.mocked(esploraOutputSpent).mockImplementation(async (_txid, vout) =>
			vout === 5 ? { spent: true, txid: spentBy } : { spent: false }
		);
		const wallet = walletDouble();
		const liveTx = 'cd'.repeat(32);
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 5 } }
			},
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 11_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: liveTx, vout: 1 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'ef'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 111_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 11_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ assetId, amount: 11_000_000, invoice: 'rgb:invoice' })
		);
	});

	it('funds escrow from the live 100 and never the phantom 170', async () => {
		vi.mocked(esploraOutputSpent).mockImplementation(async (txid) =>
			txid.startsWith('691') ? { spent: true, txid: spentBy } : { spent: false }
		);
		const wallet = walletDouble();
		const spentTx = `691${'a'.repeat(61)}`;
		const liveTx = `1526488b${'b'.repeat(56)}`;
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 70_000_000 } }],
				utxo: {
					exists: true,
					colorable: true,
					btcAmount: 691,
					outpoint: { txid: spentTx, vout: 1 }
				}
			},
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: {
					exists: true,
					colorable: true,
					btcAmount: 1000,
					outpoint: { txid: liveTx, vout: 0 }
				}
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'cd'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 170_000_000, settled: 170_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 100_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 100_000_000 })
		);
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 120_000_000)).rejects.toThrow(
			/100\.00 USDT can be sent/
		);
		expect(wallet.onchainSendBegin).toHaveBeenCalledTimes(1);
	});

	it('refuses a partial send when the remainder cannot be assigned', async () => {
		const wallet = walletDouble();
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 70_000_000 } }],
				utxo: {
					exists: true,
					colorable: true,
					btcAmount: 691,
					outpoint: { txid: seal, vout: 1 }
				}
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'cd'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 70_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 2_000_000)).rejects.toThrow(
			/rest of your dollars/
		);
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
	});

	it('assigns the unsent amount to a witness output in the same transfer', async () => {
		const wallet = walletDouble();
		const sendBeginBatch = vi.fn(async () => 'cHNidP-split');
		const witnessReceive = vi.fn(async () => ({
			invoice: 'rgb:witness',
			recipientId: 'wvout:own',
			batchTransferIdx: 4
		}));
		const decodeRGBInvoice = vi.fn(async () => ({
			recipientId: 'utxob:payee',
			transportEndpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc']
		}));
		Object.assign(wallet, { sendBeginBatch, witnessReceive, decodeRGBInvoice });
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 70_000_000 } }],
				utxo: {
					exists: true,
					colorable: true,
					btcAmount: 691,
					outpoint: { txid: seal, vout: 1 }
				}
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'cd'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 70_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 2_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(witnessReceive).toHaveBeenCalledWith({
			assetId,
			amount: 68_000_000,
			minConfirmations: 1
		});
		expect(sendBeginBatch).toHaveBeenCalledWith({
			donation: false,
			feeRate: 2,
			minConfirmations: 1,
			recipientMap: {
				[assetId]: [
					{
						recipientId: 'utxob:payee',
						witnessData: null,
						assignment: { Fungible: 2_000_000 },
						transportEndpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc']
					},
					{
						recipientId: 'wvout:own',
						witnessData: { amountSat: '1000' },
						assignment: { Fungible: 68_000_000 },
						transportEndpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc']
					}
				]
			}
		});
	});

	it('refuses a locked coin before the sync starts', async () => {
		const wallet = walletDouble();
		wallet.listUnspents.mockResolvedValue([
			{
				pendingBlinded: 1,
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 110_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			}
		]);
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 1_000_000)).rejects.toThrow(
			/blank invoice/
		);
		expect(wallet.syncWallet).not.toHaveBeenCalled();
		expect(wallet.refreshWallet).not.toHaveBeenCalled();
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
	});

	it('sends the full balance when the seal is still unspent', async () => {
		const wallet = walletDouble();
		const witnessReceive = vi.fn();
		const createUtxos = vi.fn();
		Object.assign(wallet, { witnessReceive, createUtxos });
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 110_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ assetId, amount: 110_000_000, invoice: 'rgb:invoice' })
		);
		expect(witnessReceive).not.toHaveBeenCalled();
		expect(createUtxos).not.toHaveBeenCalled();
	});

	it('sends 33 of 100 and returns the other 67 on a witness output', async () => {
		const wallet = walletDouble();
		const sendBeginBatch = vi.fn(async () => 'cHNidP-split');
		const witnessReceive = vi.fn(async () => ({
			recipientId: 'wvout:own',
			batchTransferIdx: 4
		}));
		const createUtxos = vi.fn();
		const decodeRGBInvoice = vi.fn(async () => ({
			recipientId: 'utxob:payee',
			transportEndpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc']
		}));
		Object.assign(wallet, { sendBeginBatch, witnessReceive, createUtxos, decodeRGBInvoice });
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: true, outpoint: { txid: 'cd'.repeat(32), vout: 1 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 100_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 33_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(createUtxos).not.toHaveBeenCalled();
		expect(witnessReceive).toHaveBeenCalledWith({
			assetId,
			amount: 67_000_000,
			minConfirmations: 1
		});
		expect(sendBeginBatch).toHaveBeenCalledWith(
			expect.objectContaining({
				donation: false,
				feeRate: 2,
				recipientMap: expect.objectContaining({
					[assetId]: [
						expect.objectContaining({ assignment: { Fungible: 33_000_000 } }),
						expect.objectContaining({
							assignment: { Fungible: 67_000_000 },
							witnessData: { amountSat: '1000' }
						})
					]
				})
			})
		);
	});

	it('creates a colorable coin at 2 sat/vB before a partial send when none is free', async () => {
		const wallet = walletDouble();
		const order: string[] = [];
		const sendBeginBatch = vi.fn(async () => {
			order.push('batch');
			return 'cHNidP-split';
		});
		const witnessReceive = vi.fn(async () => {
			order.push('witness');
			return { recipientId: 'wvout:own', batchTransferIdx: 4 };
		});
		const createUtxos = vi.fn(async () => {
			order.push('create');
			return 1;
		});
		const decodeRGBInvoice = vi.fn(async () => ({
			recipientId: 'utxob:payee',
			transportEndpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc']
		}));
		Object.assign(wallet, { sendBeginBatch, witnessReceive, createUtxos, decodeRGBInvoice });
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'cd'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 100_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 33_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(order).toEqual(['create', 'witness', 'batch']);
		expect(createUtxos).toHaveBeenCalledWith({ upTo: false, num: 1, size: 1000, feeRate: 2 });
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(wallet.signPsbt).toHaveBeenCalled();
	});

	it('says how to fix it when a change coin still cannot be created', async () => {
		const wallet = walletDouble();
		const createUtxos = vi.fn(async () => {
			throw new Error('insufficient bitcoins');
		});
		const decodeRGBInvoice = vi.fn(async () => ({
			recipientId: 'utxob:payee',
			transportEndpoints: ['rpcs://rgb-proxy.utexo.com/json-rpc']
		}));
		const witnessReceive = vi.fn(async () => {
			throw new Error('insufficient allocations');
		});
		const sendBeginBatch = vi.fn();
		Object.assign(wallet, { createUtxos, decodeRGBInvoice, witnessReceive, sendBeginBatch });
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'cd'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 100_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 33_000_000)).rejects.toThrow(
			/Add a little bitcoin so the rest of your dollars/
		);
		expect(createUtxos).toHaveBeenCalledWith({ upTo: false, num: 1, size: 1000, feeRate: 2 });
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(wallet.signPsbt).not.toHaveBeenCalled();
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
		expect(sendBeginBatch).not.toHaveBeenCalled();
	});
});
