import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getServiceQuoteFeatures,
	supportsServicePurchaseKeyCapability
} from '$lib/utils/service-quote/features';

describe('service-quote features', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('keeps quote browsing and writing enabled by default', () => {
		expect(getServiceQuoteFeatures()).toEqual({
			read: true,
			write: true,
			contractsFilter: true,
			accept: supportsServicePurchaseKeyCapability()
		});
	});

	it('enables purchase-key capability and accepted status when explicitly forced on', () => {
		vi.stubEnv('VITE_SERVICE_QUOTES_PURCHASE_KEY_ENABLED', 'true');

		expect(supportsServicePurchaseKeyCapability()).toBe(true);
		expect(getServiceQuoteFeatures()).toEqual({
			read: true,
			write: true,
			contractsFilter: true,
			accept: true
		});
	});
});
