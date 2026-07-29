import { describe, it, expect } from 'vitest';
import {
	calculateMaxSafeWithdraw,
	calculateBtcLiquidationPrice,
	calculateProjectedHealthFactor,
	calculateLtv,
	deriveHealthStatus
} from '$lib/services/defi/aave.service';

const COLLATERAL_USD = 215_000;
const DEBT_USD = 85_000;
const LIQ_THRESHOLD_BPS = 7800;
const BTC_PRICE = 100_000;
const COLLATERAL_BTC = 2.15;

describe('calculateMaxSafeWithdraw', () => {
	it('realistic scenario: 2.15 wBTC @ $100k, $85k debt, 7800 bps liq threshold', () => {
		const result = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			2.0,
			BTC_PRICE,
			8,
			1.05
		);

		expect(result.maxSafeCollateralUsd).toBeGreaterThan(0);
		expect(result.maxSafeCollateralAssetAmount).toBeGreaterThan(0n);
		expect(result.postWithdrawHealthFactor).toBeGreaterThanOrEqual(1.0);
	});

	it('post-withdraw HF >= 1.05 buffer', () => {
		const result = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			2.0,
			BTC_PRICE,
			8,
			1.05
		);

		expect(result.postWithdrawHealthFactor).toBeGreaterThanOrEqual(1.05);
	});

	it('zero debt: can withdraw everything', () => {
		const result = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			0,
			LIQ_THRESHOLD_BPS,
			999,
			BTC_PRICE,
			8
		);

		expect(result.maxSafeCollateralUsd).toBe(COLLATERAL_USD);
		expect(result.maxSafeCollateralAssetAmount).toBe(215000000n);
		expect(result.postWithdrawHealthFactor).toBe(999);
		expect(result.isAtRisk).toBe(false);
	});

	it('zero collateral: returns zero withdraw', () => {
		const result = calculateMaxSafeWithdraw(0, DEBT_USD, LIQ_THRESHOLD_BPS, 1.0, BTC_PRICE, 8);

		expect(result.maxSafeCollateralUsd).toBe(0);
		expect(result.maxSafeCollateralAssetAmount).toBe(0n);
	});

	it('NaN inputs: returns zero result', () => {
		const result = calculateMaxSafeWithdraw(NaN, DEBT_USD, LIQ_THRESHOLD_BPS, 2.0, BTC_PRICE);

		expect(result.maxSafeCollateralUsd).toBe(0);
		expect(result.maxSafeCollateralAssetAmount).toBe(0n);
	});

	it('Infinity inputs: returns zero result', () => {
		const result = calculateMaxSafeWithdraw(Infinity, DEBT_USD, LIQ_THRESHOLD_BPS, 2.0, BTC_PRICE);

		expect(result.maxSafeCollateralUsd).toBe(0);
	});

	it('isAtRisk true when HF < 1.5', () => {
		const result = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			1.2,
			BTC_PRICE
		);

		expect(result.isAtRisk).toBe(true);
	});

	it('isAtRisk false when HF >= 1.5', () => {
		const result = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			2.0,
			BTC_PRICE
		);

		expect(result.isAtRisk).toBe(false);
	});

	it('zero price collateral: returns zero asset amount', () => {
		const result = calculateMaxSafeWithdraw(COLLATERAL_USD, DEBT_USD, LIQ_THRESHOLD_BPS, 2.0, 0);

		expect(result.maxSafeCollateralAssetAmount).toBe(0n);
	});

	it('buffer multiplier changes safe withdraw amount', () => {
		const tight = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			2.0,
			BTC_PRICE,
			8,
			1.01
		);
		const loose = calculateMaxSafeWithdraw(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			2.0,
			BTC_PRICE,
			8,
			1.1
		);

		expect(tight.maxSafeCollateralUsd).toBeGreaterThan(loose.maxSafeCollateralUsd);
	});
});

