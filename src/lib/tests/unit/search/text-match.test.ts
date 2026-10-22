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

	it('does not treat a short listing word inside the query as a match', () => {
		expect(textMatchesQuery('Electrician. Wiring for homes or shops.', 'wordpress')).toBe(false);
		expect(textMatchesQuery('SIM card tip', 'wordpress')).toBe(false);
		expect(textMatchesQuery('Personal shopper. I shop for you.', 'wordpress')).toBe(false);
		expect(textMatchesQuery('DJ. Music for events.', 'design')).toBe(false);
		expect(textMatchesQuery('Write a text. Escribo un texto.', 'design')).toBe(false);
		expect(textMatchesQuery('Calle de Alcala, ES', 'design')).toBe(false);
		expect(textMatchesQuery('Calle de Alcala, ES', 'wordpress')).toBe(false);
	});

	it('still matches the query word and the Spanish design synonym', () => {
		expect(textMatchesQuery('WordPress hosting or maintenance', 'wordpress')).toBe(true);
		expect(textMatchesQuery('Logo design for a cafe', 'design')).toBe(true);
		expect(textMatchesQuery('Diseño de logotipos', 'design')).toBe(true);
		expect(textMatchesQuery('Diseñador de marcas', 'design')).toBe(true);
	});
});
