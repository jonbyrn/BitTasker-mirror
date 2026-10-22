/**
 * Client-side search matching used when Meilisearch is not configured.
 * Covers description, category, skills, and tags once they are in the haystack,
 * plus the synonym groups Jon asked for and a one-edit typo tolerance.
 */

const SYNONYM_GROUPS: readonly (readonly string[])[] = [
	['spanish', 'translation', 'translate', 'espanol', 'traduccion'],
	['copywriting', 'writing', 'copywriter'],
	['proofread', 'proofreading', 'editing', 'proofreader'],
	['design', 'designer', 'diseno', 'disenador']
];

export function normalizeSearchText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

function tokensOf(text: string): string[] {
	return normalizeSearchText(text)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 0);
}

function expansions(token: string): string[] {
	const group = SYNONYM_GROUPS.find((entry) => entry.includes(token));
	return group ? [...group] : [token];
}

function editDistanceAtMostOne(left: string, right: string): boolean {
	if (left === right) return true;
	const lengthGap = Math.abs(left.length - right.length);
	if (lengthGap > 1) return false;

	let edits = 0;
	let i = 0;
	let j = 0;
	while (i < left.length && j < right.length) {
		if (left[i] === right[j]) {
			i += 1;
			j += 1;
			continue;
		}
		edits += 1;
		if (edits > 1) return false;
		if (left.length > right.length) i += 1;
		else if (right.length > left.length) j += 1;
		else {
			i += 1;
			j += 1;
		}
	}
	if (i < left.length || j < right.length) edits += 1;
	return edits <= 1;
}

function tokenHits(option: string, hayTokens: string[], haystack: string): boolean {
	if (haystack.includes(option)) return true;
	return hayTokens.some((hay) => {
		// A listing word may contain the query ("designer" matches "design").
		// The query must not match because it contains a shorter listing word:
		// "design" contains "de" and "es", and "wordpress" contains "or" and "es".
		if (hay.includes(option)) return true;
		if (option.length < 5 || hay.length < 5) return false;
		return editDistanceAtMostOne(option, hay);
	});
}

/** True when every query word (or a synonym / one-edit typo) appears in the haystack. */
export function textMatchesQuery(haystack: string, query: string): boolean {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return true;
	const normalizedHay = normalizeSearchText(haystack);
	if (!normalizedHay) return false;
	if (normalizedHay.includes(normalizedQuery)) return true;

	const hayTokens = tokensOf(normalizedHay);
	const queryTokens = tokensOf(normalizedQuery);
	if (queryTokens.length === 0) return true;

	return queryTokens.every((token) =>
		expansions(token).some((option) => tokenHits(option, hayTokens, normalizedHay))
	);
}
