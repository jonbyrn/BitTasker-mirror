import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '$lib/stores/wallet/wallet-state';
import {
	clearPaidProofs,
	ContractRune,
	leadingContractStatus,
	readPaidTxid
} from '$lib/runes/contract.svelte';
import { payEscrowLightning } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT } from '$lib/services/rgb/escrow-rail';
import { FAUCET_IFA_ASSET } from '$lib/stores/wallet/signet-lsp';
import { prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';
import { esploraTxConfirmed } from '$lib/stores/wallet/signet-broadcast';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import { encodeRgbAmount } from '$lib/stores/wallet/decode-rgb-invoice';

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

vi.mock('$lib/stores/wallet/signet-broadcast', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/wallet/signet-broadcast')>();
	return {
		...actual,
		esploraTxConfirmed: vi.fn(async () => true)
	};
});

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
function unitsInvoice(units: number): string {
	return `rgb:~/~/${encodeRgbAmount(units)}/sb:utxob:priced-send?endpoints=rpcs://rgb-proxy.utexo.com/json-rpc`;
}
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

	it('keeps a running payout ahead of a cancel from the other party', () => {
		expect(leadingContractStatus(['releasing', 'cancelled'])).toBe('releasing');
		expect(leadingContractStatus(['cancelled', 'released'])).toBe('released');
		expect(leadingContractStatus(['work_submitted', 'cancelled'])).toBe('cancelled');
	});
});

