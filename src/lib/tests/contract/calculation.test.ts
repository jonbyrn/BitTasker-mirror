import { describe, it, expect } from 'vitest';

describe('USD Calculation', () => {
	it('calculates totalPaymentUsd correctly', () => {
		const baseAmount = 0.1; // RBTC
		const clientFee = 0.01; // RBTC
		const btcPrice = 50000; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		expect(totalPaymentUsd).toBe(5500); // 0.11 * 50000
	});

	it('handles precision correctly', () => {
		const baseAmount = 0.12345678; // RBTC
		const clientFee = 0.01234567; // RBTC
		const btcPrice = 50000.123; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		// Allow for floating point precision differences
		expect(totalPaymentUsd).toBeCloseTo(6790.14, 1);
	});

	it('handles very large amounts', () => {
		const baseAmount = 100; // RBTC
		const clientFee = 10; // RBTC
		const btcPrice = 100000; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		expect(totalPaymentUsd).toBe(11000000);
	});

	it('handles very small amounts', () => {
		const baseAmount = 0.0001; // RBTC
		const clientFee = 0.00001; // RBTC
		const btcPrice = 50000; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		expect(totalPaymentUsd).toBeCloseTo(5.5, 4);
	});
});

