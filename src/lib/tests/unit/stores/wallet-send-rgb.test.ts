import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	onchainSendBegin,
	signPsbt,
	onchainSendEnd,
	listAssets,
	prepareRgbOnchainSend,
	loadAssets,
	persistWalletSnapshot,
	updateWallet,
	confirmSignetTx
} = vi.hoisted(() => ({
	onchainSendBegin: vi.fn().mockResolvedValue('cHNidP-unsigned'),
	signPsbt: vi.fn().mockResolvedValue('cHNidP-signed'),
	onchainSendEnd: vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32) }),
	listAssets: vi.fn(),
	prepareRgbOnchainSend: vi.fn().mockResolvedValue(undefined),
	loadAssets: vi.fn().mockResolvedValue(undefined),
	persistWalletSnapshot: vi.fn().mockResolvedValue(undefined),
	updateWallet: vi.fn(),
	confirmSignetTx: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/wallet/wallet-state', () => ({
	state: { utexoWallet: { listAssets, onchainSendBegin, signPsbt, onchainSendEnd } },
	walletStore: { subscribe: () => () => {}, update: updateWallet }
}));

vi.mock('$lib/stores/wallet/prepare-rgb-send', () => ({
	prepareRgbOnchainSend
}));

vi.mock('$lib/stores/wallet/wallet-balances', () => ({
	loadAssets,
	persistWalletSnapshot
}));

vi.mock('$lib/stores/wallet/signet-broadcast', () => ({
	confirmSignetTx
}));

import { sendRgbAsset } from '$lib/stores/wallet/wallet-send';

const heldIfa = {
	nia: [],
	ifa: [
		{
			assetId: 'rgb:f~9F4X0C-held-usdt',
			ticker: 'USDT',
			precision: 6,
			balance: { spendable: 100_000_000 }
		}
	]
};

describe('sendRgbAsset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb:buHqKXhJ-configured-usdt');
		listAssets.mockResolvedValue(heldIfa);
		onchainSendEnd.mockResolvedValue({ txid: 'ab'.repeat(32) });
		confirmSignetTx.mockResolvedValue(undefined);
	});

	it('pays nWca as 1111 IFA units and persists only after sendEnd', async () => {
		const sent = await sendRgbAsset({
			invoice:
				'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa?assignment_name=assetOwner&expiry=1790661182&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc',
			assetId: 'rgb:buHqKXhJ-configured-usdt',
			amount: 100_000_000
		});

		expect(prepareRgbOnchainSend).toHaveBeenCalledWith(expect.anything(), 'rgb:f~9F4X0C-held-usdt');
		expect(onchainSendBegin).toHaveBeenCalledWith({
			invoice: expect.stringContaining('nWca'),
			assetId: 'rgb:f~9F4X0C-held-usdt',
			amount: 1111,
			feeRate: 2,
			minConfirmations: 1
		});
		expect(signPsbt).toHaveBeenCalledWith('cHNidP-unsigned');
		expect(onchainSendEnd).toHaveBeenCalledWith({ signedPsbt: 'cHNidP-signed' });
		expect(confirmSignetTx).toHaveBeenCalledWith('ab'.repeat(32));
		expect(persistWalletSnapshot).toHaveBeenCalledOnce();
		expect(sent.txid).toHaveLength(64);
		expect(loadAssets).not.toHaveBeenCalled();
		expect(updateWallet).toHaveBeenCalledOnce();
	});

	it('does not record a send when the indexer has no transaction', async () => {
		confirmSignetTx.mockRejectedValueOnce(
			new Error(`Signet indexer has no transaction ${'ab'.repeat(32)}`)
		);
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('Signet indexer has no transaction');
		expect(onchainSendEnd).toHaveBeenCalledOnce();
		expect(persistWalletSnapshot).not.toHaveBeenCalled();
		expect(updateWallet).not.toHaveBeenCalled();
		expect(loadAssets).not.toHaveBeenCalled();
	});

	it('does not report success when sendEnd has no txid', async () => {
		onchainSendEnd.mockResolvedValueOnce({ created: 4 });
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('sendEnd did not return a txid');
		expect(persistWalletSnapshot).not.toHaveBeenCalled();
		expect(updateWallet).not.toHaveBeenCalled();
	});

	it('uses the only IFA row on a blank invoice', async () => {
		listAssets.mockResolvedValueOnce({
			nia: [],
			ifa: [
				{
					assetId: 'rgb:f~9F4X0C-held-usdt',
					ticker: '',
					balance: { spendable: 0, settled: 100_000_000 }
				}
			]
		});
		await sendRgbAsset({
			invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
			assetId: 'rgb:not-the-ifa',
			amount: 1111
		});
		expect(onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({
				assetId: 'rgb:f~9F4X0C-held-usdt',
				amount: 1111
			})
		);
	});

	it('refuses a zero amount and a NIA-only wallet', async () => {
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/aa/sb:utxob:example-invoice',
				assetId: 'rgb:buHqKXhJ-configured-usdt',
				amount: 1_000_000
			})
		).rejects.toThrow('RGB invoice amount is zero');
		listAssets.mockResolvedValueOnce({
			nia: [
				{ assetId: 'rgb:buHqKXhJ-configured-usdt', ticker: 'USDT', balance: { spendable: 10 } }
			],
			ifa: []
		});
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: 'rgb:buHqKXhJ-configured-usdt'
			})
		).rejects.toThrow('Select the funded IFA USDT');
		expect(onchainSendBegin).not.toHaveBeenCalled();
	});

	it('refuses an amount above the spendable USDT and does not broadcast', async () => {
		listAssets.mockResolvedValueOnce({
			nia: [],
			ifa: [
				{
					assetId: 'rgb:f~9F4X0C-held-usdt',
					ticker: 'USDT',
					precision: 6,
					balance: { spendable: 100 }
				}
			]
		});
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:example-invoice',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('USDT amount is larger than the spendable balance.');
		expect(onchainSendBegin).not.toHaveBeenCalled();
	});

	it('refuses a destination that is not an RGB invoice', async () => {
		await expect(
			sendRgbAsset({
				invoice: 'tb1pnotaninvoice',
				assetId: '',
				amount: 1
			})
		).rejects.toThrow('Tether destination must be an RGB invoice.');
		expect(onchainSendBegin).not.toHaveBeenCalled();
	});
});
