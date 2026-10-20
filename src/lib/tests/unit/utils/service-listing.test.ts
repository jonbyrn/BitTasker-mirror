import { describe, expect, it } from 'vitest';
import { SERVICE_SKILL_OPTIONS } from '$lib/utils/constants/skills';
import {
	createServiceAliasPath,
	deliveryTimeFromHours,
	normalizeServicePriceCurrency,
	providerWalletForPublish
} from '$lib/utils/service/listing';

describe('service listing helpers', () => {
	it('treats legacy USDt as USDT and leaves dollars as USD', () => {
		expect(normalizeServicePriceCurrency('USDt')).toBe('USDT');
		expect(normalizeServicePriceCurrency('usdt')).toBe('USDT');
		expect(normalizeServicePriceCurrency('USD')).toBe('USD');
		expect(normalizeServicePriceCurrency(undefined)).toBe('USD');
	});

	it('keeps an already open wallet address and never invents one', () => {
		expect(providerWalletForPublish(undefined, '  rgb1address  ')).toBe('rgb1address');
		expect(providerWalletForPublish('', null, undefined)).toBeUndefined();
	});

	it('sends /services/new to the create page', () => {
		expect(createServiceAliasPath('new')).toBe('/create-service');
		expect(createServiceAliasPath(' NEW ')).toBe('/create-service');
		expect(createServiceAliasPath('service-123')).toBeNull();
	});

	it('stores a single delivery time from hours', () => {
		expect(deliveryTimeFromHours(72, 'day')).toEqual({
			min: 3,
			max: 3,
			unit: 'day',
			display: '3 days'
		});
	});

	it('lists skills for the create-service dropdown', () => {
		expect(SERVICE_SKILL_OPTIONS.length).toBeGreaterThan(20);
		expect(SERVICE_SKILL_OPTIONS).toContain('Web development');
		expect(new Set(SERVICE_SKILL_OPTIONS).size).toBe(SERVICE_SKILL_OPTIONS.length);
	});
});
