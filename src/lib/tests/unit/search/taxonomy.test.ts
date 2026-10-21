import { describe, expect, it } from 'vitest';
import {
	POPULAR_SERVICES,
	SEARCH_CATEGORIES,
	popularRowItems,
	categoriesFor,
	categoryCopy,
	classifyListing,
	suggestCategory,
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
	'legal',
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
		expect(labelFor('handyman', 'es')).toBe('Reparaciones');
		expect(priceFor('temp-staff')?.fromPrice).toBeGreaterThan(1.68);
		expect(priceFor('legal')).toMatchObject({
			name: 'Legal & business',
			nameEs: 'Legal y negocios',
			fromPrice: 25,
			priceUnit: 'project'
		});
		expect(suggestCategory({ title: 'Notario para una escritura' }).category).toBe('legal');
		expect(suggestCategory({ title: 'Contador para los impuestos' }).category).toBe('legal');
		expect(suggestCategory({ title: 'Business registration for a new shop' }).category).toBe(
			'legal'
		);
		expect(labelFor('legal', 'es')).toBe('Legal y negocios');
		expect(priceFor('development')?.fromPrice).toBeLessThan(20);
		expect(serviceSuggestions('', 'en').map((item) => item.id)).toEqual(
			POPULAR_SERVICES.map((service) => service.id)
		);
		expect(serviceSuggestions('tv', 'en').some((item) => item.categoryId === 'mounting')).toBe(
			true
		);
		const row = popularRowItems('en').map((service) => service.name);
		expect(row).toContain('Furniture assembly');
		expect(row).toContain('Yard work');
		expect(row).not.toContain('Mounting');
		expect(row).not.toContain('Moving help');
		expect(row).not.toContain('Handyman');
		expect(row).not.toContain('Cleaning');
		expect(popularRowItems('es').map((service) => service.nameEs)).not.toContain('Montaje');
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

	it('keeps the poster choice and still suggests a better category', () => {
		expect(
			classifyListing({
				title: 'Trabajos de pintura para una casa',
				description: 'Albañilería, plomería y pintura',
				searchCategory: 'plumbing'
			})
		).toMatchObject({ category: 'plumbing', source: 'chosen' });
		expect(
			suggestCategory({
				title: 'Trabajos de pintura para una casa',
				description: 'Albañilería, plomería y pintura'
			})
		).toMatchObject({ category: 'painting' });
		expect(classifyListing({ title: 'Pintor para interiores', searchCategory: '' }).category).toBe(
			'painting'
		);
		expect(classifyListing({ title: 'Interpretation service for a meeting' })).toMatchObject({
			category: 'writing',
			subcategory: 'translation'
		});
		expect(classifyListing({ title: 'Zzqxv unrelated listing' })).toMatchObject({
			category: 'handyman',
			subcategory: 'other',
			source: 'fallback'
		});
	});

	it('keeps cleaning and air conditioning out of the wrong bucket', () => {
		expect(
			classifyListing({
				title: 'Necesito ayuda con una limpieza profunda de mi casa',
				categories: [{ id: '4', name: 'Home Improvement' }]
			})
		).toMatchObject({ category: 'cleaning' });
		expect(
			classifyListing({
				title: 'Instalación y mantenimiento de un aire acondicionado residencial',
				description: 'Entrega e instalación el mismo día',
				categories: [{ id: '3', name: 'Delivery & Logistics' }]
			})
		).toMatchObject({ category: 'electrical', subcategory: 'cooling' });
		expect(
			classifyListing({
				title: 'Instalacion y Reparacion de AC',
				categories: [{ id: '4', name: 'Home Improvement' }]
			}).category
		).toBe('electrical');
		expect(
			classifyListing({
				title: 'Book a website check',
				categories: []
			}).category
		).not.toBe('');
		expect(
			classifyListing({
				title: 'Office hours',
				categories: [{ id: '30', name: 'IT and Web Development' }]
			}).category
		).toBe('development');
	});
});
