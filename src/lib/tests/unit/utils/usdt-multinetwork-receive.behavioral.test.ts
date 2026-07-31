/**
 * USDT0 Multi-Network Receive — Behavioral Tests
 *
 * Tests the multi-network USDT receive flow across:
 *   1. receive-network-mapping.ts — SOURCE_CHAIN_MAP, deriveChainInfo, getSourceFromNetwork
 *   2. use-receive-fees.svelte.ts — cross-chain fee estimation for new networks
 *
 * Mocks only external I/O (swap providers, debug logger, kill-switch).
 * Tests real functions and their data transformations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock external I/O ───────────────────────────────────────────────────────

const { mockLifiGetQuote, mockSymbiosisGetQuote } = vi.hoisted(() => ({
	mockLifiGetQuote: vi.fn(),
	mockSymbiosisGetQuote: vi.fn()
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('$lib/services/lifi.service', () => ({
	lifiService: {
		getQuote: mockLifiGetQuote
	}
}));

vi.mock('$lib/services/symbiosis.service', () => ({
	symbiosisService: {
		getQuote: mockSymbiosisGetQuote
	}
}));

vi.mock('$lib/services/changelly.service', () => ({
	changellyService: {
		getLimits: vi.fn(),
		estimateSwap: vi.fn()
	}
}));

vi.mock('$lib/services/kill-switch', () => ({
	isLifiEnabled: () => true,
	isSymbiosisEnabled: () => true
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

// ── Imports (real modules under test) ───────────────────────────────────────

import {
	SOURCE_CHAIN_MAP,
	deriveChainInfo,
	getSourceFromNetwork
} from '$lib/utils/receive-network-mapping';

import { useReceiveFees } from '$lib/runes/use-receive-fees.svelte';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeUseReceiveFeesOptions(overrides?: {
	amountInSats?: number;
	payerNetwork?: string;
	selectedNetwork?: string;
	rskAddress?: string;
}) {
	return {
		getAmountInSats: () => overrides?.amountInSats ?? 100_000,
		getPayerNetwork: () => overrides?.payerNetwork ?? 'usdt-avalanche',
		getSelectedNetwork: () => overrides?.selectedNetwork ?? 'usdt0-arb',
		getReceiveTab: () => 'usdt0-arb',
		getRskAddress: () => overrides?.rskAddress ?? '0xUserAddr11111111111111111111111111111111',
		getCachedReverseSwapPairs: vi.fn().mockResolvedValue(null),
		getCachedChainSwapPairs: vi.fn().mockResolvedValue(null)
	};
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('USDT0 multi-network receive — behavioral tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLifiGetQuote.mockResolvedValue({
			estimate: {
				fromAmount: '100000000000000000000',
				toAmount: '99500000000000000000',
				toAmountMin: '99400000000000000000'
			}
		});
		mockSymbiosisGetQuote.mockResolvedValue({
			tokenAmountOut: { amount: '99700000000000000000' }
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('SOURCE_CHAIN_MAP entries', () => {
		it('Avalanche: chainId 43114, contract 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', () => {
			const entry = SOURCE_CHAIN_MAP['usdt-avalanche'];
			expect(entry).toBeDefined();
			expect(entry!.chainId).toBe(43114);
			expect(entry!.address).toBe('0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7');
		});

		it('Base: chainId 8453, contract 0x4200000000000000000000000000000000000023', () => {
			const entry = SOURCE_CHAIN_MAP['usdt-base'];
			expect(entry).toBeDefined();
			expect(entry!.chainId).toBe(8453);
			expect(entry!.address).toBe('0x4200000000000000000000000000000000000023');
		});

		it('Ethereum: chainId 1, contract 0xdAC17F958D2ee523a2206206994597C13D831ec7', () => {
			const entry = SOURCE_CHAIN_MAP['usdt-ethereum'];
			expect(entry).toBeDefined();
			expect(entry!.chainId).toBe(1);
			expect(entry!.address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
		});

		it('Arbitrum: chainId 42161, contract 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', () => {
			const entry = SOURCE_CHAIN_MAP['usdt0-arb'];
			expect(entry).toBeDefined();
			expect(entry!.chainId).toBe(42161);
			expect(entry!.address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
		});
	});

	describe('deriveChainInfo', () => {
		it('Avalanche returns correct chainId and contract', () => {
			const info = deriveChainInfo('usdt-avalanche');
			expect(info).toBeDefined();
			expect(info!.chainId).toBe(43114);
			expect(info!.address).toBe('0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7');
			expect(info!.asset).toBe('USDT');
			expect(info!.decimals).toBe(18);
		});

		it('Base returns correct chainId and contract', () => {
			const info = deriveChainInfo('usdt-base');
			expect(info).toBeDefined();
			expect(info!.chainId).toBe(8453);
			expect(info!.address).toBe('0x4200000000000000000000000000000000000023');
			expect(info!.asset).toBe('USDT');
			expect(info!.decimals).toBe(18);
		});

		it('Ethereum returns correct chainId and contract', () => {
			const info = deriveChainInfo('usdt-ethereum');
			expect(info).toBeDefined();
			expect(info!.chainId).toBe(1);
			expect(info!.address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
			expect(info!.asset).toBe('USDT');
			expect(info!.decimals).toBe(18);
		});

		it('Arbitrum returns correct chainId and contract', () => {
			const info = deriveChainInfo('usdt0-arb');
			expect(info).toBeDefined();
			expect(info!.chainId).toBe(42161);
			expect(info!.address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
			expect(info!.asset).toBe('USDT0');
			expect(info!.decimals).toBe(18);
		});

		it('returns null for unknown network', () => {
			expect(deriveChainInfo('unknown-network')).toBeNull();
		});
	});

	describe('getSourceFromNetwork (payer source mapping)', () => {
		it('usdt-avalanche maps to usdt-avalanche', () => {
			expect(getSourceFromNetwork('usdt-avalanche')).toBe('usdt-avalanche');
		});

		it('usdt-base maps to usdt-base', () => {
			expect(getSourceFromNetwork('usdt-base')).toBe('usdt-base');
		});

		it('usdt-ethereum maps to usdt-ethereum', () => {
			expect(getSourceFromNetwork('usdt-ethereum')).toBe('usdt-ethereum');
		});

		it('usdt0-arb maps to usdt0-arb', () => {
			expect(getSourceFromNetwork('usdt0-arb')).toBe('usdt0-arb');
		});

		it('unknown network returns rbtc', () => {
			expect(getSourceFromNetwork('unknown-network')).toBe('rbtc');
		});
	});

	describe('fee estimation for cross-chain payer sources', () => {
		it('Avalanche → Arbitrum fee estimation returns valid data', async () => {
			const fees = useReceiveFees(
				makeUseReceiveFeesOptions({
					payerNetwork: 'usdt-avalanche',
					selectedNetwork: 'usdt0-arb'
				})
			);

			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
			expect(fees.estimated!.totalFees).toBeGreaterThanOrEqual(0);
			expect(typeof fees.estimated!.serviceFee).toBe('number');
			expect(typeof fees.estimated!.networkFee).toBe('number');
		});

		it('Base → Arbitrum fee estimation returns valid data', async () => {
			const fees = useReceiveFees(
				makeUseReceiveFeesOptions({
					payerNetwork: 'usdt-base',
					selectedNetwork: 'usdt0-arb'
				})
			);

			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
			expect(fees.estimated!.totalFees).toBeGreaterThanOrEqual(0);
			expect(typeof fees.estimated!.serviceFee).toBe('number');
			expect(typeof fees.estimated!.networkFee).toBe('number');
		});

		it('Ethereum → Arbitrum fee estimation returns valid data', async () => {
			const fees = useReceiveFees(
				makeUseReceiveFeesOptions({
					payerNetwork: 'usdt-ethereum',
					selectedNetwork: 'usdt0-arb'
				})
			);

			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
			expect(fees.estimated!.totalFees).toBeGreaterThanOrEqual(0);
			expect(typeof fees.estimated!.serviceFee).toBe('number');
			expect(typeof fees.estimated!.networkFee).toBe('number');
		});
	});
});
