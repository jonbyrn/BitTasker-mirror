import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '$lib/stores/wallet/wallet-state';
import { ContractRune as ServiceRune } from '$lib/services/rgb/contract-rune';
import { ContractRune } from '$lib/runes/contract.svelte';

vi.mock('$lib/stores/wallet/prepare-rgb-send', () => ({
	prepareRgbOnchainSend: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: vi.fn().mockResolvedValue({ id: 'evt-lifecycle' }),
	publishToMultipleRelays: vi.fn().mockResolvedValue([{ success: true }])
}));

const PAYOUT = 'rgb:~/~/aa/sb:utxob:payout-invoice';
const ASSET_ID = 'rgb:h95CRali-KmzB~7j-minted';

function walletDouble() {
	return {
		onchainReceive: vi.fn().mockResolvedValue({ invoice: PAYOUT, recipientId: 'recv-1' }),
		onchainSend: vi.fn().mockResolvedValue({ txid: 'a'.repeat(64), batchTransferIdx: 0 }),
		refreshWallet: vi.fn().mockResolvedValue(undefined),
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

describe('escrow lifecycle', () => {
	beforeEach(() => {
		ServiceRune.clearRegistry();
		ContractRune.clearRegistry();
		state.utexoWallet = walletDouble() as never;
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
});
