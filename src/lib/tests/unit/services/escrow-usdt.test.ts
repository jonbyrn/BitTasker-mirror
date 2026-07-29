/**
 * Tests for USDT Escrow Service
 *
 * Tests the pure functions in escrow-usdt.service.ts:
 *  - USDT amount derivation (no BTC price division)
 *  - rBTC amount derivation (delegates via division + parseEther)
 *  - Unified dispatch function
 *  - Fee calculation
 *  - Pure function determinism
 */
import { describe, it, expect } from 'vitest';
import {
	convertUSDTAmountToWei,
	deriveRBTCScrowParams,
	deriveEscrowParams,
	calculateEscrowFees,
	formatEscrowAmount,
	getEscrowFeePercentage,
	getTokenChain,
	getTokenDisplayName
} from '$lib/services/escrow/escrow-usdt.service';

describe('escrow-usdt.service', () => {
	// -----------------------------------------------------------------------
	// convertUSDTAmountToWei
	// -----------------------------------------------------------------------
	describe('convertUSDTAmountToWei', () => {
		it('converts USD amount to USDT wei (18 decimals)', () => {
			const result = convertUSDTAmountToWei(50.0);
			expect(result.amountWei).toBe(50_000_000_000_000_000_000n);
			expect(result.token).toBe('USDT');
			expect(result.chain).toBe('bsc');
		});

		it('converts $1.00 correctly', () => {
			const result = convertUSDTAmountToWei(1.0);
			expect(result.amountWei).toBe(1_000_000_000_000_000_000n);
			// ethers.formatUnits strips trailing zeros: 1.0 not 1.00
			expect(result.formatted).toBe('1.0');
		});

		it('converts $0.01 (1 cent) correctly', () => {
			const result = convertUSDTAmountToWei(0.01);
			expect(result.amountWei).toBe(10_000_000_000_000_000n);
		});

		it('converts $1000.00 correctly', () => {
			const result = convertUSDTAmountToWei(1000.0);
			expect(result.amountWei).toBe(1_000_000_000_000_000_000_000n);
		});

		it('handles zero amount by throwing', () => {
			expect(() => convertUSDTAmountToWei(0)).toThrow(
				'Amount must be a finite number greater than 0'
			);
		});

		it('handles negative amount by throwing', () => {
			expect(() => convertUSDTAmountToWei(-50)).toThrow(
				'Amount must be a finite number greater than 0'
			);
		});

		it('handles NaN by throwing', () => {
			expect(() => convertUSDTAmountToWei(NaN)).toThrow(
				'Amount must be a finite number greater than 0'
			);
		});

		it('handles Infinity by throwing', () => {
			expect(() => convertUSDTAmountToWei(Infinity)).toThrow(
				'Amount must be a finite number greater than 0'
			);
		});

		it('ensures deterministic output (same input => same output)', () => {
			const a = convertUSDTAmountToWei(75.5);
			const b = convertUSDTAmountToWei(75.5);
			expect(a.amountWei).toBe(b.amountWei);
			expect(a.formatted).toBe(b.formatted);
			expect(a.token).toBe(b.token);
			expect(a.chain).toBe(b.chain);
		});

		it('returns formatted amount as token units', () => {
			const result = convertUSDTAmountToWei(25.99);
			expect(result.formatted).toBe('25.99');
		});

		it('formats whole numbers without trailing zeros', () => {
			const result = convertUSDTAmountToWei(100);
			expect(result.formatted).toBe('100.0');
		});
	});

	// -----------------------------------------------------------------------
	// deriveRBTCScrowParams
	// -----------------------------------------------------------------------
	describe('deriveRBTCScrowParams', () => {
		it('converts USD to rBTC wei using BTC price', () => {
			const result = deriveRBTCScrowParams(50, 65000);
			// 50 / 65000 = 0.00076923076923076923 BTC
			// parseEther uses 18 decimals
			expect(result.amountWei).toBeGreaterThan(0n);
			expect(result.token).toBe('rBTC');
			expect(result.chain).toBe('rsk');
		});

		it('returns $0 for amount of 0 (throws)', () => {
			expect(() => deriveRBTCScrowParams(0, 65000)).toThrow(
				'Amount must be a finite number greater than 0'
			);
		});

		it('throws when btcPrice is zero', () => {
			expect(() => deriveRBTCScrowParams(50, 0)).toThrow(
				'BTC price must be a finite number greater than 0'
			);
		});

		it('throws when btcPrice is negative', () => {
			expect(() => deriveRBTCScrowParams(50, -1)).toThrow(
				'BTC price must be a finite number greater than 0'
			);
		});

		it('throws when btcPrice is NaN', () => {
			expect(() => deriveRBTCScrowParams(50, NaN)).toThrow(
				'BTC price must be a finite number greater than 0'
			);
		});

		it('ensures deterministic output (same input => same output)', () => {
			const a = deriveRBTCScrowParams(100, 50000);
			const b = deriveRBTCScrowParams(100, 50000);
			expect(a.amountWei).toBe(b.amountWei);
			expect(a.formatted).toBe(b.formatted);
			expect(a.token).toBe(b.token);
			expect(a.chain).toBe(b.chain);
		});
	});

	// -----------------------------------------------------------------------
	// deriveEscrowParams (unified dispatch)
	// -----------------------------------------------------------------------
	describe('deriveEscrowParams', () => {
		it('dispatches to USDT path when token is USDT (no BTC price needed)', () => {
			const result = deriveEscrowParams('USDT', 50.0);
			expect(result.token).toBe('USDT');
			expect(result.chain).toBe('bsc');
			expect(result.amountWei).toBe(50_000_000_000_000_000_000n);
		});

		it('dispatches to rBTC path when token is rBTC and BTC price is provided', () => {
			const result = deriveEscrowParams('rBTC', 50, 65000);
			expect(result.token).toBe('rBTC');
			expect(result.chain).toBe('rsk');
			expect(result.amountWei).toBeGreaterThan(0n);
		});

		it('throws when rBTC is selected without btcPrice', () => {
			expect(() => deriveEscrowParams('rBTC', 50)).toThrow(
				'btcPrice is required when token is rBTC'
			);
		});

		it('throws when rBTC is selected with undefined btcPrice', () => {
			expect(() => deriveEscrowParams('rBTC', 50, undefined)).toThrow(
				'btcPrice is required when token is rBTC'
			);
		});

		it('ensures deterministic output for USDT', () => {
			const a = deriveEscrowParams('USDT', 30.0);
			const b = deriveEscrowParams('USDT', 30.0);
			expect(a.amountWei).toBe(b.amountWei);
			expect(a.formatted).toBe(b.formatted);
		});

		it('ensures deterministic output for rBTC', () => {
			const a = deriveEscrowParams('rBTC', 100, 60000);
			const b = deriveEscrowParams('rBTC', 100, 60000);
			expect(a.amountWei).toBe(b.amountWei);
			expect(a.formatted).toBe(b.formatted);
		});
	});

	// -----------------------------------------------------------------------
	// formatEscrowAmount
	// -----------------------------------------------------------------------
	describe('formatEscrowAmount', () => {
		it('formats USDT result with token suffix', () => {
			const result = convertUSDTAmountToWei(50.0);
			expect(formatEscrowAmount(result)).toContain('USDT');
		});

		it('formats rBTC result with token suffix', () => {
			const result = deriveRBTCScrowParams(50, 65000);
			expect(formatEscrowAmount(result)).toContain('rBTC');
		});
	});

	// -----------------------------------------------------------------------
	// calculateEscrowFees
	// -----------------------------------------------------------------------
	describe('calculateEscrowFees', () => {
		const usdtBaseWei = 100_000_000_000_000_000_000n; // 100 USDT

		it('calculates USDT fees at tier 1 (5% per side)', () => {
			const fees = calculateEscrowFees(usdtBaseWei, 'USDT');
			// 5% of 100 = 5 USDT per side = 5 * 10^18 wei
			expect(fees.taskerFeeWei).toBe(5_000_000_000_000_000_000n);
			expect(fees.taskeeFeeWei).toBe(5_000_000_000_000_000_000n);
			expect(fees.totalFeesWei).toBe(10_000_000_000_000_000_000n);
		});

		it('calculates rBTC fees at tier 1 (2.5% per side)', () => {
			const fees = calculateEscrowFees(usdtBaseWei, 'rBTC');
			// 2.5% of 100 = 2.5 units per side
			expect(fees.taskerFeeWei).toBe(2_500_000_000_000_000_000n);
			expect(fees.taskeeFeeWei).toBe(2_500_000_000_000_000_000n);
			expect(fees.totalFeesWei).toBe(5_000_000_000_000_000_000n);
		});

		it('includes gas reimbursement (2 * GAS_REIMBURSEMENT_PER_OP)', () => {
			const fees = calculateEscrowFees(usdtBaseWei, 'USDT');
			expect(fees.gasReimbursementWei).toBeGreaterThan(0n);
			expect(fees.gasReimbursementWei).toBe(2n * 2_523_514_500_000n);
		});

		it('sets totalValueWei to 0 for USDT (ERC-20, no msg.value)', () => {
			const fees = calculateEscrowFees(usdtBaseWei, 'USDT');
			expect(fees.totalValueWei).toBe(0n);
		});

		it('calculates totalValueWei for rBTC (native token)', () => {
			const fees = calculateEscrowFees(usdtBaseWei, 'rBTC');
			expect(fees.totalValueWei).toBeGreaterThan(0n);
			expect(fees.totalValueWei).toBe(usdtBaseWei + fees.taskerFeeWei + fees.gasReimbursementWei);
		});

		it('throws for zero base amount', () => {
			expect(() => calculateEscrowFees(0n, 'USDT')).toThrow(
				'Base amount must be greater than zero'
			);
		});

		it('throws for negative base amount', () => {
			expect(() => calculateEscrowFees(-100n, 'USDT')).toThrow(
				'Base amount must be greater than zero'
			);
		});

		it('allows custom fee tiers', () => {
			const fees = calculateEscrowFees(usdtBaseWei, 'USDT', 2, 2);
			// Using the same FEE_TIERS lookup
			expect(fees.taskerFeeTier).toBe(2);
			expect(fees.taskeeFeeTier).toBe(2);
		});

		it('ensures deterministic output', () => {
			const a = calculateEscrowFees(usdtBaseWei, 'USDT');
			const b = calculateEscrowFees(usdtBaseWei, 'USDT');
			expect(a.taskerFeeWei).toBe(b.taskerFeeWei);
			expect(a.taskeeFeeWei).toBe(b.taskeeFeeWei);
			expect(a.totalFeesWei).toBe(b.totalFeesWei);
			expect(a.gasReimbursementWei).toBe(b.gasReimbursementWei);
			expect(a.totalValueWei).toBe(b.totalValueWei);
		});
	});

	// -----------------------------------------------------------------------
	// getEscrowFeePercentage
	// -----------------------------------------------------------------------
	describe('getEscrowFeePercentage', () => {
		it('returns fee percentage for USDT at tier 1', () => {
			const pct = getEscrowFeePercentage('USDT');
			expect(pct).toBeGreaterThan(0);
		});

		it('returns fee percentage for rBTC at tier 1', () => {
			const pct = getEscrowFeePercentage('rBTC');
			expect(pct).toBeGreaterThan(0);
		});
	});

	// -----------------------------------------------------------------------
	// getTokenChain
	// -----------------------------------------------------------------------
	describe('getTokenChain', () => {
		it('returns bsc for USDT', () => {
			expect(getTokenChain('USDT')).toBe('bsc');
		});

		it('returns rsk for rBTC', () => {
			expect(getTokenChain('rBTC')).toBe('rsk');
		});
	});

	// -----------------------------------------------------------------------
	// getTokenDisplayName
	// -----------------------------------------------------------------------
	describe('getTokenDisplayName', () => {
		it('returns display name for USDT', () => {
			expect(getTokenDisplayName('USDT')).toContain('USDT');
		});

		it('returns display name for rBTC', () => {
			expect(getTokenDisplayName('rBTC')).toContain('rBTC');
		});
	});
});
