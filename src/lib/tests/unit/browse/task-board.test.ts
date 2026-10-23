import { describe, expect, it } from 'vitest';
import {
	browseLiveCount,
	isHomeRegionTask,
	isHiddenWorkerTask,
	isImplausibleBrowsePrice,
	isJunkListing,
	isKeyboardMash,
	isOutsideElSalvador,
	isUnrealisticDemoPrice,
	visibleWorkerTasks,
	isZeroPricedTask,
	keepLoadedRows,
	mentionsForeignListing,
	prepareBrowseTasks,
	scanCatalogUntilLive,
	shouldOfferExpired
} from '$lib/browse/task-board';
import { displayTaskStatus } from '$lib/utils/helpers/taskDeadline';
import type { Task } from '$lib/types/task.d';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? 'task-1',
		npub: overrides.npub ?? 'author-a',
		status: TaskStatusEnum.OPEN,
		title: overrides.title ?? 'Help',
		description: overrides.description ?? 'Details',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: overrides.budget ?? { amount: 20, currency: 'USD', type: BudgetTypeEnum.FIXED },
		deadline: null,
		dateRange: null,
		pickupLocation: overrides.pickupLocation ?? null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		estimatedHours: 1,
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: overrides.createdAt ?? 10,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		...overrides
	};
}

describe('browse task board', () => {
	it('hides zero prices and repeated posts from the same author', () => {
		const rows = prepareBrowseTasks(
			[
				task({ id: 'free', budget: { amount: 0, currency: 'USD', type: BudgetTypeEnum.FIXED } }),
				task({ id: 'old', title: 'Paint', description: 'Walls', createdAt: 1 }),
				task({ id: 'new', title: 'Paint', description: 'Walls', createdAt: 5 }),
				task({
					id: 'other',
					npub: 'author-b',
					title: 'Paint',
					description: 'Walls',
					createdAt: 9
				})
			],
			{ allCountries: true }
		);
		expect(rows.map((row) => row.id)).toEqual(['other', 'new']);
		expect(
			isZeroPricedTask(task({ budget: { amount: 0, currency: 'USD', type: BudgetTypeEnum.FIXED } }))
		).toBe(true);
	});

	it('defaults to El Salvador, nearest first', () => {
		const salvador = task({
			id: 'sv',
			title: 'Errands in San Salvador',
			pickupLocation: {
				displayName: 'San Salvador, El Salvador',
				latitude: 13.7,
				longitude: -89.2,
				zipCode: '',
				locationLoaded: true
			}
		});
		const mexico = task({
			id: 'mx',
			title: 'Help in Mexico City',
			createdAt: 50,
			pickupLocation: {
				displayName: 'Mexico City, Mexico',
				latitude: 19.4,
				longitude: -99.1,
				zipCode: '',
				locationLoaded: true
			}
		});
		const egypt = task({
			id: 'eg',
			title: 'Help in Cairo',
			pickupLocation: {
				displayName: 'Cairo, Egypt',
				latitude: 30.04,
				longitude: 31.24,
				zipCode: '',
				locationLoaded: true
			}
		});
		expect(isHomeRegionTask(egypt)).toBe(false);
		expect(mentionsForeignListing(['Paint a wall for 12 euros', ''])).toBe(true);
		expect(
			isHomeRegionTask(
				task({ id: 'euro', title: 'Paint a wall for 12 euros', pickupLocation: null })
			)
		).toBe(false);
		expect(
			prepareBrowseTasks([egypt, mexico, salvador], { allCountries: false }).map((row) => row.id)
		).toEqual(['sv']);
		expect(
			prepareBrowseTasks([egypt, mexico, salvador], { allCountries: true }).map((row) => row.id)
		).toEqual(['sv', 'mx', 'eg']);
		expect(isOutsideElSalvador({ title: 'Errands', location: 'San Salvador, El Salvador' })).toBe(
			false
		);
		expect(isOutsideElSalvador({ title: 'Help', location: 'Mexico City, Mexico' })).toBe(true);
		expect(isOutsideElSalvador({ title: 'Remote website fix', location: '' })).toBe(false);
	});

	it('hides probe posts, ETH token tasks, and overseas tours', () => {
		const probe = task({ id: 'probe', title: 'relay probe', description: 'ignore' });
		const token = task({
			id: 'token',
			title: 'Develop DIRA token based on ETH network',
			pickupLocation: {
				displayName: 'San Salvador, El Salvador',
				latitude: 13.7,
				longitude: -89.2,
				zipCode: '',
				locationLoaded: true
			}
		});
		const tour = task({
			id: 'tour',
			title: 'Tour de escalada en Suesca',
			pickupLocation: {
				displayName: 'Suesca, Cundinamarca, Colombia',
				latitude: 5.1,
				longitude: -73.8,
				zipCode: '',
				locationLoaded: true
			}
		});
		const local = task({
			id: 'local',
			title: 'House cleaning',
			pickupLocation: {
				displayName: 'La Libertad, El Salvador',
				latitude: 13.4,
				longitude: -89.3,
				zipCode: '',
				locationLoaded: true
			}
		});
		expect(isJunkListing({ title: probe.title, description: probe.description })).toBe(true);
		expect(
			prepareBrowseTasks([probe, token, tour, local], { allCountries: true }).map((row) => row.id)
		).toEqual(['local']);
	});
});

