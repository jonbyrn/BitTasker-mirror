import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { howItWorksText } from '$lib/i18n/howItWorksText';
import enHome from '../../../../../static/locales/en/home.json';
import esHome from '../../../../../static/locales/es/home.json';
import enPrinciples from '../../../../../static/locales/en/taskees/principles.json';
import esPrinciples from '../../../../../static/locales/es/taskees/principles.json';

const page = readFileSync('src/routes/(company)/how-it-works/+page.svelte', 'utf8');
const keys = [...page.matchAll(/(?:copy|rich)\('([^']+)'\)/g)].map((match) => match[1]);

describe('how it works copy', () => {
	it('resolves every key on the page in English and Spanish', () => {
		expect(keys.length).toBeGreaterThan(50);
		for (const key of new Set(keys)) {
			const english = howItWorksText(key, 'en', key);
			const spanish = howItWorksText(key, 'es', key);
			expect(english, key).not.toBe(key);
			expect(spanish, key).not.toBe(key);
			expect(english.trim().length).toBeGreaterThan(0);
			expect(spanish.trim().length).toBeGreaterThan(0);
		}
	});

	it('resolves the step 4 warning instead of the raw key or the English fallback', () => {
		const key = 'how_it_works.step_4.warning';
		const english = howItWorksText(key, 'en', key);
		expect(english).toContain('Important');
		expect(howItWorksText(key, 'es', key)).toContain('Importante');
		expect(howItWorksText(key, 'es', english)).toContain('Importante');
		expect(howItWorksText(key, 'es', english)).not.toBe(english);
	});
});

describe('taskee principles link label', () => {
	it('matches the page title in English and Spanish', () => {
		expect(enHome.footer.tasker_principles).toBe(enPrinciples.taskee_principles.title);
		expect(esHome.footer.tasker_principles).toBe(esPrinciples.taskee_principles.title);
		expect(enHome.footer.tasker_principles).toBe('Taskee Principles');
		expect(esHome.footer.tasker_principles).toBe('Principios de los Taskees');
	});
});
