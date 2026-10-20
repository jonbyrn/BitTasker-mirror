import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deadlineWithoutAbort } from '$lib/utils/contract/v2/completeTaskRelay';
import {
	FundEscrowTimeoutError,
	decideFundRetry,
	fundEscrowErrorKey,
	loadFundGuardSnapshot,
	presentFundEscrowFailure,
	readFundAttempt,
	rememberFundAttempt,
	resetFundEscrowGuardForTests,
	trackFundSend,
	type FundGuardReader,
	type FundGuardSnapshot
} from '$lib/utils/contract/v2/fundEscrowGuard';

const SENDER = '0x1111111111111111111111111111111111111111';
const CONTRACT = '0x2222222222222222222222222222222222222222';

function snapshot(overrides: Partial<FundGuardSnapshot> = {}): FundGuardSnapshot {
	return {
		localSendInFlight: false,
		storedNonce: null,
		storedTxHash: null,
		latestNonce: 0,
		pendingNonce: 0,
		receiptStatus: null,
		txFound: false,
		onChainEscrow: false,
		chainCheckComplete: true,
		...overrides
	};
}

function reader(overrides: Partial<FundGuardReader> = {}): FundGuardReader {
	return {
		getTransactionCount: vi.fn(async () => 4),
		getTransaction: vi.fn(async () => null),
		getTransactionReceipt: vi.fn(async () => null),
		getBlockNumber: vi.fn(async () => 100),
		getLogs: vi.fn(async () => []),
		...overrides
	};
}

describe('fund escrow guard', () => {
	beforeEach(() => {
		resetFundEscrowGuardForTests();
	});

	it('times out a hung funding call without aborting it or reloading', async () => {
		const abort = vi.fn();
		const reload = vi.fn();
		const hanging = new Promise<string>(() => {});

		await expect(
			deadlineWithoutAbort(
				() => hanging,
				25,
				() => new FundEscrowTimeoutError(25)
			)
		).rejects.toThrow(/Funding request timed out after 1 seconds/);
		expect(abort).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('allows a retry after the previous funding transaction reverted', () => {
		expect(decideFundRetry(snapshot({ storedNonce: 4, receiptStatus: 0, latestNonce: 5 }))).toEqual(
			{
				action: 'allow'
			}
		);
	});

	it('blocks a second fund while the first send is in flight', async () => {
		let release: (value: string) => void = () => {};
		const pending = new Promise<string>((resolve) => {
			release = resolve;
		});
		trackFundSend('task-1', pending);
		expect(decideFundRetry(snapshot({ localSendInFlight: true }))).toEqual({
			action: 'block',
			reason: 'in_flight'
		});
		release('done');
		await pending;
	});

	it('does not fund again when the saved nonce is pending or the escrow is already mined', async () => {
		expect(
			decideFundRetry(
				snapshot({
					storedNonce: 7,
					latestNonce: 7,
					pendingNonce: 8
				})
			)
		).toEqual({ action: 'block', reason: 'pending' });

		expect(
			decideFundRetry(
				snapshot({
					storedTxHash: '0xabc',
					txFound: true,
					receiptStatus: null
				})
			)
		).toEqual({ action: 'block', reason: 'pending' });

		expect(decideFundRetry(snapshot({ receiptStatus: 1, storedTxHash: '0xabc' }))).toEqual({
			action: 'block',
			reason: 'already_funded'
		});

		const mined = reader({
			getTransactionCount: vi.fn(async (_address, blockTag) => (blockTag === 'pending' ? 5 : 5)),
			getTransaction: vi.fn(async (hash) =>
				hash === '0xmined' ? { from: SENDER, nonce: 4 } : null
			),
			getLogs: vi.fn(async () => [{ transactionHash: '0xmined' }])
		});
		rememberFundAttempt('task-2', {
			sender: SENDER,
			nonce: 4,
			txHash: null,
			contractAddress: CONTRACT,
			fromBlock: 90,
			taskee: '0x3333333333333333333333333333333333333333'
		});
		const loaded = await loadFundGuardSnapshot({
			reader: mined,
			attempt: readFundAttempt('task-2'),
			localSendInFlight: false
		});
		expect(decideFundRetry(loaded)).toEqual({ action: 'block', reason: 'already_funded' });
	});

	it('keeps the retry blocked when the nonce was consumed and the chain check failed', () => {
		expect(
			decideFundRetry(
				snapshot({
					storedNonce: 3,
					latestNonce: 4,
					pendingNonce: 4,
					chainCheckComplete: false
				})
			)
		).toEqual({ action: 'block', reason: 'pending' });
	});

	it('shows a sticky Retry toast and does not reload', () => {
		const reload = vi.fn();
		const showErrorToast = vi.fn();
		const retry = vi.fn();
		presentFundEscrowFailure({
			showErrorToast,
			message: 'Could not fund this contract. Your details are still here.',
			retry
		});
		expect(reload).not.toHaveBeenCalled();
		expect(showErrorToast).toHaveBeenCalledWith(
			'Could not fund this contract. Your details are still here.',
			0,
			expect.objectContaining({
				actions: [expect.objectContaining({ label: 'dashboard.bids.bid_acceptance.retry' })]
			})
		);
		expect(fundEscrowErrorKey('timeout')).toBe('dashboard.bids.bid_acceptance.error_timeout');
		expect(fundEscrowErrorKey('already_funded')).toBe(
			'dashboard.bids.bid_acceptance.error_already_funded'
		);

		const formSource = readFileSync(
			resolve(
				dirname(fileURLToPath(import.meta.url)),
				'../../../../../components/bidding/BidAcceptanceFormV2.svelte'
			),
			'utf8'
		);
		expect(formSource).not.toContain('location.reload');
		expect(formSource).toContain('presentFundEscrowFailure');
		expect(formSource).toContain('fundSendBlocked');
	});
});
