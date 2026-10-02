import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '$lib/stores/wallet/wallet-state';
import { ContractRune as ServiceRune } from '$lib/services/rgb/contract-rune';
import { ContractRune, leadingContractStatus } from '$lib/runes/contract.svelte';
import { payEscrowLightning } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';

vi.mock('$lib/stores/wallet/signet-lsp', () => ({
	payEscrowLightning: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: vi.fn().mockResolvedValue({ id: 'evt-lifecycle' }),
	publishToMultipleRelays: vi.fn().mockResolvedValue([{ success: true }])
}));

const PAYOUT = 'rgb:~/~/aa/sb:utxob:payout-invoice';
const BLANK_LOCK =
	'rgb:~/~/aa/sb:utxob:taskee-blank?assignment_name=assetOwner&expiry=1790968181&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
const PRICED = 'rgb:~/~/nWca/sb:utxob:priced-send?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc';
const ASSET_ID = 'rgb:h95CRali-KmzB~7j-minted';

function walletDouble() {
	return {
		onchainReceive: vi.fn().mockResolvedValue({ invoice: PAYOUT, recipientId: 'recv-1' }),
		onchainSend: vi.fn().mockResolvedValue({ txid: 'a'.repeat(64), batchTransferIdx: 0 }),
		refreshWallet: vi.fn().mockResolvedValue(undefined),
		listChannels: vi.fn().mockResolvedValue([{ isUsable: true, assetId: ESCROW_LNUSDT }]),
		listPeers: vi.fn().mockResolvedValue([{ pubkey: '02aa' }]),
		decodeLnInvoice: vi.fn(),
		payLightningInvoice: vi.fn().mockResolvedValue({ txid: 'ln-paid', status: 'settled' }),
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

	it('ignores failed, cancelled, and disputed', () => {
		expect(
			leadingContractStatus(['work_submitted', 'funding', 'failed', 'cancelled', 'disputed'])
		).toBe('work_submitted');
	});
});

