import { describe, expect, it } from 'vitest';
import {
	isSvCountryQuery,
	isSvPlace,
	locationMatchesQuery
} from '$lib/browse/places.js';

describe('El Salvador places', () => {
	it('matches the country code, the country name, and city names', () => {
		expect(isSvCountryQuery('SV')).toBe(true);
		expect(isSvCountryQuery('sv')).toBe(true);
		expect(isSvCountryQuery('El Salvador')).toBe(true);
		expect(isSvCountryQuery('el salvador')).toBe(true);
		expect(isSvPlace('SV')).toBe(true);
		expect(isSvPlace('Santa Tecla')).toBe(true);
		expect(isSvPlace('Usulután')).toBe(true);
		expect(locationMatchesQuery('Santa Tecla', 'El Salvador')).toBe(true);
		expect(locationMatchesQuery('Usulután', 'SV')).toBe(true);
		expect(locationMatchesQuery('SAN SALVADOR', 'el salvador')).toBe(true);
		expect(locationMatchesQuery('Austin, Texas', 'El Salvador')).toBe(false);
		expect(locationMatchesQuery('Austin, Texas', 'SV')).toBe(false);
		expect(locationMatchesQuery('La Paz, Bolivia', 'El Salvador')).toBe(false);
		expect(locationMatchesQuery('Colonia', 'El Salvador')).toBe(false);
		expect(locationMatchesQuery('Colonia Escalón, El Salvador', 'sv')).toBe(true);
	});
});
