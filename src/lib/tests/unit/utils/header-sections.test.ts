import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '$lib/utils/ui/contrast';
import { splitHeaderSections } from '$lib/utils/nav/header-sections';

describe('logged-in header row', () => {
	it('keeps hiring and earning on the row and folds account, help, and settings', () => {
		const split = splitHeaderSections([
			{ id: 'my-account' },
			{ id: 'hiring' },
			{ id: 'earning' },
			{ id: 'support-help' },
			{ id: 'settings' }
		]);
		expect(split.primary.map((section) => section.id)).toEqual(['hiring', 'earning']);
		expect(split.overflow.map((section) => section.id)).toEqual([
			'my-account',
			'support-help',
			'settings'
		]);
	});

	it('keeps the logged-in header on one 65px row with a visible menu', () => {
		const source = readFileSync(
			resolve('src/lib/components/topbar/ProtectedTopBar.svelte'),
			'utf8'
		);
		expect(source).toContain('data-testid="header-more"');
		expect(source).toMatch(/height:\s*65px/);
		expect(source).not.toMatch(/73px/);
		expect(source).toMatch(/overflow:\s*visible/);
		expect(source).not.toMatch(/overflow-x-auto/);
	});
});

describe('heading and empty-state contrast', () => {
	it('uses Poppins 600 for every heading', () => {
		const css = readFileSync(resolve('src/app.css'), 'utf8');
		expect(css).toMatch(/--font-heading:\s*'Poppins'/);
		expect(css).toMatch(/body h1,[\s\S]*font-family:\s*var\(--font-heading\)/);
		expect(css).toMatch(/body h1,[\s\S]*font-weight:\s*600/);
		expect(css).toContain('.profile-empty');
	});

	it('meets WCAG AA for empty copy on the dark card', () => {
		expect(contrastRatio('#d4d4d4', '#2d2d2d')).toBeGreaterThanOrEqual(4.5);
	});
});
