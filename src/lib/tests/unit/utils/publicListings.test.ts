import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	filterPublicServices,
	filterPublicTasks,
	isTestListingTitle,
	serviceHeroLayout,
	type PublicListingFields
} from '$lib/utils/listings/publicListings';

function task(overrides: PublicListingFields = {}): PublicListingFields {
	return {
		title: 'General repair',
		description: 'Fix a leaky tap',
		status: 'OPEN',
		skills: [],
		categories: [],
		tags: [],
		budget: { amount: 40 },
		...overrides
	};
}

describe('public task and service lists', () => {
	it('uses one filtered set for the design count and the cards', () => {
		const matching = [
			task({ title: 'Logo design', budget: { amount: 50 } }),
			task({ title: 'Brand kit', description: 'design the homepage', budget: { amount: 80 } })
		];
		const noise = Array.from({ length: 20 }, (_, index) =>
			task({
				title: `Plumbing job ${index}`,
				description: 'pipes and fittings',
				budget: { amount: 20 }
			})
		);
		const raw = [...matching, ...noise];
		expect(raw).toHaveLength(22);

		const visible = filterPublicTasks(raw, 'design');
		expect(visible).toEqual(matching);
		expect(visible).toHaveLength(2);
	});

	it('applies wordpress and design queries to services instead of returning the page', () => {
		const services: PublicListingFields[] = [
			{ title: 'WordPress hosting', description: 'Managed sites' },
			{ title: 'Logo design', description: 'Brand marks' },
			{ title: 'Sites', description: 'Custom builds', skills: [{ name: 'WordPress' }] },
			...Array.from({ length: 17 }, (_, index) => ({
				title: `Generic service ${index}`,
				description: 'Unrelated work'
			}))
		];
		expect(services).toHaveLength(20);

		const wordpress = filterPublicServices(services, 'wordpress');
		expect(wordpress.map((service) => service.title)).toEqual(['WordPress hosting', 'Sites']);
		expect(wordpress).toHaveLength(2);
		expect(wordpress.some((service) => service.title.startsWith('Generic'))).toBe(false);

		const design = filterPublicServices(services, 'design');
		expect(design).toEqual([services[1]]);
	});

	it('drops unrelated services whose text only shares a fragment of the query', () => {
		const services: PublicListingFields[] = [
			{ title: 'WordPress hosting', description: 'Managed sites' },
			{ title: 'Logo design', description: 'Brand marks' },
			{ title: 'Diseño de logotipos', description: 'Marcas para un negocio' },
			{ title: 'Electrician', description: 'Wiring for homes or shops' },
			{ title: 'SIM card tip', description: 'Help with a new SIM' },
			{ title: 'Personal shopper', description: 'I shop for you' },
			{ title: 'DJ', description: 'Music for events' },
			{ title: 'Write a text.', description: 'Escribo un texto' }
		];

		expect(filterPublicServices(services, 'wordpress').map((service) => service.title)).toEqual([
			'WordPress hosting'
		]);
		expect(filterPublicServices(services, 'design').map((service) => service.title)).toEqual([
			'Logo design',
			'Diseño de logotipos'
		]);
	});

	it('excludes tasks that do not contain the query', () => {
		const tasks = [
			task({ title: 'Logo design', description: 'Brand marks', budget: { amount: 50 } }),
			task({
				title: 'WordPress rescue',
				description: 'Fix a broken site',
				budget: { amount: 80 }
			}),
			task({
				title: 'Electrician',
				description: 'Wiring for homes or shops',
				budget: { amount: 40 }
			}),
			task({
				title: 'Write a text',
				description: 'Escribo un texto de la calle',
				budget: { amount: 25 }
			})
		];

		expect(filterPublicTasks(tasks, 'wordpress').map((item) => item.title)).toEqual([
			'WordPress rescue'
		]);
		expect(filterPublicTasks(tasks, 'design').map((item) => item.title)).toEqual(['Logo design']);
	});

	it('hides cancelled tasks, test titles, and tasks without a listable budget', () => {
		const listings = [
			task({
				title: 'Soil probe calibration',
				description: 'field instrument',
				budget: { amount: 200 }
			}),
			task({ title: 'Design a poster', status: 'CANCELLED', budget: { amount: 10 } }),
			task({ title: 'Still open', status: ' cancelled ', budget: { amount: 10 } }),
			task({ title: 'probe', budget: { amount: 1 } }),
			task({ title: 'Relay probe auth', budget: { amount: 1 } }),
			task({ title: 'relay publish check', budget: { amount: 1 } }),
			task({ title: 'auth url probe', budget: { amount: 1 } }),
			task({ title: 'Design sprint', budget: { amount: undefined } }),
			task({ title: 'Open design', budget: { amount: 15 } })
		];

		const visible = filterPublicTasks(listings, '');
		expect(visible.map((item) => item.title)).toEqual(['Soil probe calibration', 'Open design']);

		expect(isTestListingTitle('probe')).toBe(true);
		expect(isTestListingTitle('relay probe')).toBe(true);
		expect(isTestListingTitle('relay publish check')).toBe(true);
		expect(isTestListingTitle('Soil probe calibration')).toBe(false);
	});

	it('hides test service titles and still lists a service that has no budget', () => {
		const services = [
			{ title: 'relay probe', description: 'ignore' },
			{ title: 'Copywriting', description: 'No price yet' }
		];
		expect(filterPublicServices(services, '')).toEqual([services[1]]);
		expect(filterPublicServices(services, 'copywriting')).toEqual([services[1]]);
	});

	it('uses a compact hero when a service has no image', () => {
		expect(serviceHeroLayout(0)).toBe('compact');
		expect(serviceHeroLayout(2)).toBe('media');
	});

	it('ships the escrow line in English and Spanish and no key-custody claim', () => {
		const en = JSON.parse(readFileSync('static/locales/en/dashboard/services/browse.json', 'utf8'));
		const es = JSON.parse(readFileSync('static/locales/es/dashboard/services/browse.json', 'utf8'));
		expect(en.dashboard.services.browse.non_custodial_escrow).toBe('Non-custodial escrow');
		expect(es.dashboard.services.browse.non_custodial_escrow).toBe(
			'Depósito en garantía sin custodia'
		);
		const card = readFileSync('src/lib/components/service/ServiceCard.svelte', 'utf8');
		expect(card).toContain('dashboard.services.browse.non_custodial_escrow');
		expect(card.toLowerCase()).not.toContain('your keys stay on your device');
	});
});
