import { describe, expect, it } from 'vitest';
import {
	SEARCH_CATEGORIES,
	categoriesFor,
	categoryCopy,
	classifyListing,
	labelFor
} from '$lib/search/taxonomy.js';
import { allTaxonomySkills } from '$lib/search/taxonomy.js';
import { SERVICE_SKILL_OPTIONS } from '$lib/utils/constants/skills';

const LOCAL_IDS = [
	'cleaning',
	'removals',
	'handyman',
	'assembly',
	'gardening',
	'plumbing',
	'electrical',
	'painting',
	'pets',
	'beauty',
	'automotive',
	'events'
];

const REMOTE_IDS = [
	'admin',
	'computers',
	'development',
	'design',
	'marketing',
	'writing',
	'tutoring',
	'bitcoin',
	'ai'
];

describe('category taxonomy', () => {
	it('lists the in-person and remote categories, each with Other', () => {
		expect(categoriesFor('local').map((category) => category.id)).toEqual(LOCAL_IDS);
		expect(categoriesFor('remote').map((category) => category.id)).toEqual(REMOTE_IDS);
		for (const category of SEARCH_CATEGORIES) {
			expect(category.icon).toBeTruthy();
			expect(category.name.length).toBeLessThan(40);
			expect(category.nameEs.length).toBeLessThan(40);
			expect(category.subcategories.at(-1)?.id).toBe('other');
			expect(category.subcategories.at(-1)?.nameEs).toBe('Otro');
		}
	});

	it('keeps the skills dropdown filled from the taxonomy', () => {
		expect(allTaxonomySkills()).toEqual(
			expect.arrayContaining(['Web development', 'Summarizing', 'Translation', 'Technical writing'])
		);
		expect(SERVICE_SKILL_OPTIONS).toEqual(
			expect.arrayContaining(['Web development', 'Summarizing', 'Translation', 'Technical writing'])
		);
	});

	it('classifies old listings and keeps an explicit choice', () => {
		expect(
			classifyListing({
				title: 'End of lease clean for a two bedroom flat',
				categories: [{ id: '1', name: 'Cleaning & Maintenance' }]
			})
		).toMatchObject({ category: 'cleaning' });

		expect(
			classifyListing({
				title: 'Logo for a coffee shop',
				categories: [{ id: '13', name: 'Creative & Design' }]
			}).category
		).toBe('design');

		expect(
			classifyListing({
				title: 'Something else entirely',
				searchCategory: 'bitcoin',
				searchSubcategory: 'other'
			})
		).toMatchObject({ category: 'bitcoin', subcategory: 'other', source: 'chosen' });
	});

	it('uses short Spanish labels', () => {
		expect(labelFor('writing', 'es')).toBe('Redacción y traducción');
		expect(categoryCopy('es').needDone).toBe('¿Qué necesitas?');
		expect(categoryCopy('en').inPerson).toBe('In person');
	});
});
