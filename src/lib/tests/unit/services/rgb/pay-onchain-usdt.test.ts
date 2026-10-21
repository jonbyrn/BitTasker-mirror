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
			/leaves the rest stuck/
		);
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
	});

	it('refuses a partial send, syncs, and leaves the remainder spendable', async () => {
		const wallet = walletDouble();
		const sendBeginBatch = vi.fn();
		const witnessReceive = vi.fn();
		const failTransfers = vi.fn();
		let spendable = 70_000_000;
		const syncWallet = vi.fn(async () => {
			spendable = 70_000_000;
		});
		Object.assign(wallet, { sendBeginBatch, witnessReceive, failTransfers, syncWallet });
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
			ifa: [{ assetId, balance: { spendable } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 2_000_000)).rejects.toThrow(
			/leaves the rest stuck/
		);
		await syncWallet();
		expect(spendable).toBe(70_000_000);
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(wallet.signPsbt).not.toHaveBeenCalled();
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
		expect(witnessReceive).not.toHaveBeenCalled();
		expect(sendBeginBatch).not.toHaveBeenCalled();
		expect(failTransfers).not.toHaveBeenCalled();
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

	it('does not build a partial send of 33 when 100 is spendable', async () => {
		const wallet = walletDouble();
		const sendBeginBatch = vi.fn();
		const witnessReceive = vi.fn();
		const createUtxos = vi.fn();
		let spendable = 100_000_000;
		wallet.syncWallet.mockImplementation(async () => {
			spendable = 100_000_000;
		});
		Object.assign(wallet, { sendBeginBatch, witnessReceive, createUtxos });
		wallet.listUnspents.mockResolvedValue([
			{
				rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: spendable } }],
				utxo: { exists: true, colorable: true, outpoint: { txid: seal, vout: 0 } }
			},
			{
				rgbAllocations: [],
				utxo: { exists: true, colorable: false, outpoint: { txid: 'cd'.repeat(32), vout: 0 } }
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 33_000_000)).rejects.toThrow(
			/leaves the rest stuck/
		);
		await wallet.syncWallet();
		expect(spendable).toBe(100_000_000);
		expect(createUtxos).not.toHaveBeenCalled();
		expect(witnessReceive).not.toHaveBeenCalled();
		expect(sendBeginBatch).not.toHaveBeenCalled();
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(wallet.signPsbt).not.toHaveBeenCalled();
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
	});
});
