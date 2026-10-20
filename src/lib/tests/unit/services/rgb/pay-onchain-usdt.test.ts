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
			'Only 0.00 USDT spendable, 110.00 is on spent outputs'
		);
		expect(wallet.refreshWallet).not.toHaveBeenCalled();
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
			expect.objectContaining({ assetId, amount: 11_000_000 })
		);
	});

	it('refuses a partial send when the colored coin cannot pay a change output', async () => {
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
			}
		]);
		wallet.listAssets.mockResolvedValue({
			ifa: [{ assetId, balance: { spendable: 70_000_000 } }]
		});
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 2_000_000)).rejects.toThrow(
			/come back/
		);
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
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

	it('sends after the seal is still unspent', async () => {
		const wallet = walletDouble();
		await expect(payOnchainUsdt(wallet, 'rgb:invoice', assetId, 1_000_000)).resolves.toEqual({
			kind: 'txid',
			value: 'ef'.repeat(32)
		});
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ assetId, amount: 1_000_000, invoice: 'rgb:invoice' })
		);
	});
});
