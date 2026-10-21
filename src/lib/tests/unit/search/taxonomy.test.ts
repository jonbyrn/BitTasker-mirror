import { describe, expect, it } from 'vitest';
import {
	POPULAR_SERVICES,
	SEARCH_CATEGORIES,
	categoriesFor,
	categoryCopy,
	classifyListing,
	labelFor,
	priceLabel,
	serviceSuggestions
} from '$lib/search/taxonomy.js';
import { allTaxonomySkills } from '$lib/search/taxonomy.js';
import { SERVICE_SKILL_OPTIONS } from '$lib/utils/constants/skills';

const LOCAL_IDS = [
	'cleaning',
	'removals',
	'moving',
	'handyman',
	'assembly',
	'mounting',
	'gardening',
	'plumbing',
	'electrical',
	'painting',
	'pets',
	'beauty',
	'automotive',
	'events',
	'temp-staff'
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
			expect(category.fromPrice).toBeGreaterThan(0);
			expect(['project', 'hour']).toContain(category.priceUnit);
		}
		expect(new Set(SEARCH_CATEGORIES.map((category) => category.id)).size).toBe(
			SEARCH_CATEGORIES.length
		);
	});

	it('points popular services at existing categories without a second copy', () => {
		expect(POPULAR_SERVICES.map((service) => service.name)).toEqual([
			'Furniture assembly',
			'Mounting',
			'Moving help',
			'Cleaning',
			'Handyman',
			'Yard work'
		]);
		const categoryIds = new Set(SEARCH_CATEGORIES.map((category) => category.id));
		expect(POPULAR_SERVICES.map((service) => service.categoryId)).toEqual([
			'assembly',
			'mounting',
			'moving',
			'cleaning',
			'handyman',
			'gardening'
		]);
		for (const service of POPULAR_SERVICES) {
			expect(categoryIds.has(service.categoryId)).toBe(true);
		}
		expect(categoryIds.has('yard-work')).toBe(false);
		expect(categoryIds.has('furniture-assembly')).toBe(false);
		expect(priceLabel(15, 'project', 'en')).toBe('From $15');
		expect(priceLabel(8, 'hour', 'es')).toBe('Desde $8/h');
		const priceFor = (id: string) => SEARCH_CATEGORIES.find((category) => category.id === id);
		expect(priceFor('cleaning')).toMatchObject({ fromPrice: 15, priceUnit: 'project' });
		expect(priceFor('plumbing')).toMatchObject({ fromPrice: 30, priceUnit: 'project' });
		expect(priceFor('electrical')).toMatchObject({ fromPrice: 35, priceUnit: 'project' });
		expect(priceFor('removals')).toMatchObject({ fromPrice: 150, priceUnit: 'project' });
		expect(priceFor('handyman')).toMatchObject({ fromPrice: 8, priceUnit: 'hour' });
		expect(priceFor('temp-staff')?.fromPrice).toBeGreaterThan(1.68);
		expect(priceFor('development')?.fromPrice).toBeLessThan(20);
		expect(serviceSuggestions('', 'en').map((item) => item.id)).toEqual(
			POPULAR_SERVICES.map((service) => service.id)
		);
		expect(serviceSuggestions('tv', 'en').some((item) => item.categoryId === 'mounting')).toBe(
			true
		);
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

		expect(classifyListing({ title: 'Saturday cleaning shift in a hotel' }).category).toBe(
			'temp-staff'
		);
		expect(classifyListing({ title: 'Wedding photographer for the reception' }).category).toBe(
			'events'
		);
		expect(classifyListing({ title: 'Event staff for a product launch' }).category).toBe(
			'temp-staff'
		);

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
		expect(categoryCopy('en').helpWith).toBe('What do you need help with?');
		expect(categoryCopy('en').inPerson).toBe('In person');
		expect(classifyListing({ title: 'Mount a TV on the living room wall' }).category).toBe(
			'mounting'
		);
		expect(classifyListing({ title: 'Help moving a couch upstairs' }).category).toBe('moving');
		expect(classifyListing({ title: 'IKEA furniture assembly for a desk' }).category).toBe(
			'assembly'
		);
	});
});
