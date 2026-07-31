/**
 * Send Validation Config — Behavioral Tests
 *
 * Tests the send-side configuration and balance computation across:
 *   1. use-send-form-validation.svelte.ts — SUPPORTED_SEND_NETWORKS, computeAvailableBalance
 *   2. chain-utils.ts — getChainIdForNetwork, getUSDTContractAddressForNetwork
 *
 * Mocks only external I/O (debug logger).
 * Tests real functions and their data transformations.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Mock external I/O ───────────────────────────────────────────────────────

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

// ── Imports (real modules under test) ───────────────────────────────────────

import {
	SUPPORTED_SEND_NETWORKS,
	computeAvailableBalance
} from '$lib/runes/use-send-form-validation.svelte';

import {
	getChainIdForNetwork,
	getUSDTContractAddressForNetwork
} from '$lib/services/external-wallet/chain-utils';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('send validation config — behavioral tests', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('SUPPORTED_SEND_NETWORKS', () => {
		it('includes rootstock-bitcoin', () => {
			expect(SUPPORTED_SEND_NETWORKS.has('rootstock-bitcoin')).toBe(true);
		});

		it('includes lightning-bitcoin', () => {
			expect(SUPPORTED_SEND_NETWORKS.has('lightning-bitcoin')).toBe(true);
		});

		it('includes bitcoin', () => {
			expect(SUPPORTED_SEND_NETWORKS.has('bitcoin')).toBe(true);
		});

		it('includes usdt-bsc', () => {
			expect(SUPPORTED_SEND_NETWORKS.has('usdt-bsc')).toBe(true);
		});

		// After UX-004 fix:
		it('includes usdt0-arb', () => {
			expect(SUPPORTED_SEND_NETWORKS.has('usdt0-arb')).toBe(true);
		});

		it('includes usdt0-arb (alias)', () => {
			expect(SUPPORTED_SEND_NETWORKS.has('usdt0-arb')).toBe(true);
		});
	});

	describe('computeAvailableBalance', () => {
		it('returns rBTC balance for rootstock source', () => {
			const balance = computeAvailableBalance(
				'rootstock-bitcoin',
				'builtin',
				[],
				{ rsk: { connected: true, formattedBalance: '0.5' }, bsc: { formattedUsdtBalance: '0' } }
			);
			expect(balance).toBe(50_000_000);
		});

		it('returns USDT BSC balance for usdt-bsc source', () => {
			const balance = computeAvailableBalance(
				'usdt-bsc',
				'builtin',
				[],
				{ rsk: { connected: true, formattedBalance: '1.0' }, bsc: { formattedUsdtBalance: '100.5' } }
			);
			expect(balance).toBe(10_050_000_000);
		});

		// After UX-005 fix:
		it('returns USDT0 Arbitrum balance for usdt0-arb source', () => {
			const balance = computeAvailableBalance(
				'usdt0-arb',
				'builtin',
				[],
				{ rsk: { connected: true, formattedBalance: '0' }, bsc: { formattedUsdtBalance: '0' } },
				[{ assetId: 'usdt0-arb', balance: 500 }]
			);
			expect(balance).toBe(50_000_000_000);
		});
	});

	describe('getChainIdForNetwork', () => {
		it('returns 30 for rootstock-bitcoin (mainnet)', () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			expect(getChainIdForNetwork('rootstock-bitcoin')).toBe(30);
		});

		it('returns 42161 for usdt0-arb', () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			expect(getChainIdForNetwork('usdt0-arb')).toBe(42161);
		});

		it('returns 1 for usdt-ethereum', () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			expect(getChainIdForNetwork('usdt-ethereum')).toBe(1);
		});

		// After UX-006 fix:
		it('returns 43114 for usdt-avalanche', () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			expect(getChainIdForNetwork('usdt-avalanche')).toBe(43114);
		});

		it('returns 8453 for usdt-base', () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			expect(getChainIdForNetwork('usdt-base')).toBe(8453);
		});
	});

	describe('getUSDTContractAddressForNetwork', () => {
		it('returns 0xFd086b... for usdt0-arb', () => {
			expect(getUSDTContractAddressForNetwork('usdt0-arb')).toBe(
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
			);
		});

		it('returns 0xdAC17F... for usdt-ethereum', () => {
			expect(getUSDTContractAddressForNetwork('usdt-ethereum')).toBe(
				'0xdAC17F958D2ee523a2206206994597C13D831ec7'
			);
		});

		// After UX-006 fix:
		it('returns 0x970223... for usdt-avalanche', () => {
			expect(getUSDTContractAddressForNetwork('usdt-avalanche')).toBe(
				'0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7'
			);
		});

		it('returns 0x420000... for usdt-base', () => {
			expect(getUSDTContractAddressForNetwork('usdt-base')).toBe(
				'0x4200000000000000000000000000000000000023'
			);
		});
	});
});
