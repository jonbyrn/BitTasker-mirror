import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('header locale', () => {
	it('labels Spanish login Iniciar and swaps the flag with the language', () => {
		const es = JSON.parse(readFileSync(resolve('static/locales/es/home.json'), 'utf8')) as {
			navbar: { login: string };
		};
		const dropdown = readFileSync(resolve('src/lib/components/LanguageDropdown.svelte'), 'utf8');
		expect(es.navbar.login).toBe('Iniciar');
		expect(dropdown).toContain("en: '/images/flags/us.webp'");
		expect(dropdown).toContain("es: '/images/flags/sv.webp'");
		expect(dropdown).toContain('src={flagSrc($locale)}');
		expect(dropdown).not.toContain('🇸🇻');
	});
});
