import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '$lib/stores/wallet/wallet-state';
import { ContractRune, leadingContractStatus } from '$lib/runes/contract.svelte';
import { payEscrowLightning } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';
import { FAUCET_IFA_ASSET } from '$lib/stores/wallet/signet-lsp';
import { prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';

vi.mock('$lib/stores/wallet/signet-lsp', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/wallet/signet-lsp')>();
	return {
		...actual,
		payEscrowLightning: vi.fn().mockResolvedValue('mapping-1')
	};
});

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: vi.fn().mockResolvedValue({ id: 'evt-lifecycle' }),
	publishToMultipleRelays: vi.fn().mockResolvedValue([{ success: true }])
}));

vi.mock('$lib/stores/wallet/prepare-rgb-send', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/wallet/prepare-rgb-send')>();
	return {
		...actual,
		prepareRgbOnchainSend: vi.fn(async () => undefined)
	};
});

const PAYOUT = 'rgb:~/~/aa/sb:utxob:payout-invoice';
const BLANK_LOCK =
	'rgb:~/~/aa/sb:utxob:taskee-blank?assignment_name=assetOwner&expiry=1790968181&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
const PRICED = 'rgb:~/~/nWca/sb:utxob:priced-send?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
const ASSET_ID = 'rgb:h95CRali-KmzB~7j-minted';

function walletDouble() {
	return {
		onchainReceive: vi.fn().mockResolvedValue({ invoice: PAYOUT, recipientId: 'recv-1' }),
		createLightningInvoice: vi.fn(),
		onchainSend: vi.fn().mockResolvedValue({ txid: 'a'.repeat(64), batchTransferIdx: 0 }),
		refreshWallet: vi.fn().mockResolvedValue(undefined),
		listChannels: vi.fn().mockResolvedValue([{ isUsable: true, assetId: ESCROW_LNUSDT }]),
		listPeers: vi.fn().mockResolvedValue([{ pubkey: '02aa' }]),
		decodeLnInvoice: vi.fn(),
		payLightningInvoice: vi.fn().mockResolvedValue({
			txid: 'ln-paid',
			status: 'settled',
			preimage: 'preimage-1',
			paymentHash: 'hash-1'
		}),
		onchainSendBegin: vi.fn().mockResolvedValue('cHNidP'),
		signPsbt: vi.fn().mockResolvedValue('cHNidP-signed'),
		onchainSendEnd: vi.fn().mockResolvedValue({ txid: 'ab'.repeat(32) }),
		listAssets: vi.fn().mockResolvedValue({
			nia: [
				{
					assetId: ASSET_ID,
					ticker: 'E2E',
					balance: { spendable: 10_000, settled: 10_000, future: 0 }
				}
			]
		})
	};
}

describe('leadingContractStatus', () => {
	it('keeps submitted work when a later funding attestation arrives', () => {
		expect(leadingContractStatus(['work_submitted', 'funding'])).toBe('work_submitted');
	});

	it('moves forward to released', () => {
		expect(leadingContractStatus(['funding', 'funded', 'work_submitted', 'released'])).toBe(
			'released'
		);
	});

	it('lets a terminal cancel beat in-progress work and ignores failed or disputed', () => {
		expect(leadingContractStatus(['work_submitted', 'funding', 'failed', 'disputed'])).toBe(
			'work_submitted'
		);
		expect(leadingContractStatus(['work_submitted', 'cancelled'])).toBe('cancelled');
		expect(leadingContractStatus(['cancelled', 'settled'])).toBe('settled');
	});
});

