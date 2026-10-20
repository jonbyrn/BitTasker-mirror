import { describe, expect, it } from 'vitest';
import { SERVICE_SKILL_OPTIONS } from '$lib/utils/constants/skills';
import { retargetDurationHours } from '$lib/utils/service-instant-buy/authoring';
import {
	createServiceAliasPath,
	deliveryTimeFromHours,
	normalizeServicePriceCurrency,
	providerWalletForPublish,
	servicePagePath
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
		expect(SERVICE_SKILL_OPTIONS).toContain('Summarizing');
		expect(SERVICE_SKILL_OPTIONS).toContain('Translation');
		expect(SERVICE_SKILL_OPTIONS).toContain('Technical writing');
		expect(new Set(SERVICE_SKILL_OPTIONS).size).toBe(SERVICE_SKILL_OPTIONS.length);
	});

	it('keeps one day as 24 hours when the unit changes from hours', () => {
		expect(retargetDurationHours(1, 'hour', 'day')).toBe(24);
		expect(deliveryTimeFromHours(24, 'day')?.display).toBe('1 day');
	});

	it('builds a shareable service path from the public id', () => {
		expect(servicePagePath({ uniqueId: 'service-123', id: 'event' })).toBe(
			'/services/service-123'
		);
		expect(servicePagePath({ uniqueId: '', id: 'abc def' })).toBe('/services/abc%20def');
	});
});
