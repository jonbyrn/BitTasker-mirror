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
			`${seal}:0 was already spent on-chain by ${spentBy}`
		);
		expect(wallet.refreshWallet).toHaveBeenCalled();
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