describe('calculateBtcLiquidationPrice', () => {
	it('realistic: liqPrice = debt / (collateral * liqThreshold)', () => {
		const result = calculateBtcLiquidationPrice(
			DEBT_USD,
			COLLATERAL_BTC,
			LIQ_THRESHOLD_BPS,
			BTC_PRICE
		);

		const expected = DEBT_USD / (COLLATERAL_BTC * 0.78);
		expect(result.liquidationBtcPrice).toBeCloseTo(expected, 2);
	});

	it('distancePercent is positive when current > liq price', () => {
		const result = calculateBtcLiquidationPrice(
			DEBT_USD,
			COLLATERAL_BTC,
			LIQ_THRESHOLD_BPS,
			BTC_PRICE
		);

		expect(result.distancePercent).toBeGreaterThan(0);
		expect(result.currentBtcPrice).toBe(BTC_PRICE);
	});

	it('no debt: returns zero liq price, 100% distance', () => {
		const result = calculateBtcLiquidationPrice(0, COLLATERAL_BTC, LIQ_THRESHOLD_BPS, BTC_PRICE);

		expect(result.liquidationBtcPrice).toBe(0);
		expect(result.distancePercent).toBe(100);
	});

	it('no collateral: returns zero', () => {
		const result = calculateBtcLiquidationPrice(DEBT_USD, 0, LIQ_THRESHOLD_BPS, BTC_PRICE);

		expect(result.liquidationBtcPrice).toBe(0);
		expect(result.distancePercent).toBe(100);
	});

	it('NaN inputs: returns zero', () => {
		const result = calculateBtcLiquidationPrice(NaN, COLLATERAL_BTC, LIQ_THRESHOLD_BPS, BTC_PRICE);

		expect(result.liquidationBtcPrice).toBe(0);
	});

	it('zero current price with debt and collateral: distance 100 (no valid calc)', () => {
		const result = calculateBtcLiquidationPrice(DEBT_USD, COLLATERAL_BTC, LIQ_THRESHOLD_BPS, 0);

		expect(result.distancePercent).toBe(100);
	});
});

describe('calculateProjectedHealthFactor', () => {
	it('no debt change returns correct HF', () => {
		const hf = calculateProjectedHealthFactor(COLLATERAL_USD, DEBT_USD, LIQ_THRESHOLD_BPS);

		const expected = (COLLATERAL_USD * 0.78) / DEBT_USD;
		expect(hf).toBeCloseTo(expected, 4);
	});

	it('adding collateral increases HF', () => {
		const baseHf = calculateProjectedHealthFactor(COLLATERAL_USD, DEBT_USD, LIQ_THRESHOLD_BPS);
		const boostedHf = calculateProjectedHealthFactor(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			50_000
		);

		expect(boostedHf).toBeGreaterThan(baseHf);
	});

	it('adding debt decreases HF', () => {
		const baseHf = calculateProjectedHealthFactor(COLLATERAL_USD, DEBT_USD, LIQ_THRESHOLD_BPS);
		const reducedHf = calculateProjectedHealthFactor(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			0,
			20_000
		);

		expect(reducedHf).toBeLessThan(baseHf);
	});

	it('repay all debt: returns 999', () => {
		const hf = calculateProjectedHealthFactor(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			0,
			-DEBT_USD
		);

		expect(hf).toBe(999);
	});

	it('withdraw collateral reduces HF', () => {
		const baseHf = calculateProjectedHealthFactor(COLLATERAL_USD, DEBT_USD, LIQ_THRESHOLD_BPS);
		const afterWithdraw = calculateProjectedHealthFactor(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			-50_000
		);

		expect(afterWithdraw).toBeLessThan(baseHf);
	});

	it('zero debt: returns 999', () => {
		const hf = calculateProjectedHealthFactor(COLLATERAL_USD, 0, LIQ_THRESHOLD_BPS);
		expect(hf).toBe(999);
	});

	it('NaN inputs: returns 0', () => {
		const hf = calculateProjectedHealthFactor(NaN, DEBT_USD, LIQ_THRESHOLD_BPS);
		expect(hf).toBe(0);
	});

	it('negative debt clamped to 0: returns 999', () => {
		const hf = calculateProjectedHealthFactor(
			COLLATERAL_USD,
			DEBT_USD,
			LIQ_THRESHOLD_BPS,
			0,
			-DEBT_USD - 10_000
		);

		expect(hf).toBe(999);
	});
});

