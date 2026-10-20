import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	onchainSendBegin,
	sendBegin,
	signPsbt,
	onchainSendEnd,
	createUtxos,
	sendBtc,
	listAssets,
	getAssetBalance,
	prepareRgbOnchainSend,
	loadAssets,
	persistWalletSnapshot,
	updateWallet,
	confirmSignetTx,
	extractSignedTx,
	publishSignetTx
} = vi.hoisted(() => ({
	onchainSendBegin: vi.fn().mockResolvedValue('cHNidP-unsigned'),
	sendBegin: vi.fn().mockResolvedValue('cHNidP-sendBegin'),
	signPsbt: vi.fn().mockResolvedValue('cHNidP-signed'),
	onchainSendEnd: vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32) }),
	createUtxos: vi.fn(),
	sendBtc: vi.fn(),
	listAssets: vi.fn(),
	getAssetBalance: vi.fn(),
	prepareRgbOnchainSend: vi.fn().mockResolvedValue(undefined),
	loadAssets: vi.fn().mockResolvedValue(undefined),
	persistWalletSnapshot: vi.fn().mockResolvedValue(undefined),
	updateWallet: vi.fn(),
	confirmSignetTx: vi.fn().mockResolvedValue(undefined),
	extractSignedTx: vi.fn(() => ({ txid: 'ab'.repeat(32), hex: '0200000001' })),
	publishSignetTx: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/wallet/wallet-state', () => ({
	state: {
		utexoWallet: {
			listAssets,
			getAssetBalance,
			onchainSendBegin,
			sendBegin,
			signPsbt,
			onchainSendEnd,
			createUtxos,
			sendBtc
		}
	},
	walletStore: { subscribe: () => () => {}, update: updateWallet }
}));

vi.mock('$lib/stores/wallet/prepare-rgb-send', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/wallet/prepare-rgb-send')>();
	return { ...actual, prepareRgbOnchainSend };
});

vi.mock('$lib/stores/wallet/wallet-balances', () => ({
	loadAssets,
	persistWalletSnapshot,
	acceptNextUsdtDrop: vi.fn(),
	flushWalletState: vi.fn().mockResolvedValue(false),
	pullIncomingTransfers: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/wallet/signet-broadcast', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/wallet/signet-broadcast')>();
	return {
		...actual,
		confirmSignetTx,
		extractSignedTx,
		publishSignetTx
	};
});

import { encodeRgbAmount } from '$lib/stores/wallet/decode-rgb-invoice';
import {
	balanceSpendable,
	quoteSpendable,
	rgbSendBlock,
	sendEnabled,
	sendRgbAsset
} from '$lib/stores/wallet/wallet-send';
import { state } from '$lib/stores/wallet/wallet-state';

const heldIfa = {
	nia: [],
	ifa: [
		{
			assetId: 'rgb:f~9F4X0C-held-usdt',
			ticker: 'USDT',
			precision: 6,
			balance: { spendable: 1111 }
		}
	]
};

