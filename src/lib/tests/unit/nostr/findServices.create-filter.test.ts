import { describe, expect, it } from 'vitest';
import { createServiceFilter } from '$lib/nostr/findServices';
import KINDS from '$lib/utils/constants/kinds';
import {
	ServiceLocationTypeEnum,
	ServicePricingTypeEnum,
	type ServiceStatus
} from '$lib/utils/enums/service.enum';

describe('createServiceFilter', () => {
	const SERVICES_PER_PAGE = 20;

	describe('empty parameters', () => {
		it('should return filter with default kinds and limit when all params undefined', () => {
			const filter = createServiceFilter({});
			expect(filter.kinds).toEqual([KINDS.SERVICE_ACTIVE]);
			expect(filter.limit).toBe(SERVICES_PER_PAGE);
			expect(filter.until).toBeUndefined();
			expect(filter.since).toBeUndefined();
			expect(filter.search).toBeUndefined();
		});
	});

	describe('status filter only', () => {
		it('should add status filter when status is provided', () => {
			const filter = createServiceFilter({ status: ['active'] as ServiceStatus[] });
			expect(filter['#s']).toEqual(['active']);
		});

		it('should add multiple statuses when multiple are provided', () => {
			const filter = createServiceFilter({ status: ['active', 'inactive'] as ServiceStatus[] });
			expect(filter['#s']).toEqual(['active', 'inactive']);
		});
	});

	describe('pricingType filter only', () => {
		it('should add pricing type filter when pricingType is provided', () => {
			const filter = createServiceFilter({ pricingType: ServicePricingTypeEnum.FIXED });
			expect(filter['#y']).toEqual([ServicePricingTypeEnum.FIXED]);
		});
	});

	describe('locationTypes filter only', () => {
		it('should add location types filter when serviceLocationTypes is provided', () => {
			const filter = createServiceFilter({
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE]
			});
			expect(filter['#o']).toEqual([ServiceLocationTypeEnum.REMOTE]);
		});

		it('should add multiple location types when multiple are provided', () => {
			const filter = createServiceFilter({
				serviceLocationTypes: [
					ServiceLocationTypeEnum.REMOTE,
					ServiceLocationTypeEnum.TASKEE_LOCATION
				]
			});
			expect(filter['#o']).toEqual([
				ServiceLocationTypeEnum.REMOTE,
				ServiceLocationTypeEnum.TASKEE_LOCATION
			]);
		});
	});

	describe('search term filtering', () => {
		it('should add search term when search is provided', () => {
			const filter = createServiceFilter({ search: 'web design' });
			expect(filter.search).toBe('web design');
		});

		it('should trim search term', () => {
			const filter = createServiceFilter({ search: '  web design  ' });
			expect(filter.search).toBe('web design');
		});

		it('should use SERVICES_PER_PAGE limit when search is present', () => {
			const filter = createServiceFilter({ search: 'design' });
			expect(filter.limit).toBe(SERVICES_PER_PAGE);
		});

		it('should use default limit when search is empty string', () => {
			const filter = createServiceFilter({ search: '' });
			expect(filter.limit).toBe(SERVICES_PER_PAGE);
		});
	});

	describe('minPrice/maxPrice filters', () => {
		it('should add min price filter when minPrice is provided', () => {
			const filter = createServiceFilter({ minPrice: 50 });
			expect(filter['#i']).toEqual(['50']);
		});

		it('should add max price filter when maxPrice is provided', () => {
			const filter = createServiceFilter({ maxPrice: 500 });
			expect(filter['#x']).toEqual(['500']);
		});

		it('should add both min and max price filters when both are provided', () => {
			const filter = createServiceFilter({ minPrice: 50, maxPrice: 500 });
			expect(filter['#i']).toEqual(['50']);
			expect(filter['#x']).toEqual(['500']);
		});
	});

	describe('deliveryTime filter', () => {
		it('should add delivery time filter when deliveryTime is provided', () => {
			const filter = createServiceFilter({ deliveryTime: 24 });
			expect(filter['#u']).toEqual(['24']);
		});
	});

	describe('multiple filters combined', () => {
		it('should combine status and pricingType filters', () => {
			const filter = createServiceFilter({
				status: ['active'] as ServiceStatus[],
				pricingType: ServicePricingTypeEnum.FIXED
			});
			expect(filter['#s']).toEqual(['active']);
			expect(filter['#y']).toEqual([ServicePricingTypeEnum.FIXED]);
		});

		it('should combine search with other filters', () => {
			const filter = createServiceFilter({
				search: 'design',
				status: ['active'] as ServiceStatus[],
				minPrice: 100
			});
			expect(filter.search).toBe('design');
			expect(filter['#s']).toEqual(['active']);
			expect(filter['#i']).toEqual(['100']);
			expect(filter.limit).toBe(SERVICES_PER_PAGE);
		});

		it('should combine all filters together', () => {
			const filter = createServiceFilter({
				search: 'web development',
				status: ['active', 'inactive'] as ServiceStatus[],
				pricingType: ServicePricingTypeEnum.HOURLY,
				serviceLocationTypes: [
					ServiceLocationTypeEnum.REMOTE,
					ServiceLocationTypeEnum.TASKEE_LOCATION
				],
				minPrice: 50,
				maxPrice: 500,
				deliveryTime: 48
			});
			expect(filter.search).toBe('web development');
			expect(filter['#s']).toEqual(['active', 'inactive']);
			expect(filter['#y']).toEqual([ServicePricingTypeEnum.HOURLY]);
			expect(filter['#o']).toEqual([
				ServiceLocationTypeEnum.REMOTE,
				ServiceLocationTypeEnum.TASKEE_LOCATION
			]);
			expect(filter['#i']).toEqual(['50']);
			expect(filter['#x']).toEqual(['500']);
			expect(filter['#u']).toEqual(['48']);
		});
	});

	describe('edge cases', () => {
		it('should not set search property when search is empty string', () => {
			const filter = createServiceFilter({ search: '' });
			expect(filter.search).toBeUndefined();
			expect(filter.limit).toBe(SERVICES_PER_PAGE);
		});

		it('should handle status with empty array', () => {
			const filter = createServiceFilter({ status: [] as ServiceStatus[] });
			expect(filter['#s']).toBeUndefined();
		});

		it('should handle locationTypes with empty array', () => {
			const filter = createServiceFilter({ serviceLocationTypes: [] });
			expect(filter['#o']).toBeUndefined();
		});

		it('should preserve since and until when provided', () => {
			const since = 1700000000;
			const until = 1700100000;
			const filter = createServiceFilter({ since, until });
			expect(filter.since).toBe(since);
			expect(filter.until).toBe(until);
		});

		it('should use custom kinds when provided', () => {
			const customKinds = [30050, 30051];
			const filter = createServiceFilter({ kinds: customKinds });
			expect(filter.kinds).toBe(customKinds);
		});

		it('should use custom limit when provided without search', () => {
			const filter = createServiceFilter({ limit: 50 });
			expect(filter.limit).toBe(50);
		});
	});
});
