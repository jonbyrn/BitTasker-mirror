import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('public header at 1280', () => {
	it('stays 65px tall and keeps the centre nav in normal flex flow from 1024px', () => {
		const header = source('src/lib/components/topbar/PublicTopBar.svelte');
		expect(header).toContain('data-testid="header-nav"');
		expect(header).toMatch(/height:\s*65px/);
		expect(header).toMatch(/min-height:\s*65px/);
		expect(header).not.toMatch(/73px/);
		expect(header).toMatch(
			/@media \(min-width:\s*1024px\)[\s\S]*\.navbar-center[\s\S]*position:\s*static/
		);
		expect(header).toMatch(
			/@media \(min-width:\s*1024px\)[\s\S]*\.navbar-center[\s\S]*transform:\s*none/
		);
	});
});

describe('spanish logged-out copy', () => {
	it('uses the production login label and the official hero slogan', () => {
		const home = JSON.parse(source('static/locales/es/home.json')) as {
			navbar: { login: string };
			homepage: { v2: { hero: { slogan: string } } };
		};
		expect(home.navbar.login).toBe('Iniciar');
		expect(home.homepage.v2.hero.slogan).toBe('Red de Talento Descentralizada');
		expect(source('static/locales/es/home.json')).not.toContain('La Fuerza Laboral Descentralizada');
	});
});