describe('escrow lifecycle', () => {
	beforeEach(() => {
		clearPaidProofs();
		vi.mocked(esploraTxConfirmed).mockReset();
		vi.mocked(esploraTxConfirmed).mockResolvedValue(true);
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

	it('refuses a blank taskee invoice before any lock', async () => {
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
		await expect(rune.prepareFunding(BLANK_LOCK)).rejects.toThrow(
			'Invoice amount does not match the contract'
		);
		expect(rune.status).toBe('failed');
		expect(wallet.onchainReceive).not.toHaveBeenCalled();
		expect(wallet.onchainSend).not.toHaveBeenCalled();
		expect(payEscrowLightning).not.toHaveBeenCalled();
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
		await expect(rune.prepareFunding(BLANK_LOCK)).rejects.toThrow(
			'Invoice amount does not match the contract'
		);
		expect(rune.status).toBe('failed');
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
		await rune.prepareFunding(unitsInvoice(11_000_000));
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
		await expect(rune.prepareFunding(invoice)).rejects.toThrow(
			'Invoice amount does not match the contract'
		);
		expect(rune.status).toBe('failed');
		expect(wallet.onchainSend).not.toHaveBeenCalled();
		expect(wallet.onchainReceive).not.toHaveBeenCalled();
	});

	it('publishes the taskee invoice so the tasker can connect it later', async () => {
		vi.mocked(prepareRgbOnchainSend).mockClear();
		const rune = new ContractRune({
			contractId: 'contract-invoice-wire',
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
		const invoice = unitsInvoice(11_000_000);
		await rune.prepareFunding(invoice);
		const signed = vi.mocked(getSignedEvent).mock.calls.at(-1)?.[0] as { content?: string };
		const published = JSON.parse(signed.content ?? '{}') as {
			seals?: Array<{ invoice?: string }>;
		};
		expect(published.seals?.[0]?.invoice).toBe(invoice);
		rune.seals = rune.seals.map((seal) => ({ ...seal, invoice: undefined }));
		expect(rune.snapshot.fundingInvoice).toBeUndefined();
		await rune.attachFundingInvoice(invoice);
		expect(rune.snapshot.fundingInvoice).toBe(invoice);
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		expect(prepareRgbOnchainSend).not.toHaveBeenCalled();
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
		await rune.prepareFunding(unitsInvoice(11_000_000));
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		expect(payEscrowLightning).not.toHaveBeenCalled();
		rune.status = 'approved';
		await rune.requestSettlement(unitsInvoice(11_000_000), 11_000_000);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(prepareRgbOnchainSend).toHaveBeenCalledWith(
			wallet,
			'rgb:usdt-signet',
			undefined,
			expect.any(Function),
			11_000_000
		);
		expect(wallet.onchainSendBegin).toHaveBeenCalledWith(
			expect.objectContaining({
				invoice: unitsInvoice(11_000_000),
				assetId: 'rgb:usdt-signet',
				amount: 11_000_000
			})
		);
		expect(payEscrowLightning).not.toHaveBeenCalled();
	});

	it('locks the contract paid when the broadcast txid exists and the relay rejects it', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const rune = new ContractRune({
			contractId: 'contract-paid-lock',
			totalAmountUsd: 13,
			lockedAmount: 13,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'approved';
		await rune.requestSettlement(unitsInvoice(13_000_000), 13_000_000);
		vi.mocked(publishToMultipleRelays).mockResolvedValueOnce([]);
		await expect(rune.releaseEscrow()).rejects.toThrow(
			'Contract status could not be published to any Nostr relay'
		);
		const txid = 'ab'.repeat(32);
		expect(rune.status).toBe('released');
		expect(readPaidTxid(rune.contractId)).toBe(txid);
		expect(rune.snapshot.proofs).toEqual([expect.objectContaining({ kind: 'txid', value: txid })]);
		const sends = wallet.onchainSendEnd.mock.calls.length;
		rune.status = 'settlement_requested';
		const again = await rune.releaseEscrow();
		expect(again.status).toBe('released');
		expect(wallet.onchainSendEnd.mock.calls.length).toBe(sends);
	});

	it('adopts an unconfirmed payout without sending again', async () => {
		vi.mocked(esploraTxConfirmed).mockResolvedValue(false);
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble> & {
			listTransfers: ReturnType<typeof vi.fn>;
		};
		const txid = 'ef'.repeat(32);
		const invoice = unitsInvoice(4_000_000);
		wallet.listTransfers = vi.fn(async () => [
			{
				kind: 'Send',
				status: 'WaitingConfirmations',
				txid,
				requestedAssignment: { amount: 4_000_000 }
			}
		]);
		const rune = new ContractRune({
			contractId: 'contract-open-payout',
			totalAmountUsd: 4,
			lockedAmount: 4,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'approved';
		await rune.requestSettlement(invoice, 4_000_000);
		const pending = await rune.adoptOpenPayout();
		expect(pending.status).toBe('releasing');
		expect(readPaidTxid(rune.contractId)).toBe(txid);
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
	});

	it('uses a send that already left for this invoice', async () => {
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble> & {
			listTransfers: ReturnType<typeof vi.fn>;
		};
		const txid = 'cd'.repeat(32);
		const invoice = unitsInvoice(4_000_000);
		wallet.listTransfers = vi.fn(async () => [
			{
				kind: 'Send',
				status: 'WaitingConfirmations',
				invoiceString: invoice,
				txid
			}
		]);
		const rune = new ContractRune({
			contractId: 'contract-already-sent',
			totalAmountUsd: 4,
			lockedAmount: 4,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			}
		});
		rune.status = 'approved';
		await rune.requestSettlement(invoice, 4_000_000);
		const paid = await rune.releaseEscrow();
		expect(paid.status).toBe('released');
		expect(readPaidTxid(rune.contractId)).toBe(txid);
		expect(wallet.onchainSendEnd).not.toHaveBeenCalled();
	});

	it('stays releasing until the payout transaction is confirmed', async () => {
		vi.mocked(esploraTxConfirmed).mockResolvedValue(false);
		const wallet = state.utexoWallet as ReturnType<typeof walletDouble>;
		const rune = new ContractRune({
			contractId: 'contract-releasing',
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
		rune.status = 'approved';
		await rune.requestSettlement(unitsInvoice(11_000_000), 11_000_000);
		const pending = await rune.releaseEscrow();
		expect(pending.status).toBe('releasing');
		expect(wallet.onchainSendEnd).toHaveBeenCalledOnce();
		const published = vi.mocked(getSignedEvent).mock.calls.map((call) => {
			const request = call[0] as { content?: string };
			return JSON.parse(request.content ?? '{}') as { status?: string };
		});
		expect(published.some((row) => row.status === 'releasing')).toBe(true);
		const sends = wallet.onchainSendEnd.mock.calls.length;
		const again = await rune.releaseEscrow();
		expect(again.status).toBe('releasing');
		expect(wallet.onchainSendEnd.mock.calls.length).toBe(sends);
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
		const payout = unitsInvoice(10_000_000);
		wallet.onchainReceive.mockResolvedValueOnce({ invoice: payout, recipientId: 'recv-1' });
		await expect(rune.createPayoutInvoice()).resolves.toBe(payout);
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
		await rune.prepareFunding(unitsInvoice(11_000_000));
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		rune.status = 'approved';
		await rune.requestSettlement(unitsInvoice(11_000_000), 11_000_000);
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
		await rune.prepareFunding(unitsInvoice(3075));
		expect((await rune.payFundingFromWallet()).status).toBe('locked');
		rune.status = 'approved';
		await rune.requestSettlement(unitsInvoice(10_000), 10_000);
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
		await rune.requestSettlement(unitsInvoice(10_000_000), 10_000_000);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(released.proofs[0]?.kind).toBe('txid');
		expect(released.payoutInvoice).toBe(unitsInvoice(10_000_000));
	});

	it('keeps the last shared status when the relay does not acknowledge a settlement', async () => {
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
		rune.status = 'approved';
		vi.mocked(publishToMultipleRelays).mockResolvedValueOnce([]);
		await expect(rune.requestSettlement(unitsInvoice(10_000_000), 10_000_000)).rejects.toThrow(
			/could not be published/
		);
		expect(rune.snapshot.status).toBe('approved');
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
		await rune.requestSettlement(unitsInvoice(11_000_000), 11_000_000);
		const released = await rune.releaseEscrow();
		expect(released.status).toBe('released');
		expect(released.proofs[0]).toMatchObject({ kind: 'lsp_mapping', value: 'mapping-1' });
		expect(payEscrowLightning).toHaveBeenCalledWith(
			unitsInvoice(11_000_000),
			ESCROW_LNUSDT,
			11_000_000
		);
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
