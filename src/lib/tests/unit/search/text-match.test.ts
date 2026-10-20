import { describe, expect, it } from 'vitest';
import { textMatchesQuery } from '$lib/search/text-match';

const cafe =
	'Translate a short cafe menu from English to Spanish. Category: Writing & Editing. Skills: translation.';
const blog = 'Proofread a 600-word blog post about coffee brewing. Skills: editing.';

describe('textMatchesQuery', () => {
	it('matches description, category, and skills text', () => {
		expect(textMatchesQuery(cafe, 'cafe menu')).toBe(true);
		expect(textMatchesQuery(cafe, 'writing')).toBe(true);
		expect(textMatchesQuery(cafe, 'translation')).toBe(true);
	});

	it('expands the production synonym groups', () => {
		expect(textMatchesQuery(cafe, 'spanish')).toBe(true);
		expect(textMatchesQuery('Copywriting for a landing page', 'writing')).toBe(true);
		expect(textMatchesQuery(blog, 'proofread')).toBe(true);
		expect(textMatchesQuery(blog, 'proofreading')).toBe(true);
	});

	it('tolerates a single-character typo on longer words', () => {
		expect(textMatchesQuery(cafe, 'translatin')).toBe(true);
		expect(textMatchesQuery(blog, 'cofee brewing')).toBe(true);
		expect(textMatchesQuery(blog, 'coffee')).toBe(true);
	});

	it('does not match an unrelated query', () => {
		expect(textMatchesQuery(cafe, 'plumbing')).toBe(false);
	});
});
