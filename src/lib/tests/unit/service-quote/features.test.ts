import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getServiceQuoteFeatures,
	supportsServicePurchaseKeyCapability
} from '$lib/utils/service-quote/features';

describe('service-quote feature flags', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('fails closed when dependent flags are missing', () => {
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_READ', 'true');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_WRITE', 'true');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_CONTRACTS_FILTER', 'false');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_ACCEPT', 'true');

		expect(getServiceQuoteFeatures()).toEqual({
			read: true,
			write: true,
			contractsFilter: false,
			accept: false
		});
	});

	it('enables purchase-key capability and accepted status only when all dependencies are present', () => {
		vi.stubEnv('VITE_SERVICE_QUOTES_PURCHASE_KEY_ENABLED', 'true');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_READ', 'true');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_WRITE', 'true');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_CONTRACTS_FILTER', 'true');
		vi.stubEnv('VITE_FEATURE_SERVICE_QUOTES_ACCEPT', 'true');

		expect(supportsServicePurchaseKeyCapability()).toBe(true);
		expect(getServiceQuoteFeatures()).toEqual({
			read: true,
			write: true,
			contractsFilter: true,
			accept: true
		});
	});
});