describe('browse expiry regression', () => {
	it('keeps a missing deadline and a future unix deadline, and hides a past one', () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const rows = prepareBrowseTasks(
			[
				task({ id: 'open', title: 'Lavado de ventanas', deadline: null }),
				task({
					id: 'future',
					title: 'Clerk auth',
					deadline: String(nowSeconds + 86400 * 20)
				}),
				task({ id: 'past', title: 'Old move', deadline: '1700000000' })
			],
			{ allCountries: true }
		);
		const live = rows.filter((row) => displayTaskStatus(row) !== 'EXPIRED').map((row) => row.id);
		expect(live).toEqual(expect.arrayContaining(['open', 'future']));
		expect(live).not.toContain('past');
		expect(browseLiveCount(rows, true)).toEqual({ live: 2, expired: 1 });
	});

	it('reads past an expired first page to a later open task', async () => {
		const expired = (id: string, createdAt: number) =>
			task({ id, createdAt, deadline: '1700000000', title: `Past ${id}` });
		const live = task({
			id: 'live',
			createdAt: 50,
			title: 'Recepcionista temporal',
			deadline: null
		});
		const calls: Array<number | undefined> = [];
		const rows = await scanCatalogUntilLive({
			pageSize: 2,
			maxPages: 4,
			fetchPage: async (until) => {
				calls.push(until);
				if (until == null) return [expired('a', 300), expired('b', 200)];
				return [live];
			},
			hasLive: (collected) => browseLiveCount(collected, true).live > 0
		});
		expect(calls).toEqual([undefined, 199]);
		expect(rows.map((row) => row.id)).toContain('live');
		expect(browseLiveCount(rows, true).live).toBe(1);
	});

	it('keeps paging when probes fill the relay page but few tasks parse', async () => {
		const expired = task({ id: 'old', createdAt: 400, deadline: '1700000000', title: 'Old move' });
		const live = task({
			id: 'live',
			createdAt: 20,
			title: 'Recepcionista temporal',
			deadline: null
		});
		const calls: Array<number | undefined> = [];
		const rows = await scanCatalogUntilLive({
			pageSize: 80,
			maxPages: 4,
			fetchPage: async (until) => {
				calls.push(until);
				if (until == null) return { items: [expired], filled: true, oldestCreatedAt: 900 };
				return { items: [live], filled: false, oldestCreatedAt: 20 };
			},
			hasLive: (collected) => browseLiveCount(collected, true).live > 0
		});
		expect(calls).toEqual([undefined, 899]);
		expect(rows.map((row) => row.id)).toEqual(['old', 'live']);
	});

	it('does not replace a loaded batch with an empty timeout', () => {
		expect(keepLoadedRows(['kept'], [])).toEqual(['kept']);
		expect(keepLoadedRows(['old'], ['next'])).toEqual(['next']);
		expect(keepLoadedRows([], [])).toEqual([]);
	});
});

