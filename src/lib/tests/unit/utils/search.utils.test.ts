import { describe, expect, it } from 'vitest';
import { hashSearchParams } from '$lib/utils/search.utils';

describe('hashSearchParams', () => {
	it('hashes search params correctly with s: prefix', () => {
		const result = hashSearchParams({ search: 'web development' });
		expect(result).toBe('s:web development');
	});

	it('hashes page param with p: prefix', () => {
		const result = hashSearchParams({ page: 2 });
		expect(result).toBe('p:2');
	});

	it('hashes limit param with l: prefix', () => {
		const result = hashSearchParams({ limit: 20 });
		expect(result).toBe('l:20');
	});

	it('handles categories with c: prefix', () => {
		const result = hashSearchParams({ categories: ['design', 'development'] });
		expect(result).toBe('c:design,development');
	});

	it('handles skills with sk: prefix', () => {
		const result = hashSearchParams({ skills: ['javascript', 'typescript'] });
		expect(result).toBe('sk:javascript,typescript');
	});

	it('handles serviceLocationTypes with loc: prefix', () => {
		const result = hashSearchParams({ serviceLocationTypes: ['remote', 'onsite'] });
		expect(result).toBe('loc:onsite,remote');
	});

	it('handles pricingType with pt: prefix', () => {
		const result = hashSearchParams({ pricingType: 'fixed' });
		expect(result).toBe('pt:fixed');
	});

	it('handles minPrice with min: prefix', () => {
		const result = hashSearchParams({ minPrice: 50 });
		expect(result).toBe('min:50');
	});

	it('handles maxPrice with max: prefix', () => {
		const result = hashSearchParams({ maxPrice: 500 });
		expect(result).toBe('max:500');
	});

	it('handles deliveryTime with dt: prefix', () => {
		const result = hashSearchParams({ deliveryTime: 'express' });
		expect(result).toBe('dt:express');
	});

	it('handles location with locn: prefix', () => {
		const result = hashSearchParams({ location: 'London' });
		expect(result).toBe('locn:London');
	});

	it('handles locationCoords with locc: prefix', () => {
		const result = hashSearchParams({
			locationCoords: { latitude: 51.5074, longitude: -0.1278 }
		});
		expect(result).toBe('locc:51.5074,-0.1278');
	});

	it('handles empty/undefined params', () => {
		const result = hashSearchParams({});
		expect(result).toBe('');
	});

	it('handles undefined params', () => {
		const result = hashSearchParams({
			search: undefined,
			page: undefined,
			categories: undefined
		});
		expect(result).toBe('');
	});

	it('sorts array params for consistent hashing', () => {
		const result1 = hashSearchParams({ categories: ['zebra', 'apple', 'mango'] });
		const result2 = hashSearchParams({ categories: ['apple', 'mango', 'zebra'] });
		expect(result1).toBe(result2);
	});

	it('returns empty string when no params provided', () => {
		const result = hashSearchParams({});
		expect(result).toBe('');
	});

	it('combines multiple params in correct order', () => {
		const result = hashSearchParams({
			search: 'developer',
			page: 1,
			limit: 10,
			categories: ['tech']
		});
		expect(result).toBe('s:developer|p:1|l:10|c:tech');
	});

	it('location coordinates format correctly with latitude,longitude', () => {
		const result = hashSearchParams({
			locationCoords: { latitude: 40.7128, longitude: -74.006 }
		});
		expect(result).toBe('locc:40.7128,-74.006');
	});
});