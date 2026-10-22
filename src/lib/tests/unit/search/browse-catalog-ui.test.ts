import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { redirectBrowseServices, redirectBrowseTasks } from '$lib/search/browse-routes';

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('browse routes', () => {
	it('sends /browse/tasks to the task catalog', () => {
		try {
			redirectBrowseTasks();
			expect.fail('expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			expect((error as { status: number; location: string }).status).toBe(307);
			expect((error as { location: string }).location).toBe('/tasks');
		}
	});

	it('sends /browse/services to the service catalog', () => {
		try {
			redirectBrowseServices();
			expect.fail('expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			expect((error as { status: number; location: string }).status).toBe(307);
			expect((error as { location: string }).location).toBe('/services');
		}
	});
});

describe('services browse copy', () => {
	const page = read('src/routes/(app)/services/+page.svelte');
	const en = JSON.parse(read('static/locales/en/dashboard/services/browse.json'));
	const es = JSON.parse(read('static/locales/es/dashboard/services/browse.json'));
	const browseEn = en.dashboard.services.browse;
	const browseEs = es.dashboard.services.browse;

	it('uses translated skip and live-region strings', () => {
		expect(page).not.toContain('Skip to main content');
		expect(page).not.toContain('Services loaded successfully.');
		expect(page).not.toContain('No services found.');
		expect(page).toContain('dashboard.services.browse.skip_to_content');
		expect(page).toContain('dashboard.services.browse.live_loaded');
		expect(browseEs.skip_to_content).toBe('Saltar al contenido principal');
		expect(browseEs.live_loaded).toBe('Servicios cargados.');
		expect(browseEs.live_none).toBe('No se encontraron servicios.');
		expect(browseEs.live_count).toBe('Se encontraron {count} servicios.');
		expect(browseEn.skip_to_content).toBe('Skip to main content');
		expect(browseEn.live_loaded).toBe('Services loaded successfully.');
	});
});

describe('homepage build sha', () => {
	it('puts the build sha on the root layout and the homepage head', () => {
		const layout = read('src/routes/+layout.svelte');
		const home = read('src/routes/(company)/+page.svelte');
		expect(layout).toContain('name="build-sha"');
		expect(layout).toContain('import.meta.env.VITE_GIT_SHA');
		expect(home).toContain('name="build-sha"');
		expect(home).toContain('import.meta.env.VITE_GIT_SHA');
	});
});
