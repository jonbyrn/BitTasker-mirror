import { readFileSync } from 'node:fs';
import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { notFoundCopy } from '$lib/i18n/not-found-copy';
import { isKnownAppPath, spaShellStatus } from '$lib/routing/known-routes.js';
import { load } from '../../../../routes/[...path]/+page';

describe('unknown routes', () => {
	it('uses SvelteKit error(404) for a path with no page', () => {
		expect.assertions(2);
		try {
			load();
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (isHttpError(error)) expect(error.status).toBe(404);
		}
	});

	it('serves the shell at 404 only for an unknown page', () => {
		expect(isKnownAppPath('/')).toBe(true);
		expect(isKnownAppPath('/tasks/abc')).toBe(true);
		expect(isKnownAppPath('/goods/new')).toBe(true);
		expect(isKnownAppPath('/completely-fake-route')).toBe(false);
		expect(spaShellStatus('/tasks/abc')).toBe(200);
		expect(spaShellStatus('/completely-fake-route')).toBe(404);
		expect(spaShellStatus('/missing-file.js')).toBeNull();
	});

	it('translates the 404 page', () => {
		expect(notFoundCopy('en').notFoundTitle).toBe('Page Not Found');
		expect(notFoundCopy('es').notFoundTitle).toBe('Página no encontrada');
		expect(notFoundCopy('es-SV').goHome).toBe('Ir al inicio');
		expect(notFoundCopy('en').contact).toBe('Contact Support');
		const page = readFileSync('src/routes/+error.svelte', 'utf8');
		expect(page).toContain('notFoundCopy');
		expect(page).toContain('{copy.goHome}');
		expect(page).toContain('{copy.goBack}');
		const worker = readFileSync('workers-site/index.js', 'utf8');
		const middleware = readFileSync('functions/_middleware.ts', 'utf8');
		expect(worker).toContain('spaShellStatus');
		expect(middleware).toContain('spaShellStatus');
		expect(readFileSync('wrangler.toml', 'utf8')).toContain('not_found_handling = "none"');
	});
});
