/**
 * Boltz Provider — Unit Tests
 *
 * Tests supports() for all known Boltz pairs and getQuote() success/null paths.
 * Mocks: BoltzProvider class (getQuote method).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-scoped mock function — survives vi.clearAllMocks() (only history is cleared)
// vi.hoisted() ensures this is available when vi.mock() factory runs
const { mockBoltzGetQuote } = vi.hoisted(() => ({
	mockBoltzGetQuote: vi.fn()
}));

// Mock external dependencies before importing the provider
vi.mock('$lib/services/BoltzProvider', () => {
	const MockBoltzProvider = vi.fn().mockImplementation(function (this: unknown) {
		(this as unknown as Record<string, unknown>).getQuote = mockBoltzGetQuote;
	});
	return {
		BoltzProvider: MockBoltzProvider,
		boltzProvider: new MockBoltzProvider()
	};
});

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

import { boltzProvider } from '$lib/services/route-engine/providers/boltz.provider';
import { TOKENS } from '$lib/services/route-engine/token-registry';
import type { BoltzQuote } from '$lib/services/BoltzProvider';

// ---------------------------------------------------------------------------
// supports()
// ---------------------------------------------------------------------------

describe('boltzProvider.supports()', () => {
	it('rbtc → tbtc-arb: true', () => {
		expect(boltzProvider.supports(TOKENS['rbtc'], TOKENS['tbtc-arb'])).toBe(true);
	});

	it('tbtc-arb → rbtc: true', () => {
		expect(boltzProvider.supports(TOKENS['tbtc-arb'], TOKENS['rbtc'])).toBe(true);
	});

	it('rbtc → btc: true', () => {
		expect(boltzProvider.supports(TOKENS['rbtc'], TOKENS['btc'])).toBe(true);
	});

	it('rbtc → btc-ln: true', () => {
		expect(boltzProvider.supports(TOKENS['rbtc'], TOKENS['btc-ln'])).toBe(true);
	});

	it('btc → rbtc: true', () => {
		expect(boltzProvider.supports(TOKENS['btc'], TOKENS['rbtc'])).toBe(true);
	});

	it('unknown pair rbtc → usdt-bsc: false', () => {
		expect(boltzProvider.supports(TOKENS['rbtc'], TOKENS['usdt-bsc'])).toBe(false);
	});

	it('unknown pair usdt-bsc → btc: false', () => {
		expect(boltzProvider.supports(TOKENS['usdt-bsc'], TOKENS['btc'])).toBe(false);
	});

	it('unknown pair usdt0-arb → wbtc-arb: false', () => {
		expect(boltzProvider.supports(TOKENS['usdt0-arb'], TOKENS['wbtc-arb'])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getQuote()
// ---------------------------------------------------------------------------

describe('boltzProvider.getQuote()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('success: returns Route with boltz hop', async () => {
		const mockQuote: BoltzQuote = {
			fromAsset: 'RBTC',
			toAsset: 'TBTC',
			rate: 0.99,
			protocolFeePercent: 0.25,
			minerFeeSats: 300,
			totalFeeSats: 550,
			estimatedTimeMin: 5,
			limits: { min: 2500, max: 5_000_000 }
		};

		mockBoltzGetQuote.mockResolvedValueOnce(mockQuote);

		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['tbtc-arb'], 100_000);

		expect(route).not.toBeNull();
		expect(route!.hops).toHaveLength(1);
		expect(route!.hops[0].service).toBe('boltz');
		expect(route!.hops[0].fromAsset).toBe('RBTC');
		expect(route!.hops[0].toAsset).toBe('TBTC');
		expect(route!.totalFeePercent).toBeCloseTo(0.55, 1); // 550 / 100_000 * 100
		expect(route!.id).toContain('boltz');
	});

	it('null quote: returns null', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(null);

		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['tbtc-arb'], 100_000);
		expect(route).toBeNull();
	});

	it('invalid amount (0): returns null', async () => {
		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['tbtc-arb'], 0);
		expect(route).toBeNull();
	});

	it('invalid amount (negative): returns null', async () => {
		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['tbtc-arb'], -500);
		expect(route).toBeNull();
	});

	it('invalid amount (NaN): returns null', async () => {
		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['tbtc-arb'], NaN);
		expect(route).toBeNull();
	});

	it('service error: returns null', async () => {
		mockBoltzGetQuote.mockRejectedValueOnce(new Error('Boltz API down'));

		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['tbtc-arb'], 100_000);
		expect(route).toBeNull();
	});

	it('computes feePercent correctly from totalFeeSats', async () => {
		const mockQuote: BoltzQuote = {
			fromAsset: 'RBTC',
			toAsset: 'TBTC',
			rate: 1.0,
			protocolFeePercent: 0.25,
			minerFeeSats: 200,
			totalFeeSats: 1000, // 1000 / 50_000 * 100 = 2%
			estimatedTimeMin: 5,
			limits: { min: 2500, max: 5_000_000 }
		};

		mockBoltzGetQuote.mockResolvedValueOnce(mockQuote);

		const route = await boltzProvider.getQuote(TOKENS['rbtc'], TOKENS['btc'], 50_000);

		expect(route).not.toBeNull();
		expect(route!.totalFeePercent).toBeCloseTo(2.0, 1);
	});
});
