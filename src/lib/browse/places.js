/** Accent- and case-insensitive place text. */
export function foldPlace(value) {
	return String(value || '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim();
}

/**
 * Cities, departments, and beaches used on El Salvador listings.
 * Matching is on whole names, so "colon" does not hit "colonia".
 */
const SV_CITIES = [
	'el salvador',
	'san salvador',
	'santa tecla',
	'la libertad',
	'santa ana',
	'sonsonate',
	'usulutan',
	'san miguel',
	'ahuachapan',
	'chalatenango',
	'cuscatlan',
	'cabanas',
	'morazan',
	'la paz',
	'la union',
	'san vicente',
	'antiguo cuscatlan',
	'nuevo cuscatlan',
	'el zonte',
	'el tunco',
	'el sunzal',
	'el cuco',
	'san blas',
	'lourdes',
	'escalon',
	'conchalio',
	'chiltiupan',
	'ciudad arce',
	'la costa',
	'soyapango',
	'apopa',
	'mejicanos',
	'ilopango',
	'san marcos',
	'ayutuxtepeque',
	'cuscatancingo',
	'ciudad delgado',
	'tonacatepeque',
	'nejapa',
	'zaragoza',
	'colon',
	'quezaltepeque',
	'opico',
	'acajutla',
	'izalco',
	'nahuizalco',
	'juayua',
	'atiquizaya',
	'metapan',
	'coatepeque',
	'cojutepeque',
	'zacatecoluca',
	'sensuntepeque',
	'san francisco gotera',
	'ilobasco',
	'santa rosa de lima',
	'san martin',
	'santo tomas',
	'panchimalco',
	'olocuilta',
	'san juan opico',
	'puerto de la libertad',
	'mizata'
];

function tokens(value) {
	return foldPlace(value)
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

function hasName(folded, name) {
	const needle = foldPlace(name);
	if (!needle) return false;
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(folded);
}

/** Named places outside El Salvador. A city name alone is not enough to reject SV. */
const FOREIGN_PLACES = [
	'united states',
	'estados unidos',
	'united kingdom',
	'texas',
	'austin',
	'spain',
	'espana',
	'mexico',
	'guatemala',
	'honduras',
	'nicaragua',
	'costa rica',
	'france',
	'francia',
	'canada',
	'australia',
	'portugal',
	'dubai',
	'germany',
	'alemania',
	'bolivia',
	'argentina',
	'colombia',
	'chile',
	'peru',
	'panama',
	'brazil',
	'brasil',
	'ecuador',
	'uruguay',
	'paraguay',
	'venezuela'
];

function namesForeign(folded) {
	return FOREIGN_PLACES.some((place) => hasName(folded, place));
}

/** A country-code or country-name query for El Salvador. */
export function isSvCountryQuery(query) {
	const folded = foldPlace(query);
	if (!folded) return false;
	if (folded === 'sv' || folded === 'slv' || folded === 'el salvador') return true;
	const parts = tokens(folded);
	if (parts.length === 1 && (parts[0] === 'sv' || parts[0] === 'slv')) return true;
	return parts.includes('salvador') && (parts.includes('el') || parts.includes('republica'));
}

/** Location text that names El Salvador, its code, or one of its cities. */
export function isSvPlace(value) {
	const folded = foldPlace(value);
	if (!folded) return false;
	if (folded.includes('el salvador')) return true;
	if (namesForeign(folded)) return false;
	const parts = tokens(folded);
	if (parts.includes('sv') || parts.includes('slv')) return true;
	return SV_CITIES.some((city) => hasName(folded, city));
}

/**
 * Location filter. "El Salvador" and "SV" also match city names on SV listings.
 * Comparison ignores case and accents.
 */
export function locationMatchesQuery(location, query) {
	const needle = foldPlace(query);
	if (!needle) return true;
	const hay = foldPlace(location);
	if (hay.includes(needle)) return true;
	return isSvCountryQuery(query) && isSvPlace(location);
}