describe('calculateLtv', () => {
	it('85000 / 215000 = ~3953 bps', () => {
		const ltv = calculateLtv(DEBT_USD, COLLATERAL_USD);
		expect(ltv).toBeCloseTo(3953.49, 1);
	});

	it('zero debt: returns 0', () => {
		expect(calculateLtv(0, COLLATERAL_USD)).toBe(0);
	});

	it('zero collateral: returns 0', () => {
		expect(calculateLtv(DEBT_USD, 0)).toBe(0);
	});

	it('negative collateral: returns 0', () => {
		expect(calculateLtv(DEBT_USD, -100)).toBe(0);
	});

	it('negative debt: returns 0', () => {
		expect(calculateLtv(-100, COLLATERAL_USD)).toBe(0);
	});

	it('NaN inputs: returns 0', () => {
		expect(calculateLtv(NaN, COLLATERAL_USD)).toBe(0);
		expect(calculateLtv(DEBT_USD, NaN)).toBe(0);
	});

	it('equal debt and collateral: 10000 bps', () => {
		expect(calculateLtv(1000, 1000)).toBeCloseTo(10000, 1);
	});
});

describe('deriveHealthStatus', () => {
	it('HF >= 2 is safe', () => {
		expect(deriveHealthStatus(2.0)).toBe('safe');
		expect(deriveHealthStatus(5.0)).toBe('safe');
		expect(deriveHealthStatus(100)).toBe('safe');
	});

	it('HF 1.5 to < 2 is monitor', () => {
		expect(deriveHealthStatus(1.5)).toBe('monitor');
		expect(deriveHealthStatus(1.99)).toBe('monitor');
	});

	it('HF < 1.5 is risk', () => {
		expect(deriveHealthStatus(1.49)).toBe('risk');
		expect(deriveHealthStatus(1.0)).toBe('risk');
		expect(deriveHealthStatus(0.5)).toBe('risk');
	});

	it('HF = 0 is risk', () => {
		expect(deriveHealthStatus(0)).toBe('risk');
	});

	it('negative HF is risk', () => {
		expect(deriveHealthStatus(-1)).toBe('risk');
	});

	it('NaN is risk', () => {
		expect(deriveHealthStatus(NaN)).toBe('risk');
	});

	it('Infinity is safe', () => {
		expect(deriveHealthStatus(Infinity)).toBe('safe');
	});
});

describe('audit hardening: additional edge cases', () => {
	it('HF exactly 1.0 returns correct projected HF', () => {
		const hf = calculateProjectedHealthFactor(100, 78, 7800);
		expect(hf).toBeCloseTo(1.0, 4);
	});

	it('bufferMultiplier = 1.0 gives postWithdrawHf = 1.0', () => {
		const result = calculateMaxSafeWithdraw(215000, 85000, 7800, 1.97, 100000, 8, 1.0);
		expect(result.postWithdrawHealthFactor).toBeCloseTo(1.0, 2);
	});

	it('liquidationThresholdBps = 0 returns zero liq price', () => {
		const result = calculateBtcLiquidationPrice(85000, 2.15, 0, 100000);
		expect(result.liquidationBtcPrice).toBe(0);
		expect(result.distancePercent).toBe(0);
	});

	it('negative BPS returns zero liq price', () => {
		const result = calculateBtcLiquidationPrice(85000, 2.15, -100, 100000);
		expect(result.liquidationBtcPrice).toBe(0);
	});

	it('negative BPS in maxSafeWithdraw returns zero', () => {
		const result = calculateMaxSafeWithdraw(215000, 85000, -100, 2.0, 100000);
		expect(result.maxSafeCollateralUsd).toBe(0);
	});

	it('NaN collateralDecimals returns zero', () => {
		const result = calculateMaxSafeWithdraw(215000, 85000, 7800, 2.0, 100000, NaN);
		expect(result.maxSafeCollateralUsd).toBe(0);
		expect(result.maxSafeCollateralAssetAmount).toBe(0n);
	});

	it('current price below liq price gives negative distancePercent', () => {
		const result = calculateBtcLiquidationPrice(85000, 2.15, 7800, 30000);
		expect(result.distancePercent).toBeLessThan(0);
	});

	it('combined collateral+debt delta in projected HF', () => {
		const base = calculateProjectedHealthFactor(215000, 85000, 7800);
		const both = calculateProjectedHealthFactor(215000, 85000, 7800, 50000, -20000);
		expect(both).toBeGreaterThan(base);
	});
});
