import { describe, expect, it } from 'vitest';
import { mergedTransactionRows } from '$lib/components/wallet/transaction-rows';
import { pullShouldRefresh } from '$lib/components/wallet/pull-refresh';

const TX = 'ab'.repeat(32);
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

describe('mergedTransactionRows', () => {
	it('merges USDT and bitcoin into one list, newest first', () => {
		const rows = mergedTransactionRows(
			[
				{
					id: 'btc-old',
					type: 'send',
					amountSats: 10_000,
					timestamp: NOW - 2 * 86_400_000,
					description: 'Bitcoin transfer',
					txHash: TX
				},
				{
					id: 'usdt-new',
					type: 'receive',
					amountSats: 0,
					assetUnits: 11_000_000,
					timestamp: NOW - 3_600_000,
					description: 'RGB transfer',
					txHash: TX,
					status: 'pending'
				}
			],
			{ btcUsd: 83_000, now: NOW, locale: 'en', satsWord: 'sats', unavailable: 'price unavailable' }
		);

		expect(rows.map((row) => row.asset)).toEqual(['USDT', 'BTC']);
		expect(rows[0].detail).toBe('');
		expect(rows[0]).toMatchObject({
			direction: 'received',
			primary: '$11.00',
			secondary: '11.00 USDT',
			status: 'pending'
		});
		expect(rows[1]).toMatchObject({
			direction: 'sent',
			primary: '$8.30',
			secondary: '10,000 sats'
		});
		expect(rows[0].when.length).toBeGreaterThan(0);
		expect(rows[1].when.length).toBeGreaterThan(0);
	});

	it('shows 100 USDT as $100 and does not price those units as bitcoin', () => {
		const txid = `1526488b${'b'.repeat(56)}`;
		const [row] = mergedTransactionRows(
			[
				{
					id: 'usdt-100',
					type: 'receive',
					amountSats: 199_691,
					assetUnits: 100_000_000,
					timestamp: NOW,
					description: 'RGB transfer',
					txHash: txid,
					status: 'confirmed'
				}
			],
			{ btcUsd: 85_000, now: NOW, locale: 'en', satsWord: 'sats', unavailable: 'price unavailable' }
		);
		expect(row.asset).toBe('USDT');
		expect(row.primary).toBe('$100.00');
		expect(row.secondary).toBe('100.00 USDT');
	});

	it('keeps the dollar line when the bitcoin price is missing', () => {
		const [row] = mergedTransactionRows(
			[
				{
					id: 'btc',
					type: 'receive',
					amountSats: 9_347,
					timestamp: NOW - 60_000,
					description: 'Bitcoin transfer'
				}
			],
			{ btcUsd: null, now: NOW, locale: 'en', satsWord: 'sats', unavailable: 'price unavailable' }
		);
		expect(row.primary).toBe('price unavailable');
		expect(row.secondary).toBe('9,347 sats');
		expect(row.direction).toBe('received');
	});

	it('drops a repeated transfer and only links a real txid', () => {
		const rows = mergedTransactionRows(
			[
				{
					id: 'a',
					type: 'send',
					amountSats: 1000,
					timestamp: NOW,
					description: 'Bitcoin transfer',
					txHash: TX
				},
				{
					id: 'b',
					type: 'send',
					amountSats: 1000,
					timestamp: NOW,
					description: 'Bitcoin transfer',
					txHash: TX
				},
				{
					id: 'c',
					type: 'send',
					amountSats: 500,
					timestamp: NOW - 1000,
					description: 'Bitcoin transfer',
					txHash: 'not-a-txid'
				}
			],
			{ btcUsd: 50_000, now: NOW, locale: 'en', satsWord: 'sats', unavailable: 'price unavailable' }
		);
		expect(rows).toHaveLength(2);
		expect(rows[0].explorerUrl).toBe(`https://esplora-api.utexo.com/tx/${TX}`);
		expect(rows[0].txid).toBe(TX);
		expect(rows[1].explorerUrl).toBeNull();
		expect(rows[1].txid).toBeNull();
	});

	it('shows an escrow hold sentence', () => {
		const rows = mergedTransactionRows(
			[
				{
					id: 'escrow:sofa:lock',
					type: 'escrow_lock',
					amountSats: 0,
					assetUnits: 50_000_000,
					timestamp: NOW,
					description: 'Held for: Sofa, collect by Oct 25',
					status: 'pending'
				}
			],
			{ btcUsd: 50_000, now: NOW, locale: 'en', satsWord: 'sats', unavailable: 'price unavailable' }
		);
		expect(rows[0].detail).toBe('Held for: Sofa, collect by Oct 25');
		expect(rows[0].primary).toBe('$50.00');
	});
});

describe('pullShouldRefresh', () => {
	it('refreshes after a downward pull while the page is at the top', () => {
		expect(pullShouldRefresh({ startY: 20, currentY: 100, scrollY: 0 })).toBe(true);
		expect(pullShouldRefresh({ startY: 20, currentY: 40, scrollY: 0 })).toBe(false);
		expect(pullShouldRefresh({ startY: 20, currentY: 120, scrollY: 40 })).toBe(false);
	});
});
