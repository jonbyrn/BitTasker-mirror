import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import {
	buildChainSortHintsFromSwaps,
	toSortIso,
	mergeChainSortHints,
	loadPersistedChainSortHints,
	persistChainSortHintsMap,
	clearPersistedChainSortHints
} from '$lib/utils/wallet/chainSortHints';
import { StorageKeys } from '$lib/utils/constants/storage';
import {
	applyChainSortHints,
	projectTransactions,
	sortByActivity
} from '$lib/utils/wallet/transactionLedger';
import { statusUI } from '$lib/utils/constants/transactions.constants';
import type { ProcessedTransaction } from '$lib/types/wallet';

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

describe('chainSortHints', () => {
	beforeEach(() => {
		vi.mocked(Preferences.get).mockResolvedValue({ value: null });
		vi.mocked(Preferences.set).mockResolvedValue(undefined);
		vi.mocked(Preferences.remove).mockResolvedValue(undefined);
	});

	it('should normalize unix seconds to ISO', () => {
		expect(toSortIso(1_718_000_000)).toBe(new Date(1_718_000_000_000).toISOString());
	});

	it('should build lockup hint from submarine createdAt', () => {
		const hints = buildChainSortHintsFromSwaps([
			{
				swapType: 'submarine',
				swap: {
					id: 's1',
					status: 'invoice.settled',
					createdAt: '2024-06-05T22:00:00.000Z',
					lockupTxHash: '0x' + 'a'.repeat(64)
				} as never
			}
		]);
		expect(hints.get('0x' + 'a'.repeat(64))).toBe('2024-06-05T22:00:00.000Z');
	});

	it('should build claim hint from reverse updatedAt when completed', () => {
		const claimHash = '0x' + 'b'.repeat(64);
		const hints = buildChainSortHintsFromSwaps([
			{
				swapType: 'reverse',
				swap: {
					id: 'r1',
					status: 'transaction.claimed',
					createdAt: '2024-06-05T23:10:00.000Z',
					updatedAt: '2024-06-05T23:35:00.000Z',
					claimTxHash: claimHash
				} as never
			}
		]);
		expect(hints.get(claimHash)).toBe('2024-06-05T23:35:00.000Z');
	});

	it('should skip pending reverse swaps for claim hints', () => {
		const hints = buildChainSortHintsFromSwaps([
			{
				swapType: 'reverse',
				swap: {
					id: 'r1',
					status: 'swap.created',
					createdAt: '2024-06-05T23:32:00.000Z',
					claimTxHash: '0x' + 'c'.repeat(64)
				} as never
			}
		]);
		expect(hints.size).toBe(0);
	});

	it('should merge hints keeping the newer timestamp', () => {
		const target = new Map([['0xabc', '2024-01-01T00:00:00.000Z']]);
		mergeChainSortHints(target, new Map([['0xabc', '2024-06-05T23:35:00.000Z']]));
		expect(target.get('0xabc')).toBe('2024-06-05T23:35:00.000Z');
	});

	it('should load and persist hints via Preferences', async () => {
		vi.mocked(Preferences.get).mockResolvedValue({
			value: JSON.stringify({ '0xabc': '2024-06-05T23:35:00.000Z' })
		});

		const loaded = await loadPersistedChainSortHints();
		expect(loaded.get('0xabc')).toBe('2024-06-05T23:35:00.000Z');

		await persistChainSortHintsMap(loaded);
		expect(Preferences.set).toHaveBeenCalledWith({
			key: StorageKeys.WALLET_CHAIN_SORT_HINTS,
			value: JSON.stringify({ '0xabc': '2024-06-05T23:35:00.000Z' })
		});

		await clearPersistedChainSortHints();
		expect(Preferences.remove).toHaveBeenCalledWith({
			key: StorageKeys.WALLET_CHAIN_SORT_HINTS
		});
	});

	it('should order receive above awaiting above sent using Nostr-derived hints', () => {
		const claimHash = '0x' + 'd'.repeat(64);
		const lockupHash = '0x' + 'e'.repeat(64);

		const hints = buildChainSortHintsFromSwaps([
			{
				swapType: 'submarine',
				swap: {
					id: 'sub1',
					status: 'invoice.settled',
					createdAt: '2024-06-05T22:00:00.000Z',
					lockupTxHash: lockupHash
				} as never
			},
			{
				swapType: 'reverse',
				swap: {
					id: 'rev-done',
					status: 'transaction.claimed',
					createdAt: '2024-06-05T23:10:00.000Z',
					updatedAt: '2024-06-05T23:35:00.000Z',
					claimTxHash: claimHash
				} as never
			}
		]);

		const chainTx = (
			hash: string,
			ts: string,
			displayType: 'send' | 'swap-claim'
		): ProcessedTransaction =>
			({
				hash,
				from: 'a',
				to: 'b',
				value: hash === claimHash ? '2500' : '2535',
				timestamp: ts,
				status: statusUI.confirmed as unknown as ProcessedTransaction['status'],
				network: hash === claimHash ? 'rsk' : 'lightning',
				type: hash === claimHash ? 'receive' : 'send',
				displayType,
				borderColor: hash === claimHash ? 'success' : 'warning',
				iconConfig: { base: null as never, overlay: null },
				title: hash === claimHash ? 'wallet.received' : 'wallet.sent',
				networkIcon: '',
				networkDisplayName: '',
				explorerUrl: null,
				feeSats: hash === claimHash ? 0 : 119,
				balanceAfter: 0
			}) as unknown as ProcessedTransaction;

		const awaiting = (id: string, ts: string): ProcessedTransaction =>
			({
				hash: `swap-${id}`,
				from: 'boltz',
				to: 'user',
				value: '4700',
				timestamp: ts,
				status: statusUI.pending as unknown as ProcessedTransaction['status'],
				network: 'lightning',
				type: 'receive',
				displayType: 'receive',
				borderColor: 'neutral',
				iconConfig: { base: null as never, overlay: null },
				title: 'wallet.swap.awaiting_payment',
				networkIcon: '',
				networkDisplayName: 'LN',
				explorerUrl: null,
				feeSats: 0,
				balanceAfter: 0,
				swap: { id, type: 'reverse', actions: [], rawStatus: 'swap.created' }
			}) as unknown as ProcessedTransaction;

		const merged = projectTransactions(
			applyChainSortHints(
				[
					chainTx(lockupHash, '2024-06-05T23:25:00.000Z', 'send'),
					chainTx(claimHash, '2024-06-05T23:20:00.000Z', 'swap-claim')
				],
				hints
			),
			[
				awaiting('a', '2024-06-05T23:32:00.000Z'),
				awaiting('b', '2024-06-05T23:32:00.000Z'),
				awaiting('c', '2024-06-05T23:31:00.000Z'),
				awaiting('d', '2024-06-05T23:31:00.000Z')
			],
			4200
		);

		expect(merged[0].hash).toBe(claimHash);
		expect(merged[1].swap?.id).toBe('a');
		expect(merged[merged.length - 1].hash).toBe(lockupHash);
		expect(sortByActivity(merged)[0].hash).toBe(claimHash);
	});
});