describe('escrow lifecycle', () => {
	beforeEach(() => {
		ServiceRune.clearRegistry();
		ContractRune.clearRegistry();
		vi.mocked(payEscrowLightning).mockClear();
		state.utexoWallet = walletDouble() as never;
		delete (window as Window & { __E2E_TASKEE_INVOICE?: string }).__E2E_TASKEE_INVOICE;
		delete (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID;
	});

	it('submits work, invoices a blank payout, and releases the full asset', async () => {
		const rune = new ServiceRune(ASSET_ID, 10_000);
		rune.attest('funded');

		const submitted = rune.submitWork('Photos of the finished work', 'https://example.com/proof');
		expect(submitted.status).toBe('work_submitted');
		expect(submitted.workMessage).toBe('Photos of the finished work');
		expect(submitted.proofUrl).toBe('https://example.com/proof');

		expect(rune.approveWork().status).toBe('approved');

		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const invoice = await rune.createPayoutInvoice();
		expect(invoice).toBe(PAYOUT);
		expect(wallet.onchainReceive).toHaveBeenCalledWith({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600
		});
		expect(wallet.onchainReceive.mock.calls[0][0]).not.toHaveProperty('assetId');
		expect(wallet.onchainReceive.mock.calls[0][0]).not.toHaveProperty('amount');

		const released = await rune.releaseEscrow();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
		expect(released.status).toBe('released');
		expect(released.payoutInvoice).toBe(PAYOUT);
	});

	it('rejects release before approval', async () => {
		const rune = new ServiceRune(ASSET_ID, 10_000);
		rune.attest('funded');
		await expect(rune.releaseEscrow()).rejects.toThrow('Cannot release escrow from funded');
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
		expect(paid.status).toBe('funded');
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
		expect(paid.status).toBe('funded');
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
		await expect(rune.payFundingFromWallet()).rejects.toThrow('LSP channel is not open');
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
		await rune.payFundingFromWallet();
		expect(payEscrowLightning).toHaveBeenCalledWith(PRICED, 'rgb:usdt-signet', 11_000_000);
		expect(payEscrowLightning).not.toHaveBeenCalledWith(PRICED, 'rgb:usdt-signet', 3075);
		expect(wallet.onchainSend).not.toHaveBeenCalled();
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
		await rune.payFundingFromWallet();
		expect(payEscrowLightning).toHaveBeenCalledWith(PRICED, ifaId, 11_000_000);
		expect(wallet.onchainSend).not.toHaveBeenCalled();
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
		await rune.payFundingFromWallet();
		expect(payEscrowLightning).toHaveBeenCalledWith(PRICED, ASSET_ID, 10_000);
		expect(wallet.onchainSend).not.toHaveBeenCalled();
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

	it('stores deliverable metadata and settles through the contract rune', async () => {
		const rune = new ContractRune({
			contractId: 'contract-lifecycle',
			totalAmountUsd: 10,
			split: {
				primaryAsset: 'btc_onchain',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'funded';

		const submitted = await rune.submitWork('Finished', 'https://example.com/proof');
		expect(submitted.status).toBe('work_submitted');
		expect(submitted.workMessage).toBe('Finished');
		expect(submitted.proofUrl).toBe('https://example.com/proof');

		expect((await rune.approveWork()).status).toBe('approved');

		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		(window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID = ASSET_ID;
		await rune.createPayoutInvoice();
		expect(wallet.onchainReceive).toHaveBeenCalledWith({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600
		});

		const released = await rune.releaseEscrow();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
		expect(released.status).toBe('released');
		expect(released.payoutInvoice).toBe(PAYOUT);
		delete (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID;
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

	it('pays a lightning dollar bid with payLightningInvoice and never sendAsset', async () => {
		const wallet = liveBolt11();
		const invoice = 'lntbs30u1dollar';
		const rune = lightningContract('contract-lightning-dollar');
		await rune.prepareFunding(invoice);
		await rune.payFundingFromWallet();
		expect(wallet.payLightningInvoice).toHaveBeenCalledWith({ lnInvoice: invoice });
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
	});

	it('pays a service bitcoin escrow with payLightningInvoice and never sendAsset', async () => {
		const wallet = liveBolt11();
		const invoice = 'lntbs30u1service';
		const rune = lightningContract('contract-service-bitcoin');
		await rune.prepareFunding(invoice);
		await rune.payFundingFromWallet();
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
		await expect(rune.payFundingFromWallet()).rejects.toThrow('Lightning node has no peer');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
		expect(rune.status).not.toBe('funded');
	});

	it('refuses a bolt11 when the only channel is LNUSDT', async () => {
		const wallet = liveBolt11();
		wallet.listChannels.mockResolvedValue([{ isUsable: true, assetId: ESCROW_LNUSDT }]);
		const rune = lightningContract('contract-lnusdt-only');
		await rune.prepareFunding('lntbs30u1lnusdt');
		await expect(rune.payFundingFromWallet()).rejects.toThrow('Lightning node has no channel');
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
		await expect(rune.payFundingFromWallet()).rejects.toThrow('Lightning peer is refused');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('rejects a bolt11 whose amount or expiry does not match the locked sats', async () => {
		const wallet = liveBolt11(1000);
		const mismatch = lightningContract('contract-amount-mismatch');
		await mismatch.prepareFunding('lntbs30u1mismatch');
		await expect(mismatch.payFundingFromWallet()).rejects.toThrow(
			'Lightning invoice amount does not match the locked sats'
		);
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
		await expect(expired.payFundingFromWallet()).rejects.toThrow('Lightning invoice is expired');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
	});

	it('attests a lightning release without paying again', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const rune = lightningContract('contract-ln-release');
		rune.status = 'approved';
		const released = await rune.releaseEscrow('lntbs30u1payout');
		expect(released.status).toBe('released');
		expect(released.payoutInvoice).toBe('lntbs30u1payout');
		expect(wallet.payLightningInvoice).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
		const wrong = lightningContract('contract-ln-release-rgb');
		wrong.status = 'approved';
		await expect(wrong.releaseEscrow('rgb:~/~/aa/sb:utxob:payout')).rejects.toThrow(
			'Sats escrow requires a Lightning invoice'
		);
	});
});
