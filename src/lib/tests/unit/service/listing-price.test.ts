import { describe, expect, it } from 'vitest';
import { formatServicePriceLine } from '$lib/utils/service/listing';

describe('formatServicePriceLine', () => {
	it('shows an hourly rate once', () => {
		expect(
			formatServicePriceLine({ type: 'HOURLY', hourlyRate: 30, currency: 'USD', amount: 30 })
		).toBe('$30.00/hr');
	});

	it('uses the hourly amount when the rate field is empty', () => {
		expect(formatServicePriceLine({ type: 'HOURLY', amount: 30, currency: 'USD' })).toBe(
			'$30.00/hr'
		);
	});

	it('shows a fixed price once', () => {
		expect(formatServicePriceLine({ type: 'FIXED', amount: 30, currency: 'USD' })).toBe('$30.00');
	});

	it('shows USDT once', () => {
		expect(formatServicePriceLine({ type: 'FIXED', amount: 30, currency: 'USDT' })).toBe(
			'30.00 USDT'
		);
	});
});
