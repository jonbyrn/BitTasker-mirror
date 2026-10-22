import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routeDocumentTitle } from '$lib/seo/route-titles';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('route titles', () => {
	it('localizes the tab title for Spanish', () => {
		expect(routeDocumentTitle('/', 'es')).toBe(
			'Encuentra trabajo. Encuentra ayuda. Haz las cosas. | BitTasker'
		);
		expect(routeDocumentTitle('/browse/tasks', 'es')).toBe('Ver tareas · BitTasker');
		expect(routeDocumentTitle('/tasker-principles', 'es')).toBe('Principios del Tasker - BitTasker');
		expect(routeDocumentTitle('/tasker-fees', 'es')).toBe('Tarifas cuando necesito ayuda - BitTasker');
		expect(routeDocumentTitle('/start-earning', 'es')).toBe('Empieza a ganar - BitTasker');
		expect(routeDocumentTitle('/search/cleaning', 'es')).toBe('Buscar · BitTasker');
		expect(routeDocumentTitle('/', 'en')).toContain('Find work. Find help. Get things done.');
		expect(routeDocumentTitle('/tasks/abc', 'es')).toBeNull();
	});
});

describe('combined preview fixes', () => {
	it('keeps header auth buttons on one line', () => {
		const header = source('src/lib/components/topbar/PublicTopBar.svelte');
		const css = source('src/app.css');
		expect(header).toContain('header-auth-btn');
		expect(header).toContain('whitespace-nowrap');
		expect(css).toContain(':not(.header-auth-btn)');
		expect(css).toContain('white-space: nowrap');
	});

	it('paints home cards with the dark theme token', () => {
		const css = source('src/app.css');
		expect(css).toContain("--bt-home-card: var(--color-base-300)");
		expect(css).toContain(":root[data-theme='dark'] .home-card");
	});

	it('sends Get Started to signup and titles the tasker principles page', () => {
		const home = source('src/routes/(company)/+page.svelte');
		const principles = source('src/routes/(company)/tasker-principles/+page.svelte');
		const load = source('src/routes/(company)/tasker-principles/+page.ts');
		expect(home).toContain("resolve('/auth/signup')");
		expect(home).not.toContain("resolve('/auth/onboarding')");
		expect(principles).toContain('tasker_principles.title');
		expect(principles).toContain('DocumentTitle');
		expect(principles).not.toContain('taskee_principles');
		expect(load).toContain('Tasker Principles - BitTasker');
		expect(load).not.toContain('Taskee Principles');
	});

	it('loads browse, tiles, and category lists from one catalog', () => {
		const browse = source('src/lib/components/browse/BrowseBoard.svelte');
		const tiles = source('src/lib/search/category-counts.ts');
		const list = source('src/routes/(app)/categories/[category]/+page.svelte');
		expect(browse).toContain('loadSharedCatalog');
		expect(browse).toContain('selectSharedTasks');
		expect(browse).toContain('formatTaskPrice');
		expect(tiles).toContain('loadSharedCatalog');
		expect(tiles).toContain('selectSharedTasks');
		expect(list).toContain('loadSharedCatalog');
		expect(list).toContain('formatTaskPrice');
	});
});
