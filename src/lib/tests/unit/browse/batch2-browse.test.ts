import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEARCH_CATEGORIES } from '$lib/search/taxonomy.js';
import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
import { SERVICE_SKILL_OPTIONS } from '$lib/utils/constants/skills';
import {
	canonicalSkill,
	skillHasSpanishLabel,
	skillLabel
} from '$lib/utils/constants/skill-labels';
import { countsFromRows } from '$lib/search/browse-index';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('batch 2 browse and copy', () => {
	it('gives every category and skill a Spanish label', () => {
		for (const category of SEARCH_CATEGORIES) {
			expect(category.nameEs.trim().length).toBeGreaterThan(0);
		}
		const es = JSON.parse(source('static/locales/es/categories.json')).categories;
		for (const category of TASK_CATEGORIES) {
			expect(es[category.slug]?.name, category.slug).toEqual(expect.any(String));
			expect(es[category.slug].name.trim().length).toBeGreaterThan(0);
		}
		const missing = SERVICE_SKILL_OPTIONS.filter((skill) => !skillHasSpanishLabel(skill));
		expect(missing).toEqual([]);
		expect(skillLabel('Cleaning shift', 'es')).toBe('Turno de limpieza');
		expect(skillLabel('Furniture assembly', 'es')).toBe('Armado de muebles');
		expect(skillLabel('Handyman', 'es')).toBe('Reparaciones');
		expect(skillLabel('Home inspection', 'es')).toBe('Inspección de vivienda');
		expect(skillLabel('Security', 'es')).toBe('Seguridad');
		expect(skillLabel('Security', 'en')).toBe('Security');
		expect(canonicalSkill('Seguridad')).toBe('Security');
	});

	it('counts badges from the same rows as the cards', () => {
		const board = source('src/lib/components/browse/BrowseBoard.svelte');
		expect(board).toContain(
			"countsFromRows(rows.filter((row) => matchesBrowse(row, { ...filters, categoryId: '' })))"
		);
		expect(board).not.toContain('indexCounts');
		const rows = [{ categoryId: 'other' }, { categoryId: 'cleaning' }, { categoryId: 'other' }];
		expect(countsFromRows(rows).other).toBe(2);
		expect(countsFromRows(rows.filter((row) => row.categoryId === 'other')).other).toBe(2);
	});

	it('keeps the goods category in the shareable query', () => {
		const page = source('src/routes/(app)/browse/goods/+page.svelte');
		expect(page).toContain("searchParams.get('category')");
		expect(page).toContain("searchParams.set('category', next)");
		expect(page).toContain('replaceState');
		expect(page).not.toContain("category = 'furniture'");
	});

	it('uses an h1 on task detail and 44px footer and login targets', () => {
		expect(source('src/lib/components/task/TaskDetailsView.svelte')).toContain(
			'<h1 class="text-2xl font-semibold">'
		);
		const footer = source('src/lib/components/BitTaskerFooter.svelte');
		expect(footer).toContain('min-height: 44px');
		expect(footer).toContain('width: 44px');
		const header = source('src/lib/components/topbar/PublicTopBar.svelte');
		expect(header).toContain('height: 44px');
		expect(header).toContain('min-height: 44px');
		expect(header).not.toContain('height: 32px');
	});
});
