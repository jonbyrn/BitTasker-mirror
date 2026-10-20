/**
 * wallet-formatters.ts — Unit tests for shared wallet formatting utilities.
 */
import { describe, it, expect } from 'vitest';
import {
	formatHistoryAmount,
	formatRelativeTime,
	formatSatsWithUsd,
	isBrandPicture,
	isRgbMovement,
	pickHeroAsset,
	rgbHistoryRows,
	transferMovements,
	historyIdentity,
	uniqueHistory,
	walletHistoryRows,
	shortOutpoint,
	signetTxUrl,
	stableInnerFormat,
	stableWalletAvailableUsd,
	summarizeUtxoKinds
} from '$lib/components/wallet/wallet-formatters';

const satsFormatter = new Intl.NumberFormat('en');
const usdFormatter = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' });
const btcPrice = 50000; // $50,000 per BTC

describe('formatSatsWithUsd', () => {
	it('returns "0 Sats" for zero', () => {
		expect(formatSatsWithUsd(0, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
	});

	it('returns "0 Sats" for null/undefined', () => {
		expect(formatSatsWithUsd(null, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
		expect(formatSatsWithUsd(undefined, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
	});

	it('returns "0 Sats" for negative values', () => {
		expect(formatSatsWithUsd(-100, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
	});

	it('formats sats with USD equivalent', () => {
		// 100,000 sats = 0.001 BTC = $50 at $50k/BTC
		const result = formatSatsWithUsd(100000, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('100,000');
		expect(result).toContain('Sats');
		expect(result).toContain('$50');
	});

	it('accepts string input', () => {
		const result = formatSatsWithUsd('50000', satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
		expect(result).toContain('Sats');
	});
});

describe('stableInnerFormat', () => {
	const emptyCache = {};

	function makeWallet(
		id: string,
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined
	) {
		return { id, balances };
	}

	it('returns "0 Sats" for btc with no balance and no cache', () => {
		const w = makeWallet('w1', { btc: { raw: '0', formatted: '0', loading: false } });
		expect(stableInnerFormat(w, 'btc', emptyCache, satsFormatter, usdFormatter, btcPrice)).toBe(
			'0 Sats'
		);
	});

	it('formats btc balance as sats with USD', () => {
		const w = makeWallet('w1', {
			btc: { raw: '100000', formatted: '0.001', loading: false }
		});
		const result = stableInnerFormat(w, 'btc', emptyCache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('100,000');
		expect(result).toContain('Sats');
	});

	it('formats usdt_rgb as dollar amount', () => {
		const w = makeWallet('w1', {
			usdt_rgb: { raw: '5000000', formatted: '5.00', loading: false }
		});
		expect(
			stableInnerFormat(w, 'usdt_rgb', emptyCache, satsFormatter, usdFormatter, btcPrice)
		).toBe('$5.00');
	});

	it('formats btc_lightning balance as sats with USD', () => {
		const w = makeWallet('w1', {
			btc_lightning: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableInnerFormat(
			w,
			'btc_lightning',
			emptyCache,
			satsFormatter,
			usdFormatter,
			btcPrice
		);
		expect(result).toContain('100,000,000');
		expect(result).toContain('Sats');
	});

	it('falls back to cache when live balance is zero', () => {
		const w = makeWallet('w1', {
			btc: { raw: '0', formatted: '0', loading: false }
		});
		const cache = { w1: { btc: '200000', usdt: '0', wbtc: '0', tbtc: '0' } };
		const result = stableInnerFormat(w, 'btc', cache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('200,000');
		expect(result).toContain('Sats');
	});

	it('falls back to cache for btc_lightning when live is zero', () => {
		const w = makeWallet('w1', {
			btc_lightning: { raw: '0', formatted: '0', loading: false }
		});
		// Cache btc raw = 100,000,000 sats = 1 BTC
		const cache = {
			w1: { btc: '100000000', usdt: '0', wbtc: '0', tbtc: '0' }
		};
		const result = stableInnerFormat(
			w,
			'btc_lightning',
			cache,
			satsFormatter,
			usdFormatter,
			btcPrice
		);
		expect(result).toContain('100,000,000');
		expect(result).toContain('Sats');
	});

	it('returns "$0.00" for usdt_rgb when no balance and no cache', () => {
		const w = makeWallet('w1', undefined);
		expect(
			stableInnerFormat(w, 'usdt_rgb', emptyCache, satsFormatter, usdFormatter, btcPrice)
		).toBe('$0.00');
	});
});

describe('stableWalletAvailableUsd', () => {
	const emptyCache = {};

	function makeWallet(
		id: string,
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined
	) {
		return { id, balances };
	}

	it('returns "$0.00" when no balances and no cache', () => {
		const w = makeWallet('w1', undefined);
		expect(stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice)).toBe('$0.00');
	});

	it('computes USD from btc balance', () => {
		// 100,000,000 sats = 1 BTC = $50,000 at $50k/BTC
		const w = makeWallet('w1', {
			btc: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});

	it('includes btc_lightning in total USD', () => {
		// 100,000,000 sats of Lightning BTC = 1 BTC = $50,000 at $50k/BTC
		const w = makeWallet('w1', {
			btc_lightning: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});

	it('falls back to cache with btc when live is empty', () => {
		const w = makeWallet('w1', undefined);
		const cache = {
			w1: { btc: '100000000', usdt: '0', wbtc: '0', tbtc: '0' }
		};
		const result = stableWalletAvailableUsd(w, cache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});
});

describe('wallet dashboard display', () => {
	it('counts colored, locked, and available coins', () => {
		expect(summarizeUtxoKinds(['colored', 'colored', 'locked', 'free', 'vanilla'])).toEqual({
			colored: 2,
			locked: 1,
			available: 2
		});
	});

	it('shortens a txid and keeps the output index', () => {
		expect(
			shortOutpoint('2af94a3e123bf2ca5d66f3f085ac75f3badd19c951fe82f997a8d59c038966e1:4')
		).toBe('2af9…66e1:4');
	});

	it('puts USDT first and describes recent movement', () => {
		const now = Date.UTC(2026, 8, 24, 12, 0, 0);
		expect(
			pickHeroAsset([
				{ assetId: 'e2e', symbol: 'E2E' },
				{ assetId: 'usdt', symbol: 'USDT' }
			])
		).toEqual({
			hero: { assetId: 'usdt', symbol: 'USDT' },
			rest: [{ assetId: 'e2e', symbol: 'E2E' }]
		});
		expect(formatRelativeTime(now - 2 * 60_000, now, 'en')).toBe('2 minutes ago');
		expect(isRgbMovement('RGB transfer')).toBe(true);
		expect(isRgbMovement('Bitcoin transfer')).toBe(false);
		const amounts = new Intl.NumberFormat();
		expect(formatHistoryAmount('Bitcoin transfer', 12500, undefined, 'sats')).toBe(
			`${amounts.format(12500)} sats`
		);
		expect(formatHistoryAmount('RGB transfer', 1000, 11_000_000, 'sats')).toBe('11.00');
		expect(formatHistoryAmount('RGB transfer', 1000, 1111, 'sats')).toBe('0.001111');
		expect(formatHistoryAmount('RGB transfer', 1000, undefined, 'sats')).toBe(
			`${amounts.format(1000)} sats`
		);
		expect(signetTxUrl('4fe2244f0120fc67c4d0575dc6e6112f2a7dfb20392983f7536209fad157b99d')).toBe(
			'https://esplora-api.utexo.com/tx/4fe2244f0120fc67c4d0575dc6e6112f2a7dfb20392983f7536209fad157b99d'
		);
		expect(signetTxUrl('not-a-txid')).toBeNull();
		const units = transferMovements([
			{
				kind: 'Send',
				txid: '4fe2244f',
				requestedAssignment: { amount: 11_000_000 },
				assignments: [{ amount: 89_000_000 }]
			},
			{
				kind: 'ReceiveBlind',
				txid: '59602401',
				requestedAssignment: { amount: 0 },
				assignments: [{ amount: 100_000_000 }],
				receiveUtxo: { txid: '2af94a3e' }
			}
		]);
		expect(units.get('4fe2244f')).toEqual({ units: 11_000_000, incoming: false });
		expect(units.get('2af94a3e')).toEqual({ units: 100_000_000, incoming: true });
		expect(units.get('59602401')).toEqual({ units: 100_000_000, incoming: true });
		expect(
			rgbHistoryRows([
				{
					kind: 'ReceiveBlind',
					status: 'Settled',
					txid: '853587782a64325e57e142087f153b5505a73610ae45d16523499576d4b44556',
					requestedAssignment: { amount: 1_111_111 },
					assignments: [{ amount: 100_000_000 }],
					updatedAt: 1_790_627_891
				},
				{
					kind: 'ReceiveBlind',
					status: 'WaitingCounterparty',
					requestedAssignment: { amount: 1_111_111 }
				}
			])
		).toEqual([
			{
				ids: ['853587782a64325e57e142087f153b5505a73610ae45d16523499576d4b44556'],
				type: 'receive',
				assetUnits: 100_000_000,
				timestamp: 1_790_627_891_000,
				status: 'confirmed'
			}
		]);
		expect(
			rgbHistoryRows([
				{
					kind: 'Send',
					status: 'Initiated',
					txid: 'aa'.repeat(32),
					requestedAssignment: { amount: 1_000_000 },
					updatedAt: 1_790_633_000
				}
			])
		).toMatchObject([{ type: 'send', assetUnits: 1_000_000, status: 'pending' }]);
		expect(
			rgbHistoryRows([
				{
					kind: 'Send',
					status: 'WaitingCounterparty',
					txid: 'cf2bf9b98d965d71419f9f1cc526ec4f42248504f517751c6abdce3f6622f545',
					requestedAssignment: { amount: 9_000 },
					assignments: [{ amount: 88_991_000 }],
					updatedAt: 1_790_633_902
				}
			])
		).toEqual([
			{
				ids: ['cf2bf9b98d965d71419f9f1cc526ec4f42248504f517751c6abdce3f6622f545'],
				type: 'send',
				assetUnits: 9_000,
				timestamp: 1_790_633_902_000,
				status: 'pending'
			}
		]);
		expect(isBrandPicture('/images/logos/bittasker-logomark.svg')).toBe(true);
		expect(isBrandPicture('https://cdn.example/avatar.png')).toBe(false);
	});

	it('lists USDT from RGB transfers and leaves Bitcoin rows unchanged', () => {
		const rows = walletHistoryRows(
			[
				{
					txid: '4fe2244f0120fc67c4d0575dc6e6112f2a7dfb20392983f7536209fad157b99d',
					received: 691,
					sent: 1000,
					confirmationTime: { timestamp: 1_790_391_348 },
					transactionType: 'User'
				},
				{
					txid: '2af94a3e123bf2ca5d66f3f085ac75f3badd19c951fe82f997a8d59c038966e1',
					received: 1000,
					sent: 0,
					confirmationTime: { timestamp: 1_790_300_000 },
					transactionType: 'User'
				}
			],
			[
				{
					kind: 'Send',
					status: 'Settled',
					txid: '4fe2244f0120fc67c4d0575dc6e6112f2a7dfb20392983f7536209fad157b99d',
					requestedAssignment: { amount: 11_000_000 },
					assignments: [{ amount: 89_000_000 }],
					updatedAt: 1_790_391_348
				},
				{
					kind: 'ReceiveBlind',
					status: 'Settled',
					txid: '59602401ba7abf8b',
					assignments: [{ amount: 100_000_000 }],
					receiveUtxo: {
						txid: '2af94a3e123bf2ca5d66f3f085ac75f3badd19c951fe82f997a8d59c038966e1'
					},
					updatedAt: 1_790_200_000
				}
			]
		);
		const bitcoinSend = rows.find((row) => row.id.startsWith('4fe2244f'));
		const bitcoinReceive = rows.find((row) => row.id.startsWith('2af94a3e'));
		expect(bitcoinSend).toBeUndefined();
		expect(bitcoinReceive).toBeUndefined();
		const usdtSend = rows.find((row) => row.id.startsWith('usdt:4fe2244f'));
		const usdtReceive = rows.find((row) => row.id.startsWith('usdt:59602401'));
		expect(usdtSend).toMatchObject({
			type: 'send',
			assetUnits: 11_000_000,
			description: 'RGB transfer'
		});
		expect(usdtReceive).toMatchObject({
			type: 'receive',
			assetUnits: 100_000_000,
			description: 'RGB transfer',
			txHash: '59602401ba7abf8b'
		});
	});

	it('shows the sats that left the wallet, not the input or change total', () => {
		const rows = walletHistoryRows(
			[
				{
					txid: 'aa'.repeat(32),
					received: 84_076,
					sent: 94_231,
					fee: 155,
					confirmationTime: { timestamp: 1_790_000_000 },
					transactionType: 'User'
				}
			],
			[]
		);
		expect(rows[0]?.amountSats).toBe(10_000);
	});

	it('hides a duplicate 1,000 sat anchor that does not share the RGB txid', () => {
		const anchor = 'cc'.repeat(32);
		const rows = walletHistoryRows(
			[
				{
					txid: anchor,
					received: 0,
					sent: 1000,
					confirmationTime: { timestamp: 1_790_391_348 },
					transactionType: 'User'
				},
				{
					txid: anchor,
					received: 0,
					sent: 1000,
					confirmationTime: { timestamp: 1_790_391_348 },
					transactionType: 'User'
				}
			],
			[
				{
					kind: 'Send',
					status: 'Settled',
					txid: 'dd'.repeat(32),
					requestedAssignment: { amount: 10_000_000 },
					updatedAt: 1_790_391_348
				}
			]
		);
		expect(rows.some((row) => row.amountSats === 1000)).toBe(false);
		expect(rows.some((row) => row.assetUnits === 10_000_000)).toBe(true);
	});

	it('labels an RGB setup transaction instead of a bitcoin send', () => {
		const rows = walletHistoryRows(
			[
				{
					txid: 'bb'.repeat(32),
					received: 0,
					sent: 50_000,
					confirmationTime: { timestamp: 1_790_000_000 },
					transactionType: 'CreateUtxos'
				}
			],
			[]
		);
		expect(rows[0]).toMatchObject({ description: 'Wallet setup', amountSats: 50_000 });
	});

	it('counts one row when the same USDT payment is listed twice', () => {
		const tx = 'ee'.repeat(32);
		const copies = Array.from({ length: 7 }, (_, index) => ({
			id: `usdt:${tx}:send`,
			type: 'send' as const,
			amountSats: 0,
			assetUnits: index < 5 ? 10_000_000 : 20_000_000,
			timestamp: 1,
			status: 'confirmed' as const,
			txHash: tx,
			description: 'RGB transfer'
		}));
		const rows = uniqueHistory(copies);
		expect(rows).toHaveLength(2);
		expect(new Set(rows.map((row) => historyIdentity(row))).size).toBe(2);
	});
});
