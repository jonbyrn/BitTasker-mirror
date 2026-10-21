import { beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '$lib/tests/helpers/memory-storage';
import { clearWalletAccountCache } from '$lib/stores/wallet/wallet-account';
import {
	rememberIncomingReceives,
	rememberedIncomingTransfers,
	rememberUsdtSend,
	rememberedUsdtSends
} from '$lib/stores/wallet/wallet-transactions';
import type { Transaction } from '$lib/stores/wallet/wallet-types';

function send(txHash: string, units: number): Transaction {
	return {
		id: txHash,
		type: 'send',
		amountSats: 0,
		assetUnits: units,
		timestamp: Date.UTC(2026, 9, 18),
		status: 'pending',
		txHash,
		description: 'rgb usdt'
	};
}

const TASKER = 'aa'.repeat(32);
const NEW_ACCOUNT = 'bb'.repeat(32);

describe('wallet account cache', () => {
	beforeEach(() => {
		installMemoryStorage();
	});

	it('keeps USDT sends on the pubkey that broadcast them', () => {
		localStorage.setItem('bittasker.usdt-sends', JSON.stringify([send(TASKER, 10_000_000)]));
		rememberUsdtSend(send(NEW_ACCOUNT, 1_000_000), 'npub1new');

		expect(localStorage.getItem('bittasker.usdt-sends')).toBeNull();
		expect(rememberedUsdtSends('npub1tasker')).toEqual([]);
		expect(rememberedUsdtSends('npub1new').map((row) => row.txHash)).toEqual([NEW_ACCOUNT]);
	});

	it('keeps a USDT receive on the pubkey that was paid', () => {
		const paid = 'ee'.repeat(32);
		rememberIncomingReceives(
			[{ kind: 'ReceiveBlind', status: 'Settled', txid: paid, assignments: [{ amount: 1_000_000 }] }],
			'npub1new'
		);
		rememberIncomingReceives(
			[
				{
					kind: 'ReceiveBlind',
					status: 'Settled',
					txid: 'ff'.repeat(32),
					assignments: [{ amount: 10_000_000 }]
				}
			],
			'npub1tasker'
		);
		expect(rememberedIncomingTransfers('npub1new')).toEqual([
			expect.objectContaining({ txid: paid })
		]);
		expect(rememberedIncomingTransfers('npub1tasker')).toHaveLength(1);
		expect(localStorage.getItem('bittasker.usdt-receives')).toBeNull();
	});

	it('clears that pubkey on logout and leaves another pubkey stored', () => {
		rememberUsdtSend(send(TASKER, 10_000_000), 'npub1tasker');
		rememberIncomingReceives(
			[
				{
					kind: 'ReceiveBlind',
					status: 'Settled',
					txid: TASKER,
					assignments: [{ amount: 1_000_000 }]
				}
			],
			'npub1tasker'
		);
		rememberUsdtSend(send(NEW_ACCOUNT, 1_000_000), 'npub1new');
		localStorage.setItem('rgb-escrow-invoice:bid', 'rgb:invoice');
		clearWalletAccountCache('npub1tasker');
		expect(rememberedUsdtSends('npub1tasker')).toEqual([]);
		expect(rememberedIncomingTransfers('npub1tasker')).toEqual([]);
		expect(rememberedUsdtSends('npub1new').map((row) => row.txHash)).toEqual([NEW_ACCOUNT]);
		expect(localStorage.getItem('rgb-escrow-invoice:bid')).toBeNull();
	});
});