describe('escrow lifecycle', () => {
	beforeEach(() => {
		ContractRune.clearRegistry();
		vi.mocked(payEscrowLightning).mockClear();
		state.utexoWallet = walletDouble() as never;
		delete (window as Window & { __E2E_TASKEE_INVOICE?: string }).__E2E_TASKEE_INVOICE;
		delete (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID;
	});

	it('rejects release before a settlement invoice exists', async () => {
		const rune = new ContractRune({
			contractId: 'contract-release-early',
			totalAmountUsd: 10,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'funded';
		await expect(rune.releaseEscrow()).rejects.toThrow('Cannot release escrow from funded');
		expect(rune.status).toBe('funded');
	});

	it('pays the taskee blank invoice and does not invoice the tasker wallet', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const rune = new ContractRune({
			contractId: 'contract-taskee-invoice',
			totalAmountUsd: 3.588,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		const prepared = await rune.prepareFunding(BLANK_LOCK);
		expect(wallet.onchainReceive).not.toHaveBeenCalled();
		expect(prepared.fundingInvoice).toBe(BLANK_LOCK);
		expect(prepared.seals[0]?.amount).toBe(4);

		const paid = await rune.payFundingFromWallet();
		expect(paid.status).toBe('locked');
		expect(paid.fundingInvoice).toBe(BLANK_LOCK);
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
	});

	it('funds a zero invoice without an LSP channel', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		wallet.listChannels.mockResolvedValue([]);
		const rune = new ContractRune({
			contractId: 'contract-blank-lock',
			totalAmountUsd: 1,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await rune.prepareFunding(BLANK_LOCK);
		const paid = await rune.payFundingFromWallet();
		expect(paid.status).toBe('locked');
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
	});

	it('does not call sendAsset when the LSP channel is closed', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		wallet.listChannels.mockResolvedValue([]);
		const rune = new ContractRune({
			contractId: 'contract-channel-closed',
			totalAmountUsd: 11,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await rune.prepareFunding(PRICED);
		const paid = await rune.payFundingFromWallet();
		expect(paid.status).toBe('locked');
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
	});

	it('attaches a blank taskee invoice without spendable USDT', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		wallet.listAssets.mockResolvedValueOnce({ nia: [] });
		const rune = new ContractRune({
			contractId: 'contract-lock-only',
			totalAmountUsd: 11,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		const invoice = 'rgb:~/~/aa/sb:utxob:taskee-blank';
		const prepared = await rune.prepareFunding(invoice);
		expect(prepared.fundingInvoice).toBe(invoice);
		expect(prepared.fundingState).toBe('awaiting_payment');
		expect(wallet.onchainSend).not.toHaveBeenCalled();
		expect(wallet.onchainReceive).not.toHaveBeenCalled();
	});

	it('pays an eleven dollar bid in USDT base units, not sats', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		wallet.listAssets.mockResolvedValue({
			nia: [
				{
					assetId: 'rgb:usdt-signet',
					ticker: 'USDT',
					precision: 6,
					balance: { spendable: 20_000_000, settled: 20_000_000, future: 0 }
				}
			]
		});
		const rune = new ContractRune({
			contractId: 'contract-usd-units',
			totalAmountUsd: 11,
			lockedAmount: 11,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await rune.prepareFunding(PRICED);
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		expect(payEscrowLightning).not.toHaveBeenCalled();
		rune.status = 'approved';
		await rune.requestSettlement(PRICED, 11_000_000);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(prepareRgbOnchainSend).toHaveBeenCalledWith(wallet, 'rgb:usdt-signet');
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ invoice: PRICED, assetId: 'rgb:usdt-signet', amount: 11_000_000 })
		);
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('creates a faucet RGB invoice for an approved ten dollar contract', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const rune = new ContractRune({
			contractId: 'contract-request-payment',
			totalAmountUsd: 10,
			lockedAmount: 10,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'approved';
		wallet.onchainReceive.mockResolvedValueOnce({ invoice: PRICED, recipientId: 'recv-1' });
		await expect(rune.createPayoutInvoice()).resolves.toBe(PRICED);
		expect(wallet.onchainReceive).toHaveBeenCalledWith(
			expect.objectContaining({
				assetId: FAUCET_IFA_ASSET,
				amount: 10_000_000,
				witness: false
			})
		);
		expect(wallet.createLightningInvoice).not.toHaveBeenCalled();
		expect(rune.snapshot.status).toBe('settlement_requested');
	});

	it('says lightning is not ready instead of calling a missing invoice method', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		delete (wallet as { createLightningInvoice?: unknown }).createLightningInvoice;
		const rune = lightningContract('contract-lightning-missing');
		rune.status = 'approved';
		await expect(rune.createPayoutInvoice()).rejects.toThrow('Lightning not ready');
		expect(wallet.onchainReceive).not.toHaveBeenCalled();
	});

	it('pays an eleven dollar bid from IFA USDT when nia is empty', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const ifaId = 'rgb:f~9F4X0C-signet-usdt';
		wallet.listAssets.mockResolvedValue({
			nia: [],
			ifa: [
				{
					assetId: ifaId,
					ticker: 'USDT',
					precision: 6,
					balance: { spendable: 100_000_000, settled: 100_000_000, future: 0 }
				}
			]
		});
		const rune = new ContractRune({
			contractId: 'contract-ifa-units',
			totalAmountUsd: 11,
			lockedAmount: 11,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await rune.prepareFunding(PRICED);
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		rune.status = 'approved';
		await rune.requestSettlement(PRICED, 11_000_000);
		await rune.releaseEscrow();
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ assetId: ifaId, amount: 11_000_000 })
		);
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('pays a sat-labeled bid as the asset spendable units', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const rune = new ContractRune({
			contractId: 'contract-sat-units',
			totalAmountUsd: 11,
			amountSats: 3075,
			lockedAmount: 3075,
			lockedCurrency: 'SATS',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await rune.prepareFunding(PRICED);
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		rune.status = 'approved';
		await rune.requestSettlement(PRICED, 10_000);
		await rune.releaseEscrow();
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({ assetId: ASSET_ID, amount: 10_000 })
		);
		expect(String(wallet.onchainSendBegin.mock.calls[0]?.[0]?.assetId)).not.toBe(ESCROW_LNUSDT);
	});

	it('refuses to create the escrow invoice on the tasker wallet', async () => {
		const rune = new ContractRune({
			contractId: 'contract-self-invoice',
			totalAmountUsd: 10,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await expect(rune.prepareFunding()).rejects.toThrow('Taskee escrow invoice is not ready');
	});

	it('lets check payment continue after pay has already marked the contract funded', async () => {
		const rune = new ContractRune({
			contractId: 'contract-already-funded',
			totalAmountUsd: 10,
			split: {
				primaryAsset: 'btc_onchain',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'funded';

		const checked = await rune.confirmFunding();
		expect(checked.status).toBe('funded');
	});

	it('stores deliverable metadata and pays the settlement invoice on release', async () => {
		const rune = new ContractRune({
			contractId: 'contract-lifecycle',
			totalAmountUsd: 10,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'locked';

		const submitted = await rune.submitWork('Finished', 'https://example.com/proof');
		expect(submitted.status).toBe('work_submitted');
		expect(submitted.workMessage).toBe('Finished');
		expect(submitted.proofUrl).toBe('https://example.com/proof');
		expect((await rune.approveWork()).status).toBe('approved');
		await rune.requestSettlement(PRICED, 10_000_000);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(released.proofs[0]?.kind).toBe('txid');
		expect(released.payoutInvoice).toBe(PRICED);
	});

	function lightningContract(id: string) {
		return new ContractRune({
			contractId: id,
			totalAmountUsd: 11,
			amountSats: 3075,
			lockedAmount: 3075,
			lockedCurrency: 'SATS',
			split: {
				primaryAsset: 'btc_lightning',
				primaryPercentage: 100,
				secondaryAsset: 'usdt_rgb',
				secondaryPercentage: 0
			}
		});
	}

	function liveBolt11(sats = 3075, payee = '02aa') {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const nowSec = Math.floor(Date.now() / 1000);
		wallet.decodeLnInvoice.mockResolvedValue({
			paymentHash: 'aa',
			amtMsat: sats * 1000,
			timestamp: nowSec,
			expirySeconds: 3600,
			payee
		});
		wallet.listChannels.mockResolvedValue([{ isUsable: true }]);
		return wallet;
	}

	it('locks a lightning bid without paying, then pays on release', async () => {
		const wallet = liveBolt11();
		const invoice = 'lntbs30u1dollar';
		const rune = lightningContract('contract-lightning-dollar');
		await rune.prepareFunding(invoice);
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		rune.status = 'approved';
		await rune.requestSettlement(invoice, 3075);
		const released = await rune.releaseEscrow();
		expect(wallet.payLightningInvoice).toHaveBeenCalledWith({ lnInvoice: invoice });
		expect(released.status).toBe('released');
		expect(released.proofs[0]).toMatchObject({ kind: 'preimage', value: 'preimage-1' });
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('pays a service bitcoin escrow on release and never sendAsset', async () => {
		const wallet = liveBolt11();
		const invoice = 'lntbs30u1service';
		const rune = lightningContract('contract-service-bitcoin');
		await rune.prepareFunding(invoice);
		await rune.payFundingFromWallet();
		rune.status = 'approved';
		await rune.requestSettlement(invoice, 3075);
		await rune.releaseEscrow();
		expect(wallet.payLightningInvoice).toHaveBeenCalledWith({ lnInvoice: invoice });
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('rejects an rgb invoice on the sats rail and a bolt11 on the RGB rail', async () => {
		const rune = lightningContract('contract-wrong-prefix');
		await expect(rune.prepareFunding('rgb:~/~/aa/sb:utxob:taskee-blank')).rejects.toThrow(
			'Sats escrow requires a Lightning invoice'
		);
		const usdt = new ContractRune({
			contractId: 'contract-wrong-ln',
			totalAmountUsd: 11,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		await expect(usdt.prepareFunding('lntbs30u1example')).rejects.toThrow(
			'USDT escrow requires an rgb: invoice'
		);
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('blocks sats fund when peers and channels are both empty', async () => {
		const wallet = liveBolt11();
		wallet.listPeers.mockResolvedValue([]);
		wallet.listChannels.mockResolvedValue([]);
		const rune = lightningContract('contract-no-peer');
		await rune.prepareFunding('lntbs30u1empty');
		await rune.payFundingFromWallet();
		rune.status = 'approved';
		await rune.requestSettlement('lntbs30u1empty', 3075);
		await expect(rune.releaseEscrow()).rejects.toThrow('Lightning node has no peer');
		expect(rune.status).toBe('settlement_requested');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(rune.status).not.toBe('funded');
	});

	it('refuses a bolt11 when the only channel is LNUSDT', async () => {
		const wallet = liveBolt11();
		wallet.listChannels.mockResolvedValue([{ isUsable: true, assetId: ESCROW_LNUSDT }]);
		const rune = lightningContract('contract-lnusdt-only');
		await rune.prepareFunding('lntbs30u1lnusdt');
		await rune.payFundingFromWallet();
		rune.status = 'approved';
		await rune.requestSettlement('lntbs30u1lnusdt', 3075);
		await expect(rune.releaseEscrow()).rejects.toThrow('Lightning node has no channel');
		expect(rune.status).toBe('settlement_requested');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('refuses a bolt11 paid to the bot pubkey', async () => {
		const wallet = liveBolt11(
			3075,
			'023bafd0d9d2a72958ff8332b9a36972152b410c91e332da1716d3f7ea0831b650'
		);
		const rune = lightningContract('contract-bot-bolt11');
		await rune.prepareFunding('lntbs30u1bot');
		await rune.payFundingFromWallet();
		rune.status = 'approved';
		await rune.requestSettlement('lntbs30u1bot', 3075);
		await expect(rune.releaseEscrow()).rejects.toThrow('Lightning peer is refused');
		expect(rune.status).toBe('settlement_requested');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('rejects a bolt11 whose amount or expiry does not match the locked sats', async () => {
		const wallet = liveBolt11(1000);
		const mismatch = lightningContract('contract-amount-mismatch');
		await mismatch.prepareFunding('lntbs30u1mismatch');
		await mismatch.payFundingFromWallet();
		mismatch.status = 'approved';
		await mismatch.requestSettlement('lntbs30u1mismatch', 3075);
		await expect(mismatch.releaseEscrow()).rejects.toThrow(
			'Lightning invoice amount does not match the locked sats'
		);
		expect(mismatch.status).toBe('settlement_requested');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();

		const expired = lightningContract('contract-expired');
		wallet.decodeLnInvoice.mockResolvedValue({
			paymentHash: 'aa',
			amtMsat: 3_075_000,
			timestamp: 1_000,
			expirySeconds: 60,
			payee: '02aa'
		});
		await expired.prepareFunding('lntbs30u1expired');
		await expired.payFundingFromWallet();
		expired.status = 'approved';
		await expired.requestSettlement('lntbs30u1expired', 3075);
		await expect(expired.releaseEscrow()).rejects.toThrow('Lightning invoice is expired');
		expect(expired.status).toBe('settlement_requested');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
	});

	it('pays a lightning release and keeps the preimage', async () => {
		const wallet = liveBolt11();
		const rune = lightningContract('contract-ln-release');
		rune.status = 'approved';
		await rune.requestSettlement('lntbs30u1payout', 3075);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(released.payoutInvoice).toBe('lntbs30u1payout');
		expect(wallet.payLightningInvoice).toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
		const wrong = lightningContract('contract-ln-release-rgb');
		wrong.status = 'approved';
		await expect(wrong.releaseEscrow('rgb:~/~/aa/sb:utxob:payout')).rejects.toThrow(
			'Sats escrow requires a Lightning invoice'
		);
	});

	it('pays LN USDT through the LSP asset and leaves the faucet IFA on chain', async () => {
		const rune = new ContractRune({
			contractId: 'contract-ln-usdt',
			totalAmountUsd: 11,
			lockedAmount: 11,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_ln',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'approved';
		await rune.requestSettlement(PRICED, 11_000_000);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(released.proofs[0]).toMatchObject({ kind: 'lsp_mapping', value: 'mapping-1' });
		expect(payEscrowLightning).toHaveBeenCalledWith(PRICED, ESCROW_LNUSDT, 11_000_000);
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
	});

	it('creates an LN-USDT Lightning invoice for the agreed amount and pays it once', async () => {
		const rune = new ContractRune({
			contractId: 'contract-ln-usdt-invoice',
			totalAmountUsd: 11,
			lockedAmount: 11,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_ln',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		wallet.createLightningInvoice.mockResolvedValue({ lnInvoice: 'lntb1usdtamount' });
		wallet.decodeLnInvoice.mockResolvedValue({
			payee: '02aa',
			assetId: ESCROW_LNUSDT,
			assetAmount: 11_000_000,
			expirySeconds: 3600
		});
		rune.status = 'approved';
		const invoice = await rune.createPayoutInvoice();
		expect(invoice).toBe('lntb1usdtamount');
		expect(wallet.createLightningInvoice).toHaveBeenCalledWith({
			expirySeconds: 3600,
			asset: { assetId: ESCROW_LNUSDT, amount: 11_000_000 }
		});
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(wallet.payLightningInvoice).toHaveBeenCalledOnce();
		expect(wallet.payLightningInvoice).toHaveBeenCalledWith({
			lnInvoice: 'lntb1usdtamount',
			assetId: ESCROW_LNUSDT,
			assetAmount: 11_000_000
		});
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('cancels an agreed contract without sending', async () => {
		const rune = new ContractRune({
			contractId: 'contract-cancel',
			totalAmountUsd: 10,
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'locked';
		const cancelled = await rune.cancel();
		expect(cancelled.status).toBe('cancelled');
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		expect(wallet.onchainSendBegin).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});
});
