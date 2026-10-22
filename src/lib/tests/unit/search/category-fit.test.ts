import { describe, expect, it } from 'vitest';
import { CATEGORY_FIT_FIXTURES, measureCategoryFit } from '$lib/search/category-fit-fixtures.js';
import { classifyListing, suggestCategory, TITLE_WEIGHT } from '$lib/search/taxonomy.js';

const MISFITS = CATEGORY_FIT_FIXTURES.filter((fixture) => fixture.misfit);

describe('category fit', () => {
	it('weights the title over the description and keeps accents folded', () => {
		expect(TITLE_WEIGHT).toBeGreaterThan(1);
		const titled = suggestCategory({
			title: 'Logo for a coffee shop',
			description: 'Also clean the kitchen and the bathroom'
		});
		const described = suggestCategory({
			title: 'Help this weekend',
			description: 'Logo for a coffee shop'
		});
		expect(titled.category).toBe('design');
		expect(titled.score).toBeGreaterThan(described.score);
		expect(suggestCategory({ title: 'Écrire un texte.' }).category).toBe('writing');
		expect(suggestCategory({ title: 'Fotografía de retrato' }).category).toBe('events');
	});

	it('turns every audit misfit into the category the poster should have picked', () => {
		expect(MISFITS.map((fixture) => fixture.id)).toEqual([
			'task-sapanish',
			'task-fotografo',
			'task-follow-x',
			'service-cameras',
			'service-luminarias',
			'service-autocad',
			'service-sim',
			'service-obra',
			'service-ecrire',
			'service-landing',
			'service-regulatorio'
		]);
		for (const fixture of MISFITS) {
			expect(
				suggestCategory({ title: fixture.title, description: fixture.description }).category,
				fixture.id
			).toBe(fixture.expected);
		}
	});

	it('keeps an explicit poster choice ahead of the suggestion', () => {
		expect(
			classifyListing({
				title: 'I offer sapanish interpretation services in el salvador',
				searchCategory: 'handyman'
			})
		).toMatchObject({ category: 'handyman', source: 'chosen' });
		expect(
			suggestCategory({ title: 'I offer sapanish interpretation services in el salvador' }).category
		).toBe('writing');
	});

	it('puts a table component in development and a receptionist in temp staff', () => {
		expect(suggestCategory({ title: 'Crear componente de tabla editable' }).category).toBe(
			'development'
		);
		expect(classifyListing({ title: 'Crear componente de tabla editable' }).category).toBe(
			'development'
		);
		expect(
			suggestCategory({
				title: 'Recepcionista temporal',
				categories: [{ id: '9', name: 'Events' }]
			}).category
		).toBe('temp-staff');
		expect(
			classifyListing({
				title: 'Recepcionista temporal',
				categories: ['9']
			}).category
		).toBe('temp-staff');
	});

	it('measures at least a 90% fit on the audit sample', () => {
		const measured = measureCategoryFit(CATEGORY_FIT_FIXTURES, suggestCategory);
		const percent = (measured.rate * 100).toFixed(1);
		console.log(
			`category fit rate: ${percent}% (${measured.hits}/${measured.total})` +
				(measured.misses.length
					? ` misses=${measured.misses.map((miss) => `${miss.id}:${miss.actual}`).join(',')}`
					: '')
		);
		expect(measured.total).toBe(50);
		expect(measured.rate).toBeGreaterThanOrEqual(0.9);
	});
});