describe('browse junk and demo prices', () => {
	it('hides probe-style titles and leaves a real automated-test task', () => {
		expect(isJunkListing({ title: 'Help me destroy the AI overlords' })).toBe(true);
		expect(isJunkListing({ title: 'dame 4 estrellas' })).toBe(true);
		expect(isJunkListing({ title: 'New Test task' })).toBe(true);
		expect(isJunkListing({ title: 'A new test task' })).toBe(true);
		expect(isJunkListing({ title: 'Implementación de pruebas automatizadas' })).toBe(false);
		expect(isJunkListing({ title: '[TEST] Pintar una habitacion en Santa Ana' })).toBe(true);
		expect(isJunkListing({ title: 'task1' })).toBe(true);
		expect(isJunkListing({ title: 'task5' })).toBe(true);
		expect(isJunkListing({ title: 'ahajshd' })).toBe(true);
		expect(isJunkListing({ title: 'Docker' })).toBe(false);
		expect(isJunkListing({ title: 'GitHub' })).toBe(false);
		expect(isJunkListing({ title: 'need developer' })).toBe(true);
		expect(isJunkListing({ title: 'I need developer' })).toBe(true);
		expect(isJunkListing({ title: 'Crear componente de tabla editable' })).toBe(false);
		expect(isJunkListing({ title: 'Need a developer for the checkout' })).toBe(false);
		expect(isJunkListing({ title: 'hshshsh' })).toBe(true);
		expect(isKeyboardMash('hshshsh')).toBe(true);
		expect(isKeyboardMash('Wash the windows')).toBe(false);
		expect(isJunkListing({ title: 'quote service' })).toBe(true);
		expect(isJunkListing({ title: 'AI Agent Orchestration' })).toBe(false);
		expect(
			isJunkListing({
				title: 'Set up a self-hosted Bitcoin + Lightning node at home (El Zonte)'
			})
		).toBe(true);
		expect(isJunkListing({ title: 'Build a beachfront bamboo surfboard rack in El Zonte' })).toBe(
			false
		);
		expect(
			isJunkListing({
				title: 'Paint a fence in Santa Ana',
				creator: { username: 'e2e_smoke_1782154363' }
			})
		).toBe(true);
		expect(
			isJunkListing({
				title: 'Paint a fence in Santa Ana',
				nip05: 'e2e_smoke_1782154363@example.com'
			})
		).toBe(true);
		expect(
			isJunkListing({
				title: 'Paint a fence in Santa Ana',
				npub: '44925d5fb74560bc9793a165f9d2994384642adec166be4b77bd24c5bc004cf1'
			})
		).toBe(true);
		expect(
			isJunkListing({
				title: 'Implement a custom decentralized peer-to-peer electronic cash system'
			})
		).toBe(true);
		expect(isUnrealisticDemoPrice({ title: 'Logo', amount: 0.1 })).toBe(true);
		expect(isUnrealisticDemoPrice({ title: 'Help move my sofa', amount: 2 })).toBe(true);
		expect(isUnrealisticDemoPrice({ title: 'empresarial', amount: 2000 })).toBe(true);
		expect(
			isUnrealisticDemoPrice({
				title: 'Implement a custom decentralized peer-to-peer electronic cash system',
				amount: 2100
			})
		).toBe(false);
		expect(isImplausibleBrowsePrice({ title: 'Logo design', amount: 2 })).toBe(true);
		expect(
			isImplausibleBrowsePrice({ title: 'Diseño de Logos', amount: 2, currency: 'USDt' })
		).toBe(true);
		expect(isImplausibleBrowsePrice({ title: 'Recepcionista temporal', amount: 3 })).toBe(false);
		expect(isImplausibleBrowsePrice({ title: 'Wix website', amount: 2 })).toBe(true);
		expect(isImplausibleBrowsePrice({ title: 'the Wix site', amount: 2, currency: 'USDT' })).toBe(
			true
		);
		expect(isImplausibleBrowsePrice({ title: 'AI Agent Orchestration', amount: 1 })).toBe(true);
		expect(
			isImplausibleBrowsePrice({ title: 'Automatización con IA', amount: 10, currency: 'USD' })
		).toBe(true);
		expect(
			isImplausibleBrowsePrice({ title: 'Automatización con IA', amount: 40, currency: 'USD' })
		).toBe(false);
		expect(
			isImplausibleBrowsePrice({ title: 'Logo design', amount: 200_000, currency: 'SATS' })
		).toBe(true);
		expect(isImplausibleBrowsePrice({ title: 'Logo design', amount: 2, currency: 'BTC' })).toBe(
			false
		);
		expect(isImplausibleBrowsePrice({ title: 'Migrate the database', amount: 10 })).toBe(true);
		expect(isImplausibleBrowsePrice({ title: 'Migración de base de datos', amount: 10 })).toBe(
			true
		);
		expect(isImplausibleBrowsePrice({ title: 'Wash the windows', amount: 20 })).toBe(false);
		expect(isImplausibleBrowsePrice({ title: 'Build an AI agent', amount: 500 })).toBe(false);
	});

	it('drops those rows from the board and keeps ordinary prices', () => {
		const money = (amount: number) => ({
			amount,
			currency: 'USD',
			type: BudgetTypeEnum.FIXED
		});
		const rows = prepareBrowseTasks(
			[
				task({ id: 'cent', title: 'Tiny', budget: money(0.1) }),
				task({ id: 'sofa', title: 'Help move my sofa', budget: money(2) }),
				task({ id: 'admin', title: 'empresarial', budget: money(2000) }),
				task({
					id: 'cash',
					title: 'Implement a custom decentralized peer-to-peer electronic cash system',
					budget: money(2100)
				}),
				task({ id: 'logo', title: 'Logo design', budget: money(2) }),
				task({ id: 'desk', title: 'Recepcionista temporal', budget: money(3) }),
				task({ id: 'wix', title: 'Wix website', budget: money(2) }),
				task({ id: 'agent', title: 'AI Agent Orchestration', budget: money(1) }),
				task({ id: 'mash', title: 'hshshsh', budget: money(40) }),
				task({ id: 'quote', title: 'quote service', budget: money(40) }),
				task({ id: 'migrate', title: 'Migrate the database', budget: money(10) }),
				task({ id: 'windows', title: 'Wash the windows', budget: money(20) }),
				task({ id: 'stars', title: 'dame 4 estrellas' })
			],
			{ allCountries: true }
		);
		expect(rows.map((row) => row.id)).toEqual(['desk', 'windows']);
	});
});

