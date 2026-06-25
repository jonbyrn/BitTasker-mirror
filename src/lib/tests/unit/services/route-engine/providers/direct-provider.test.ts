/**
 * Direct Provider — Unit Tests
 *
 * Tests same-token, same-chain transfer logic.
 * No mocks needed — pure logic.
 */

import { describe, it, expect } from 'vitest';
import { directProvider } from '$lib/services/route-engine/providers/direct.provider';
import { TOKENS } from '$lib/services/route-engine/token-registry';
import type { Token } from '$lib/services/route-engine/types';

// ---------------------------------------------------------------------------
// supports()
// ---------------------------------------------------------------------------

describe('directProvider.supports()', () => {
	it('returns true for same key (rbtc → rbtc)', () => {
		expect(directProvider.supports(TOKENS['rbtc'], TOKENS['rbtc'])).toBe(true);
	});

	it('returns true for same key (usdt0-arb → usdt0-arb)', () => {
		expect(directProvider.supports(TOKENS['usdt0-arb'], TOKENS['usdt0-arb'])).toBe(true);
	});

	it('returns true for same chain + same symbol (different key)', () => {
		// Two tokens on same chain with same symbol are functionally equivalent
		const a: Token = {
			key: 'x',
			symbol: 'USDT',
			address: '0x1',
			chain: 'bsc',
			chainId: 56,
			decimals: 18,
			native: false
		};
		const b: Token = {
			key: 'y',
			symbol: 'USDT',
			address: '0x2',
			chain: 'bsc',
			chainId: 56,
			decimals: 18,
			native: false
		};
		expect(directProvider.supports(a, b)).toBe(true);
	});

	it('returns false for different chain (rbtc → usdt-bsc)', () => {
		expect(directProvider.supports(TOKENS['rbtc'], TOKENS['usdt-bsc'])).toBe(false);
	});

	it('returns false for same chain different symbol (rbtc → usdt0-rsk)', () => {
		expect(directProvider.supports(TOKENS['rbtc'], TOKENS['usdt0-rsk'])).toBe(false);
	});

	it('returns false for different chain same symbol', () => {
		expect(directProvider.supports(TOKENS['usdt-bsc'], TOKENS['usdt0-arb'])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getQuote()
// ---------------------------------------------------------------------------

describe('directProvider.getQuote()', () => {
	it('returns a Route with 0% fee', async () => {
		const route = await directProvider.getQuote(TOKENS['rbtc'], TOKENS['rbtc'], 100_000);
		expect(route).not.toBeNull();
		expect(route!.totalFeePercent).toBe(0);
		expect(route!.hops[0].feePercent).toBe(0);
	});

	it('returns estimatedOutput equal to amountSats (no fee, no slippage)', async () => {
		const amountSats = 500_000;
		const route = await directProvider.getQuote(TOKENS['rbtc'], TOKENS['rbtc'], amountSats);
		// Direct route preserves full amount
		expect(route).not.toBeNull();
		expect(route!.hops).toHaveLength(1);
		expect(route!.totalFeePercent).toBe(0);
	});

	it('returns a direct hop', async () => {
		const route = await directProvider.getQuote(TOKENS['usdt0-arb'], TOKENS['usdt0-arb'], 100_000);
		expect(route).not.toBeNull();
		expect(route!.hops[0].service).toBe('direct');
	});

	it('returns estimatedTime <1 min', async () => {
		const route = await directProvider.getQuote(TOKENS['btc'], TOKENS['btc'], 100_000);
		expect(route).not.toBeNull();
		expect(route!.estimatedTime).toBe('<1 min');
	});

	it('route id contains from key, to key, and amount', async () => {
		const route = await directProvider.getQuote(TOKENS['rbtc'], TOKENS['rbtc'], 12345);
		expect(route).not.toBeNull();
		expect(route!.id).toContain('rbtc');
		expect(route!.id).toContain('12345');
	});

	it('never returns null', async () => {
		const route = await directProvider.getQuote(TOKENS['btc'], TOKENS['btc'], 1);
		expect(route).not.toBeNull();
	});
});
