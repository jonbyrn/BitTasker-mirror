import { SEARCH_SYNONYMS } from './synonyms.js';
import { fold } from './taxonomy.js';

/** @param {string} query */
export function queryTokens(query) {
	return fold(query)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 1);
}

/** @param {string} token */
export function tokenVariants(token) {
	const folded = fold(token);
	const variants = new Set([folded]);
	for (const group of SEARCH_SYNONYMS) {
		const words = group.synonyms.map((word) => fold(word));
		if (!words.includes(folded)) continue;
		for (const word of words) {
			if (word.length > 1) variants.add(word);
		}
	}
	return [...variants];
}

/**
 * Accent-insensitive text match. An English word hits its Spanish synonym and the reverse.
 * @param {string} haystack
 * @param {string} query
 */
export function textMatchesQuery(haystack, query) {
	const needle = fold(query);
	if (!needle) return true;
	const hay = fold(haystack);
	if (hay.includes(needle)) return true;
	const tokens = queryTokens(query);
	if (tokens.length === 0) return false;
	return tokens.every((token) => tokenVariants(token).some((variant) => hay.includes(variant)));
}