function place(name: string): Task['pickupLocation'] {
	return {
		displayName: name,
		longitude: null,
		latitude: null,
		zipCode: '',
		locationLoaded: true
	};
}

describe('worker task list', () => {
	it('hides junk and expired tasks, keeps a sub-dollar open task, and leaves other statuses off the board', () => {
		const realUs = task({
			id: 'austin',
			title: 'Help move furniture',
			pickupLocation: place('Austin, United States'),
			budget: { amount: 40, currency: 'USD', type: BudgetTypeEnum.FIXED }
		});
		const junkUs = task({
			id: 'probe',
			title: 'New Test task',
			pickupLocation: place('New York, United States')
		});
		const expired = task({
			id: 'old',
			title: 'Paint a room',
			deadline: '1700000000',
			pickupLocation: place('San Salvador, El Salvador')
		});
		const underway = task({
			id: 'busy',
			title: 'Paint a fence',
			status: TaskStatusEnum.IN_PROGRESS,
			pickupLocation: place('San Salvador, El Salvador')
		});
		expect(isOutsideElSalvador({ title: realUs.title, location: 'Austin, United States' })).toBe(
			true
		);
		expect(isHiddenWorkerTask(realUs)).toBe(false);
		expect(isHiddenWorkerTask(junkUs)).toBe(true);
		expect(isHiddenWorkerTask(expired)).toBe(true);
		expect(isHiddenWorkerTask(expired, new Date(), { includeExpired: true })).toBe(false);
		expect(isHiddenWorkerTask(underway)).toBe(true);
		const cheap = task({
			id: 'tiny',
			title: 'Follow a public page',
			budget: { amount: 0.5, currency: 'USD', type: BudgetTypeEnum.FIXED },
			pickupLocation: place('San Salvador, El Salvador')
		});
		expect(isHiddenWorkerTask(cheap)).toBe(false);
		expect(
			visibleWorkerTasks([realUs, junkUs, expired, underway, cheap]).map((row) => row.id)
		).toEqual(['austin', 'tiny']);
		expect(
			visibleWorkerTasks([realUs, junkUs, expired, underway, cheap], new Date(), {
				includeExpired: true
			}).map((row) => row.id)
		).toEqual(['austin', 'old', 'tiny']);
	});
});

describe('shouldOfferExpired', () => {
	it('keeps expired listings hidden until the visitor checks the box', () => {
		expect(shouldOfferExpired(0, 8, false, false)).toBe(false);
		expect(shouldOfferExpired(0, 8, true, true)).toBe(false);
		expect(shouldOfferExpired(2, 8, false, false)).toBe(false);
		expect(shouldOfferExpired(0, 0, false, false)).toBe(false);
	});
});
