import { describe, expect, it } from 'vitest';
import { snapshotTransactions } from '$lib/stores/wallet/wallet-snapshot';
import { mergeHistory } from '$lib/stores/wallet/wallet-transactions';
import type { Transaction } from '$lib/stores/wallet/wallet-types';

const TXID = '4fe2244f0120fc67c4d0575dc6e6112f2a7dfb20392983f7536209fad157b99d';

function row(overrides: Partial<Transaction>): Transaction {
	return {
		id: TXID,
		type: 'send',
		amountSats: 0,
		timestamp: 1_000,
		status: 'pending',
		txHash: TXID,
		description: 'rgb usdt',
		assetUnits: 11_000_000,
		...overrides
	};
}

describe('mergeHistory', () => {
	it('keeps the pending USDT send when the reload only has the bitcoin anchor', () => {
		const merged = mergeHistory(
			[row({})],
			[
				row({
					id: TXID,
					description: 'Bitcoin transfer',
					assetUnits: undefined,
					amountSats: 1000,
					status: 'pending'
				})
			]
		);
		expect(merged.some((item) => item.description === 'rgb usdt')).toBe(true);
	});

	it('keeps the last history when a reload lists nothing', () => {
		const kept = row({ status: 'confirmed', description: 'RGB transfer' });
		expect(mergeHistory([kept], [])).toEqual([kept]);
	});

	it('drops the pending USDT send once the RGB transfer is listed', () => {
		const merged = mergeHistory(
			[row({})],
			[
				row({
					id: `usdt:${TXID}:send`,
					description: 'RGB transfer',
					status: 'pending',
					timestamp: 2_000
				})
			]
		);
		expect(merged.filter((item) => item.description === 'rgb usdt')).toEqual([]);
		expect(merged[0]?.description).toBe('RGB transfer');
	});

	it('keeps a confirmed payment that the latest list left out', () => {
		const older = row({
			id: 'usdt:older:receive',
			txHash: 'bb'.repeat(32),
			type: 'receive',
			status: 'confirmed',
			description: 'RGB transfer',
			timestamp: 500
		});
		const merged = mergeHistory(
			[older],
			[row({ description: 'Bitcoin transfer', assetUnits: undefined })]
		);
		expect(merged.some((item) => item.txHash === 'bb'.repeat(32))).toBe(true);
	});
});

describe('snapshotTransactions', () => {
	it('keeps the saved transfers when a startup save has none yet', () => {
		const prior = [row({ status: 'confirmed', description: 'RGB transfer' })];
		expect(snapshotTransactions([], prior)).toEqual(prior);
		expect(snapshotTransactions([row({})], prior)).toHaveLength(1);
	});
});
