import { describe, expect, it } from 'vitest';
import { hasPlaceOrCoordinates } from '$lib/utils/maps/geocode-on-save';
import {
	DEFAULT_EL_SALVADOR_PLACE,
	elSalvadorPlaceLabel,
	placeMatchingText,
	withElSalvador
} from '$lib/utils/maps/el-salvador-places';

describe('El Salvador place fallback', () => {
	it('names San Salvador as the default and keeps a typed address', () => {
		expect(DEFAULT_EL_SALVADOR_PLACE.city).toBe('San Salvador');
		expect(elSalvadorPlaceLabel(DEFAULT_EL_SALVADOR_PLACE)).toBe(
			'San Salvador, San Salvador, El Salvador'
		);
		expect(withElSalvador('Calle Arce 123')).toBe('Calle Arce 123, El Salvador');
		expect(withElSalvador('San Salvador, El Salvador')).toBe('San Salvador, El Salvador');
		expect(placeMatchingText('santa ana')?.department).toBe('Santa Ana');
		expect(placeMatchingText('sa')).toBeNull();
	});

	it('treats a department label as a location without a map', () => {
		const place = DEFAULT_EL_SALVADOR_PLACE;
		expect(
			hasPlaceOrCoordinates({
				displayName: elSalvadorPlaceLabel(place),
				latitude: place.latitude,
				longitude: place.longitude,
				locationLoaded: true
			})
		).toBe(true);
		expect(
			hasPlaceOrCoordinates({
				displayName: 'Calle Arce 123, El Salvador',
				latitude: null,
				longitude: null,
				locationLoaded: true
			})
		).toBe(true);
	});
});
