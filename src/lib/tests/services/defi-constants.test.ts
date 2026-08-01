import { describe, it, expect } from 'vitest';
import {
	ARB_PUBLIC_RPC,
	AAVE_POOL,
	AAVE_POOL_DATA_PROVIDER,
	WBTC_ARBITRUM,
	USDT0_ARBITRUM,
	POOL_ABI,
	DATA_PROVIDER_ABI,
	ERC20_APPROVE_ABI,
	ARBITRUM_CHAIN_ID,
	DEFAULT_WBTC_LTV_BPS,
	DEFAULT_LIQUIDATION_THRESHOLD_BPS,
	DEFAULT_GAS_SUPPLY,
	DEFAULT_GAS_BORROW,
	DEFAULT_GAS_REPAY,
	DEFAULT_GAS_WITHDRAW,
	DEFAULT_GAS_GENERIC,
	GAS_BUFFER_PERCENT,
	GAS_BUFFER_DIVISOR,
	UNISWAP_WBTC_USDT0_POOL
} from '$lib/config/defi.constants';
import { WBTC_ARBITRUM as WBTC_REEXPORT, USDT0_ARBITRUM as USDT0_REEXPORT } from '$lib/services/defi/aave.service';
import { sanitizeErrorForLog, mapDeFiErrorMessage } from '$lib/utils/defi-errors';

describe('DeFi constants — single source of truth', () => {
	it('all addresses are valid Ethereum addresses', () => {
		const addresses = [AAVE_POOL, AAVE_POOL_DATA_PROVIDER, WBTC_ARBITRUM, USDT0_ARBITRUM, UNISWAP_WBTC_USDT0_POOL];
		for (const addr of addresses) {
			expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
		}
	});

	it('ARB_PUBLIC_RPC is a valid HTTPS URL', () => {
		expect(ARB_PUBLIC_RPC).toMatch(/^https:\/\//);
	});

	it('ARBITRUM_CHAIN_ID is 42161', () => {
		expect(ARBITRUM_CHAIN_ID).toBe(42161);
	});

	it('LTV and liquidation threshold are reasonable basis points', () => {
		expect(DEFAULT_WBTC_LTV_BPS).toBeGreaterThan(0);
		expect(DEFAULT_WBTC_LTV_BPS).toBeLessThanOrEqual(10000);
		expect(DEFAULT_LIQUIDATION_THRESHOLD_BPS).toBeGreaterThan(DEFAULT_WBTC_LTV_BPS);
		expect(DEFAULT_LIQUIDATION_THRESHOLD_BPS).toBeLessThanOrEqual(10000);
	});

	it('gas defaults are positive BigInts', () => {
		const gasValues = [DEFAULT_GAS_SUPPLY, DEFAULT_GAS_BORROW, DEFAULT_GAS_REPAY, DEFAULT_GAS_WITHDRAW, DEFAULT_GAS_GENERIC];
		for (const g of gasValues) {
			expect(typeof g).toBe('bigint');
			expect(g > 0n).toBe(true);
		}
	});

	it('GAS_BUFFER is 20% (120/100)', () => {
		expect(GAS_BUFFER_PERCENT).toBe(120n);
		expect(GAS_BUFFER_DIVISOR).toBe(100n);
	});

	it('ABIs are non-empty arrays', () => {
		expect(POOL_ABI.length).toBeGreaterThan(0);
		expect(DATA_PROVIDER_ABI.length).toBeGreaterThan(0);
		expect(ERC20_APPROVE_ABI.length).toBeGreaterThan(0);
	});

	it('POOL_ABI contains required functions', () => {
		const abiStr = POOL_ABI.join(' ');
		expect(abiStr).toContain('supply');
		expect(abiStr).toContain('borrow');
		expect(abiStr).toContain('repay');
		expect(abiStr).toContain('withdraw');
		expect(abiStr).toContain('getUserAccountData');
		expect(abiStr).toContain('getReserveData');
	});

	it('aave.service re-exports match defi.constants', () => {
		expect(WBTC_REEXPORT).toBe(WBTC_ARBITRUM);
		expect(USDT0_REEXPORT).toBe(USDT0_ARBITRUM);
	});
});

describe('DeFi error utilities', () => {
	describe('sanitizeErrorForLog', () => {
		it('handles non-Error values', () => {
			const result = sanitizeErrorForLog('string error');
			expect(result.type).toBe('string');
			expect(result.message).toBe('Unknown error');
		});

		it('strips hex blobs from error messages', () => {
			const error = new Error(`tx failed: 0x${'a'.repeat(100)}`);
			const result = sanitizeErrorForLog(error);
			expect(result.message).not.toContain('0x' + 'a'.repeat(100));
			expect(result.message).toContain('[hex-redacted]');
		});

		it('preserves error name and code', () => {
			const error = new Error('test');
			(error as any).code = 'NETWORK_ERROR';
			const result = sanitizeErrorForLog(error);
			expect(result.name).toBe('Error');
			expect(result.code).toBe('NETWORK_ERROR');
		});

		it('truncates very long messages to 300 chars', () => {
			const error = new Error('x'.repeat(500));
			const result = sanitizeErrorForLog(error);
			expect((result.message as string).length).toBeLessThanOrEqual(310);
		});
	});

	describe('mapDeFiErrorMessage', () => {
		const mockT = (key: string) => `translated:${key}`;

		it('returns userMessage when no errorCode', () => {
			const result = mapDeFiErrorMessage({ userMessage: 'fallback', errorCode: undefined } as any, mockT);
			expect(result).toBe('fallback');
		});

		it('maps known error codes to translated messages', () => {
			const codes = ['INSUFFICIENT_GAS', 'NETWORK_ERROR', 'USER_REJECTED', 'CONTRACT_REVERT'];
			for (const code of codes) {
				const result = mapDeFiErrorMessage({ userMessage: 'fallback', errorCode: code } as any, mockT);
				expect(result).toContain('translated:');
				expect(result).not.toBe('fallback');
			}
		});

		it('falls back to userMessage for unknown codes', () => {
			const result = mapDeFiErrorMessage({ userMessage: 'fallback', errorCode: 'UNKNOWN_CODE' } as any, mockT);
			expect(result).toBe('fallback');
		});
	});
});
