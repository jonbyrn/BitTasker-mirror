/**
 * Exclusive word lists. "a" is a Spanish preposition and an English article,
 * so it is not a signal for either language. "pie" is Spanish ("a pie" = on foot).
 */
const SPANISH = new Set([
	'el',
	'la',
	'los',
	'las',
	'un',
	'una',
	'unos',
	'unas',
	'del',
	'al',
	'en',
	'por',
	'para',
	'con',
	'que',
	'de',
	'lo',
	'limpiar',
	'cocina',
	'puerta',
	'habitacion',
	'reparar',
	'resumen',
	'resumiendo',
	'pintar',
	'necesito',
	'hola',
	'gracias',
	'servicio',
	'tarea',
	'pie',
	'fondo'
]);

const ENGLISH = new Set([
	'the',
	'and',
	'to',
	'of',
	'for',
	'with',
	'this',
	'that',
	'from',
	'your',
	'you',
	'need',
	'clean',
	'kitchen',
	'door',
	'room',
	'summary',
	'please',
	'help',
	'task',
	'service',
	'paint',
	'repair'
]);

/** @param {unknown} text */
export function detectLanguage(text) {
	const words =
		String(text || '')
			.toLowerCase()
			.match(/[a-záéíóúüñ]+/gi) || [];
	let spanish = 0;
	let english = 0;
	for (const word of words) {
		const folded = word.normalize('NFD').replace(/\p{M}/gu, '');
		if (SPANISH.has(word) || SPANISH.has(folded)) spanish += 1;
		else if (ENGLISH.has(word) || ENGLISH.has(folded)) english += 1;
	}
	if (spanish === english) return 'unknown';
	return spanish > english ? 'es' : 'en';
}

/** @param {unknown} locale */
export function uiLanguage(locale) {
	return String(locale || 'en')
		.toLowerCase()
		.startsWith('es')
		? 'es'
		: 'en';
}

/**
 * Offer a translation only when the source is a known language and it is not
 * already the language of the UI.
 * @param {unknown} text
 * @param {unknown} locale
 */
export function shouldOfferTranslation(text, locale) {
	const source = detectLanguage(text);
	if (source !== 'en' && source !== 'es') return false;
	return source !== uiLanguage(locale);
}
