import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankGoodsForm } from '$lib/market/types';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('batch 3 copy', () => {
	it('uses Browse Tasks and Explorar Tareas for the tasks destination', () => {
		const en = source('static/locales/en/home.json');
		const es = source('static/locales/es/home.json');
		expect(en).toContain('"browse_tasks": "Browse Tasks"');
		expect(es).toContain('"browse_tasks": "Explorar Tareas"');
		expect(es).toContain('"login": "Iniciar sesión"');
		expect(source('src/lib/browse/copy.ts')).toContain("tasks: 'Explorar Tareas'");
		expect(source('static/locales/es/company/start-earning.json')).toContain(
			'"tasks": "Explorar Tareas"'
		);
		expect(source('static/locales/en/dashboard/tasks/find.json')).toContain(
			'"title": "Browse Tasks"'
		);
		expect(source('static/locales/es/dashboard/tasks/find.json')).toContain(
			'"title": "Explorar Tareas"'
		);
	});

	it('shows a flag on the language button', () => {
		const dropdown = source('src/lib/components/LanguageDropdown.svelte');
		expect(dropdown).toContain("en: '/images/flags/us.webp'");
		expect(dropdown).toContain("es: '/images/flags/sv.webp'");
		expect(dropdown).toContain('data-testid="language-flag"');
	});

	it('keeps fee pages on one heading ladder', () => {
		for (const path of [
			'src/routes/(company)/tasker-fees/+page.svelte',
			'src/routes/(company)/taskee-fees/+page.svelte'
		]) {
			const page = source(path);
			expect(page).toContain('<h1>');
			expect(page).not.toContain('<h4>');
			expect(page).not.toContain('text-5xl');
			expect(page).toContain('<h2>');
			expect(page).toContain('<h3 class="card-title');
		}
	});

	it('does not preselect Muebles', () => {
		expect(blankGoodsForm('sell').category).not.toBe('furniture');
		expect(blankGoodsForm('rent').category).not.toBe('furniture');
		const page = source('src/routes/(app)/browse/goods/+page.svelte');
		expect(page).toContain("let category = $state('')");
		expect(page).not.toContain("category = 'furniture'");
	});
});