describe('sendRgbAsset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb:buHqKXhJ-configured-usdt');
		listAssets.mockResolvedValue(heldIfa);
		getAssetBalance.mockReset();
		onchainSendEnd.mockResolvedValue({ txid: 'ab'.repeat(32) });
		confirmSignetTx.mockResolvedValue(undefined);
	});

	const NWCA_RPCS =
		'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa?assignment_name=assetOwner&expiry=1790661182&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';

	it('pays nWca as 1111 IFA units and persists only after sendEnd', async () => {
		const sent = await sendRgbAsset({
			invoice: NWCA_RPCS,
			assetId: 'rgb:buHqKXhJ-configured-usdt',
			amount: 100_000_000
		});

		expect(prepareRgbOnchainSend).toHaveBeenCalledWith(
			expect.anything(),
			'rgb:f~9F4X0C-held-usdt',
			1111,
			undefined,
			1111
		);
		expect(onchainSendBegin).toHaveBeenCalledWith({
			invoice: NWCA_RPCS,
			assetId: 'rgb:f~9F4X0C-held-usdt',
			amount: 1111,
			feeRate: 2,
			minConfirmations: 1
		});
		expect(onchainSendBegin.mock.calls[0][0]).not.toHaveProperty('witnessData');
		expect(sendBegin).not.toHaveBeenCalled();
		expect(createUtxos).not.toHaveBeenCalled();
		expect(sendBtc).not.toHaveBeenCalled();
		expect(signPsbt).toHaveBeenCalledWith('cHNidP-unsigned');
		expect(onchainSendEnd).toHaveBeenCalledWith({ signedPsbt: 'cHNidP-signed' });
		expect(extractSignedTx).toHaveBeenCalledWith('cHNidP-signed');
		expect(publishSignetTx).toHaveBeenCalledWith('0200000001');
		expect(confirmSignetTx).toHaveBeenCalledWith('ab'.repeat(32));
		expect(publishSignetTx.mock.invocationCallOrder[0]).toBeLessThan(
			confirmSignetTx.mock.invocationCallOrder[0]
		);
		expect(persistWalletSnapshot).toHaveBeenCalledOnce();
		expect(sent.txid).toHaveLength(64);
		expect(loadAssets).toHaveBeenCalledOnce();
		expect(updateWallet).toHaveBeenCalledOnce();
	});

	it('calls onchainSendBegin and not sendBegin', async () => {
		await sendRgbAsset({
			invoice: NWCA_RPCS,
			assetId: 'rgb:buHqKXhJ-configured-usdt',
			amount: 1111
		});
		expect(onchainSendBegin).toHaveBeenCalledWith({
			invoice: NWCA_RPCS,
			assetId: 'rgb:f~9F4X0C-held-usdt',
			amount: 1111,
			feeRate: 2,
			minConfirmations: 1
		});
		expect(sendBegin).not.toHaveBeenCalled();
		expect(signPsbt).toHaveBeenCalledWith('cHNidP-unsigned');
		expect(onchainSendEnd).toHaveBeenCalledWith({ signedPsbt: 'cHNidP-signed' });
		expect(onchainSendBegin.mock.invocationCallOrder[0]).toBeLessThan(
			signPsbt.mock.invocationCallOrder[0]
		);
		expect(signPsbt.mock.invocationCallOrder[0]).toBeLessThan(
			onchainSendEnd.mock.invocationCallOrder[0]
		);
		expect(publishSignetTx.mock.invocationCallOrder[0]).toBeLessThan(
			persistWalletSnapshot.mock.invocationCallOrder[0]
		);
	});

	it('keeps rpcs endpoints when onchainSendBegin rejects the transport', async () => {
		onchainSendBegin.mockRejectedValueOnce(new Error('No valid transport endpoint found'));
		await expect(
			sendRgbAsset({
				invoice: NWCA_RPCS,
				assetId: 'rgb:buHqKXhJ-configured-usdt',
				amount: 1111
			})
		).rejects.toThrow('No valid transport endpoint found');
		expect(onchainSendBegin).toHaveBeenCalledOnce();
		expect(onchainSendBegin.mock.calls[0][0].invoice).toBe(NWCA_RPCS);
		expect(String(onchainSendBegin.mock.calls[0][0].invoice)).not.toContain('https://');
		expect(signPsbt).not.toHaveBeenCalled();
		expect(onchainSendEnd).not.toHaveBeenCalled();
		expect(publishSignetTx).not.toHaveBeenCalled();
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
		expect(publishSignetTx).toHaveBeenCalledOnce();
		expect(persistWalletSnapshot).not.toHaveBeenCalled();
		expect(updateWallet).not.toHaveBeenCalled();
		expect(loadAssets).not.toHaveBeenCalled();
	});

	it('does not treat a sendEnd hash as sent when Esplora refuses the broadcast', async () => {
		publishSignetTx.mockRejectedValueOnce(new Error('send tx: no inputs'));
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('send tx: no inputs');
		expect(confirmSignetTx).not.toHaveBeenCalled();
		expect(persistWalletSnapshot).not.toHaveBeenCalled();
		expect(updateWallet).not.toHaveBeenCalled();
	});

	it('does not broadcast when onchainSendEnd fails', async () => {
		onchainSendEnd.mockRejectedValueOnce(new Error('end failed after broadcast'));
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('end failed after broadcast');
		expect(publishSignetTx).not.toHaveBeenCalled();
		expect(confirmSignetTx).not.toHaveBeenCalled();
		expect(persistWalletSnapshot).not.toHaveBeenCalled();
	});

	it('does not broadcast when onchainSendEnd txid is not the signed transaction', async () => {
		onchainSendEnd.mockResolvedValueOnce({ txid: 'cd'.repeat(32) });
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('onchainSendEnd txid is not the signed transaction');
		expect(publishSignetTx).not.toHaveBeenCalled();
		expect(confirmSignetTx).not.toHaveBeenCalled();
		expect(persistWalletSnapshot).not.toHaveBeenCalled();
	});

	it('does not report success when sendEnd has no txid', async () => {
		onchainSendEnd.mockResolvedValueOnce({ created: 4 });
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:rt2mOpmI-aaaa',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('onchainSendEnd did not return a txid');
		expect(publishSignetTx).not.toHaveBeenCalled();
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
					balance: { spendable: 1111, settled: 1111 }
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

	it('enables a 10 USDT invoice when spendable is 100 and a receive is stuck', () => {
		const transfers = [
			{ kind: 'ReceiveBlind', status: 'WaitingConfirmations' },
			{ kind: 'ReceiveBlind', status: 'Settled' }
		];
		expect(transfers.some((row) => row.status === 'WaitingConfirmations')).toBe(true);
		expect(
			balanceSpendable({
				spendable: 100_000_000,
				settled: 100_000_000,
				future: 200_000_000
			})
		).toBe(100_000_000);
		expect(sendEnabled(100_000_000, 10_000_000)).toBe(true);
		expect(sendEnabled(100_000_000, 200_000_000)).toBe(false);
	});

	it('sends the invoice asset when the configured id is not in the wallet', async () => {
		const faucet = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';
		getAssetBalance
			.mockResolvedValueOnce({
				spendable: 10_000_000,
				settled: 10_000_000,
				future: 10_000_000
			})
			.mockResolvedValue({
				spendable: 0,
				settled: 0,
				future: 0
			});
		listAssets.mockResolvedValue({ nia: [], ifa: [] });
		await sendRgbAsset({
			invoice: `rgb:${faucet.slice(4)}/~/${encodeRgbAmount(10_000_000)}/sb:utxob:7efSNuJ~-aaaa`,
			assetId: 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs',
			amount: 10_000_000
		});
		expect(getAssetBalance).toHaveBeenCalledWith(faucet);
		expect(onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ assetId: faucet, amount: 10_000_000 })
		);
		expect(onchainSendBegin).not.toHaveBeenCalledWith(
			expect.objectContaining({
				assetId: 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs'
			})
		);
	});

	it('uses listAssets spendable when getAssetBalance does not know the id', async () => {
		getAssetBalance.mockRejectedValueOnce(
			new Error('Asset with id rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs not found')
		);
		await expect(
			quoteSpendable(state.utexoWallet, 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs')
		).resolves.toBe(1111);
	});

	it('pays from getAssetBalance spendable when listAssets spendable is zero', async () => {
		getAssetBalance.mockResolvedValueOnce({
			spendable: 10_000_000,
			settled: 10_000_000,
			future: 0
		});
		listAssets.mockResolvedValueOnce({
			nia: [],
			ifa: [
				{
					assetId: 'rgb:f~9F4X0C-held-usdt',
					ticker: 'USDT',
					precision: 6,
					balance: { spendable: 0, settled: 100_000_000, future: 200_000_000 }
				}
			]
		});
		await sendRgbAsset({
			invoice: `rgb:~/-/${encodeRgbAmount(10_000_000)}/sb:utxob:7efSNuJ~-aaaa`,
			assetId: '',
			amount: 10_000_000
		});
		expect(prepareRgbOnchainSend).toHaveBeenCalledWith(
			expect.anything(),
			'rgb:f~9F4X0C-held-usdt',
			10_000_000,
			undefined,
			10_000_000
		);
	});

	it('refuses a send while spendable is still zero', async () => {
		listAssets.mockResolvedValue({
			nia: [],
			ifa: [
				{
					assetId: 'rgb:f~9F4X0C-held-usdt',
					ticker: 'USDT',
					precision: 6,
					balance: { spendable: 0, settled: 0, future: 100_000_000 }
				}
			]
		});
		await expect(
			sendRgbAsset({
				invoice: 'rgb:~/~/nWca/sb:utxob:example-invoice',
				assetId: '',
				amount: 1111
			})
		).rejects.toThrow('Not spendable yet');
		expect(onchainSendBegin).not.toHaveBeenCalled();
	});

	it('refuses an amount above the spendable USDT and does not broadcast', async () => {
		listAssets.mockResolvedValue({
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

describe('rgbSendBlock', () => {
	const assetId = 'rgb:usdt';

	it('blocks a partial send before the wallet builds it', async () => {
		const hold = await rgbSendBlock(
			{
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
						utxo: {
							exists: true,
							colorable: true,
							btcAmount: 691,
							outpoint: { txid: 'ab'.repeat(32), vout: 1 }
						}
					}
				]
			},
			assetId,
			100_000_000,
			20_000_000
		);
		expect(hold).toBe('partial');
	});

	it('names a coin still held by an old receive code', async () => {
		const hold = await rgbSendBlock(
			{
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
						pendingBlinded: 1,
						utxo: {
							exists: true,
							colorable: true,
							btcAmount: 1000,
							outpoint: { txid: 'ab'.repeat(32), vout: 1 }
						}
					}
				]
			},
			assetId,
			100_000_000,
			20_000_000
		);
		expect(hold).toBe('locked');
	});

	it('quotes zero when the only allocation is already spent', async () => {
		const assetId = 'rgb:usdt';
		const txid = 'ab'.repeat(32);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ spent: true, txid: 'cd'.repeat(32) })
			})
		);
		try {
			const units = await quoteSpendable(
				{
					getAssetBalance: async () => ({ spendable: 100_000_000 }),
					listUnspents: async () => [
						{
							rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 100_000_000 } }],
							utxo: { exists: true, colorable: true, outpoint: { txid, vout: 1 } }
						}
					]
				},
				assetId
			);
			expect(units).toBe(0);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('blocks a partial send from the quoted balance when no coin is listed', async () => {
		const hold = await rgbSendBlock(
			{ listUnspents: async () => [] },
			assetId,
			100_000_000,
			30_000_000
		);
		expect(hold).toBe('partial');
	});

	it('stays quiet when the whole balance is the payment', async () => {
		const hold = await rgbSendBlock(
			{
				listUnspents: async () => [
					{
						rgbAllocations: [{ assetId, assignment: { type: 'Fungible', amount: 20_000_000 } }],
						utxo: {
							exists: true,
							colorable: true,
							btcAmount: 691,
							outpoint: { txid: 'ab'.repeat(32), vout: 1 }
						}
					}
				]
			},
			assetId,
			20_000_000,
			20_000_000
		);
		expect(hold).toBe('');
	});
});
