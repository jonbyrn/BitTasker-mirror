import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('services browse status copy', () => {
	it('translates the skip link and the loaded-services status', () => {
		const en = JSON.parse(
			readFileSync(resolve('static/locales/en/dashboard/services/browse.json'), 'utf8')
		) as { dashboard: { services: { browse: Record<string, string> } } };
		const es = JSON.parse(
			readFileSync(resolve('static/locales/es/dashboard/services/browse.json'), 'utf8')
		) as { dashboard: { services: { browse: Record<string, string> } } };
		const page = readFileSync(resolve('src/routes/(app)/services/+page.svelte'), 'utf8');
		const english = en.dashboard.services.browse;
		const spanish = es.dashboard.services.browse;

		expect(english.skip_to_main).toBe('Skip to main content');
		expect(english.loaded_successfully).toBe('Services loaded successfully.');
		expect(english.found_services).toBe('Found {count} services.');
		expect(spanish.skip_to_main).toBe('Saltar al contenido principal');
		expect(spanish.loaded_successfully).toBe('Servicios cargados correctamente.');
		expect(spanish.loaded_with_error).toBe(
			'Sin embargo, hubo un error al cargar algunos servicios.'
		);
		expect(spanish.found_services).toBe('Se encontraron {count} servicios.');
		expect(page).toContain("{$t('dashboard.services.browse.skip_to_main')}");
		expect(page).toContain("{$t('dashboard.services.browse.loaded_successfully')}");
		expect(page).toContain("{$t('dashboard.services.browse.found_services'");
		expect(page).not.toContain('>Skip to main content<');
		expect(page).not.toContain('Services loaded successfully.');
		expect(page).not.toContain('Found {visible.length} services.');
	});
});
