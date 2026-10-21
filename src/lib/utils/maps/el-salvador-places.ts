/**
 * City and department choices for in-person locations when Google Maps
 * does not load. Coordinates are the department capitals.
 */
export type ElSalvadorPlace = {
	department: string;
	city: string;
	latitude: number;
	longitude: number;
};

export const EL_SALVADOR_PLACES: ElSalvadorPlace[] = [
	{ department: 'Ahuachapán', city: 'Ahuachapán', latitude: 13.9214, longitude: -89.845 },
	{ department: 'Santa Ana', city: 'Santa Ana', latitude: 13.9942, longitude: -89.5597 },
	{ department: 'Sonsonate', city: 'Sonsonate', latitude: 13.7189, longitude: -89.7242 },
	{ department: 'Chalatenango', city: 'Chalatenango', latitude: 14.0417, longitude: -88.9403 },
	{ department: 'La Libertad', city: 'La Libertad', latitude: 13.4886, longitude: -89.3222 },
	{ department: 'San Salvador', city: 'San Salvador', latitude: 13.6929, longitude: -89.2182 },
	{ department: 'Cuscatlán', city: 'Cojutepeque', latitude: 13.7167, longitude: -88.9333 },
	{ department: 'La Paz', city: 'Zacatecoluca', latitude: 13.5089, longitude: -88.8694 },
	{ department: 'Cabañas', city: 'Sensuntepeque', latitude: 13.8667, longitude: -88.6333 },
	{ department: 'San Vicente', city: 'San Vicente', latitude: 13.6333, longitude: -88.8 },
	{ department: 'Usulután', city: 'Usulután', latitude: 13.3464, longitude: -88.4322 },
	{ department: 'San Miguel', city: 'San Miguel', latitude: 13.4833, longitude: -88.1833 },
	{ department: 'Morazán', city: 'San Francisco Gotera', latitude: 13.7, longitude: -88.1 },
	{ department: 'La Unión', city: 'La Unión', latitude: 13.3369, longitude: -87.8439 }
];

export const DEFAULT_EL_SALVADOR_PLACE =
	EL_SALVADOR_PLACES.find((place) => place.city === 'San Salvador') ?? EL_SALVADOR_PLACES[0];

export function elSalvadorPlaceKey(place: ElSalvadorPlace): string {
	return `${place.department}|${place.city}`;
}

export function elSalvadorPlaceLabel(place: ElSalvadorPlace): string {
	return `${place.city}, ${place.department}, El Salvador`;
}

export function elSalvadorPlaceByKey(key: string): ElSalvadorPlace | null {
	return EL_SALVADOR_PLACES.find((place) => elSalvadorPlaceKey(place) === key) ?? null;
}

/** Match a typed city or department without treating a short prefix as a hit. */
export function placeMatchingText(text: string): ElSalvadorPlace | null {
	const normalized = text.trim().toLowerCase();
	if (normalized.length < 3) return null;
	return (
		EL_SALVADOR_PLACES.find((place) => {
			const city = place.city.toLowerCase();
			const department = place.department.toLowerCase();
			const label = elSalvadorPlaceLabel(place).toLowerCase();
			return (
				normalized === city ||
				normalized === department ||
				normalized === label ||
				normalized.startsWith(`${city},`) ||
				normalized.startsWith(`${city} `)
			);
		}) ?? null
	);
}

/** Keep a typed address geocodable later by naming the country. */
export function withElSalvador(text: string): string {
	const trimmed = text.trim();
	if (!trimmed || /el salvador/i.test(trimmed)) return trimmed;
	return `${trimmed}, El Salvador`;
}
