import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	dedupeListingsByEvent,
	filterPublicServices,
	filterPublicTasks,
	isTestListingTitle,
	listingEventKey,
	selectVisibleServices,
	selectVisibleTasks,
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

	it('counts the same tasks the cards render, using the local calendar-day clock', () => {
		// Smoke morning: 22 Oct 2026, 07:00 in the browser's local zone (Guatemala for that run).
		const now = new Date(2026, 9, 22, 7, 0, 0, 0);
		const rows = [
			{
				...task({ title: 'Old design draft', description: 'design', status: 'OPEN' }),
				id: 'event-old',
				npub: 'author',
				kind: 31000,
				uniqueId: 'design-banner',
				createdAt: 10
			},
			{
				...task({ title: 'New design draft', description: 'design', status: 'OPEN' }),
				id: 'event-new',
				npub: 'author',
				kind: 31000,
				uniqueId: 'design-banner',
				eventId: 'evt-new',
				createdAt: 20
			},
			{
				...task({
					title: 'Past open design',
					description: 'design',
					status: 'OPEN',
					deadline: '2026-02-18T23:59:59.999Z'
				}),
				id: 'expired-open',
				npub: 'author',
				createdAt: 30
			},
			{
				...task({
					title: 'Finished design',
					description: 'design',
					status: 'COMPLETED',
					deadline: '2026-04-20T23:59:59.999Z'
				}),
				id: 'completed',
				npub: 'author',
				createdAt: 40
			},
			{
				...task({
					title: 'Design due today',
					description: 'design',
					status: 'OPEN',
					deadline: '2026-10-22T23:59:59.999Z'
				}),
				id: 'due-today',
				npub: 'author',
				createdAt: 50
			},
			{
				...task({ title: 'Plumbing', description: 'pipes', status: 'OPEN', deadline: null }),
				id: 'plumbing',
				npub: 'author',
				createdAt: 60
			}
		];

		const hidden = selectVisibleTasks(rows, 'design', false, now);
		expect(hidden.expiredHidden).toBe(false);
		expect(hidden.visible.map((item) => item.title)).toEqual([
			'New design draft',
			'Finished design',
			'Design due today'
		]);
		expect(listingEventKey(hidden.visible[0])).toBe('31000:author:design-banner');
		expect(new Set(hidden.visible.map((item) => listingEventKey(item))).size).toBe(
			hidden.visible.length
		);

		const shown = selectVisibleTasks(rows, 'design', true, now);
		expect(shown.visible.map((item) => item.title)).toContain('Past open design');
		expect(shown.expiredHidden).toBe(false);

		const onlyExpired = selectVisibleTasks(
			[
				{
					...task({
						title: 'Past open design',
						status: 'OPEN',
						deadline: '2026-02-18T23:59:59.999Z'
					}),
					id: 'expired-open'
				}
			],
			'design',
			false,
			now
		);
		expect(onlyExpired.visible).toEqual([]);
		expect(onlyExpired.expiredHidden).toBe(true);

		const unrelated = selectVisibleTasks(
			[
				{
					...task({ title: 'Plumbing', description: 'pipes', deadline: '2099-12-31' }),
					id: 'plumbing'
				}
			],
			'design',
			false,
			now
		);
		expect(unrelated.visible).toEqual([]);
		expect(unrelated.expiredHidden).toBe(false);
	});

	it('collapses service versions by kind:pubkey:d and keeps the newest', () => {
		const older = {
			id: 'evt-1',
			title: 'WordPress care',
			npub: 'author',
			eventKind: 30402,
			uniqueId: 'wp-care',
			createdAt: 1
		};
		const newer = {
			id: 'evt-2',
			title: 'WordPress care updated',
			npub: 'author',
			eventKind: 30402,
			uniqueId: 'wp-care',
			createdAt: 2
		};
		const other = { id: 'evt-3', title: 'Logo design', npub: 'author', createdAt: 3 };
		expect(dedupeListingsByEvent([older, newer, other]).map((item) => item.id)).toEqual([
			'evt-2',
			'evt-3'
		]);
		expect(
			selectVisibleServices([older, newer, other], 'wordpress').map((item) => item.title)
		).toEqual(['WordPress care updated']);
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
