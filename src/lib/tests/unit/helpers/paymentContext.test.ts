import { describe, expect, it } from 'vitest';
import {
	getDefaultPaymentNetwork,
	getPaymentRailLabel,
	resolvePaymentContext
} from '$lib/utils/helpers/paymentContext';

describe('paymentContext', () => {
	describe('getPaymentRailLabel', () => {
		it('renders legacy BSC tasks with missing paymentAsset as USDT on BSC', () => {
			expect(getPaymentRailLabel(undefined, 'bsc-testnet')).toBe('USDT on BSC');
			expect(getPaymentRailLabel('', 'bsc-mainnet')).toBe('USDT on BSC');
		});

		it('renders asset-only USDT contexts on the default BSC rail', () => {
			expect(getPaymentRailLabel('USDT', undefined)).toBe('USDT on BSC');
			expect(getPaymentRailLabel('USDT', '')).toBe('USDT on BSC');
		});

		it('preserves Rootstock defaults when no BSC context is present', () => {
			expect(getPaymentRailLabel(undefined, undefined)).toBe('rBTC on Rootstock');
			expect(getDefaultPaymentNetwork('RBTC')).toMatch(/^rsk-/);
		});
	});

	describe('resolvePaymentContext', () => {
		it('infers the USDT rail from legacy BSC network-only metadata', () => {
			expect(resolvePaymentContext(undefined, 'bsc-testnet')).toEqual({
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			});
		});

		it('infers the default BSC network from legacy USDT asset-only metadata', () => {
			expect(resolvePaymentContext('USDT', undefined)).toEqual({
				paymentAsset: 'USDT',
				paymentNetwork: getDefaultPaymentNetwork('USDT')
			});
		});
	});
});
