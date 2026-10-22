import { describe, expect, it } from 'vitest';
import type { Event } from 'nostr-tools';
import { catalogScanIsComplete } from '$lib/browse/shared-catalog';
import { scanCatalogUntilLive, tasksInCategory, visibleWorkerTasks } from '$lib/browse/task-board';
import { parseTaskEvent } from '$lib/nostr/parseTaskEvent';
import type { Task } from '$lib/types/task.d';

const QA_DAY = new Date('2026-10-22T21:00:00Z');
const PUBKEY = 'ab'.repeat(32);

/**
 * Kind 31000 rows from wss://relay.bittasker.com on the Oct 22 2026 QA run.
 * The two [TEST] events are newest. The other seven are open, priced, and
 * still in the future on that day. They were missing from /tasks.
 */
const RELAY_TASKS: Array<{
	d: string;
	created_at: number;
	title: string;
	budget: { amount: number | string; currency: string; type: string; estimatedHours?: number };
	deadline: string;
	location: string;
}> = [
	{
		d: 'test-pintar-una-habitacion-en-santa-ana-1792679250',
		created_at: 1792679244,
		title: '[TEST] Pintar una habitacion en Santa Ana',
		budget: { amount: 20, currency: 'USD', type: 'FIXED' },
		deadline: '2026-12-20',
		location: 'Santa Ana, Santa Ana, El Salvador'
	},
	{
		d: 'test-reparar-una-puerta-en-suchitoto-1792679249',
		created_at: 1792679244,
		title: '[TEST] Reparar una puerta en Suchitoto',
		budget: { amount: 20, currency: 'USD', type: 'FIXED' },
		deadline: '2026-12-20',
		location: 'Suchitoto, Cuscatlán, El Salvador'
	},
	{
		d: 'task-82dcb53a-ae28-4507-a26f-8ccf65727de0',
		created_at: 1762270928,
		title: 'Crear componente de tabla editable',
		budget: { amount: 22.99, currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2026-11-04T00:00:00.000Z',
		location: 'AGUA CALIENTE, Chalatenango'
	},
	{
		d: 'task-e195be5a-7933-4b9b-9977-eb7739f00e3b',
		created_at: 1762270782,
		title: 'Implementar autenticación con Clerk',
		budget: { amount: 34, currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2026-11-04T00:00:00.000Z',
		location: 'San Pablo Tacachico, La Libertad'
	},
	{
		d: 'task-f1fb50a9-79d5-45de-bfeb-e6e5dcee77da',
		created_at: 1762270636,
		title: 'Corregir error en frontend React',
		budget: { amount: 200, currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2026-11-04T00:00:00.000Z',
		location: 'Metapán, El Salvador'
	},
	{
		d: 'task-65ca7117-6717-4575-8d9b-66bab14e6438',
		created_at: 1762270509,
		title: 'Configurar API REST con NestJS',
		budget: { amount: 100, currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2026-11-03T00:00:00.000Z',
		location: 'Aguilares, El Salvador'
	},
	{
		d: 'task-15acae53-e9f2-47a1-84c2-d73e5aad054c',
		created_at: 1762189391,
		title: 'Immigration Website Article Writing',
		budget: { amount: 420.75, currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2026-10-31T00:00:00.000Z',
		location: 'Lourdes, La Libertad'
	},
	{
		d: 'task-018b645e-28cd-46c6-96b9-d87e64506a79',
		created_at: 1760575865,
		title: 'Lavado de ventanas y vidrios',
		budget: { amount: 20, currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2028-09-16T00:00:00.000Z',
		location: 'San Salvador, San Salvador Department'
	},
	{
		d: 'task-3975f75f-0f5e-41c9-907a-1508daba81af',
		created_at: 1760575706,
		title: 'Limpieza básica de apartamento',
		budget: { amount: '25', currency: 'USD', type: 'FIXED', estimatedHours: 0 },
		deadline: '2027-09-16T00:00:00.000Z',
		location: 'San Ildefonso, San Vicente'
	}
];

function relayEvent(
	row: (typeof RELAY_TASKS)[number],
	contentExtra: Record<string, unknown> = {}
): Event {
	return {
		id: 'cd'.repeat(32),
		pubkey: PUBKEY,
		created_at: row.created_at,
		kind: 31000,
		sig: '',
		tags: [
			['d', row.d],
			['S', 'OPEN'],
			['L', row.location],
			['c', '[object Object]'],
			['T', 'onsite']
		],
		content: JSON.stringify({
			title: row.title,
			description: row.title,
			status: 'OPEN',
			taskType: 'onsite',
			budget: row.budget,
			deadline: row.deadline,
			pickupLocation: { displayName: row.location },
			...contentExtra
		})
	};
}

describe('open tasks from the Oct 22 relay', () => {
	const parsed = RELAY_TASKS.map((row) => parseTaskEvent(relayEvent(row))!);

	it('keeps every valid open event, including a string amount', () => {
		expect(parsed.every((task) => task)).toBe(true);
		expect(parsed.map((task) => task.id)).toEqual(RELAY_TASKS.map((row) => row.d));
		const table = parsed.find((task) => task.id.startsWith('task-82dcb53a'));
		expect(table?.budget.amount).toBe(22.99);
		const cleaning = parsed.find((task) => task.id.startsWith('task-3975f75f'));
		expect(cleaning?.budget.amount).toBe(25);
		expect(visibleWorkerTasks(parsed, QA_DAY).map((task) => task.id)).toEqual(
			RELAY_TASKS.map((row) => row.d)
		);
	});

	it('skips a malformed event and keeps the rest', () => {
		const broken = {
			...relayEvent(RELAY_TASKS[2]),
			id: 'ee'.repeat(32),
			content: '{not json'
		} as Event;
		const blank = relayEvent(RELAY_TASKS[2]);
		blank.content = JSON.stringify({ status: 'OPEN', budget: { amount: 22.99 } });
		expect(parseTaskEvent(broken)).toBeNull();
		expect(parseTaskEvent(blank)).toBeNull();
		expect(visibleWorkerTasks(parsed, QA_DAY)).toHaveLength(RELAY_TASKS.length);
	});

	it('still lists a task whose budget is only on a sats field', () => {
		const row = RELAY_TASKS[2];
		// 2_000_000 sats is $20 at the board's 100,000-sat dollar. A sub-dollar quote stays hidden.
		const event = relayEvent(row, {
			budget: { currency: 'SATS', type: 'FIXED' },
			amount: 2_000_000
		});
		const task = parseTaskEvent(event);
		expect(task).not.toBeNull();
		expect(task?.budget.amount).toBe(2_000_000);
		expect(task?.budget.currency).toBe('SATS');
		expect(visibleWorkerTasks([task as Task], QA_DAY).map((item) => item.id)).toEqual([row.d]);
	});

	it('filters the category tiles without dropping the unfiltered list', () => {
		const cleaning = parsed.find((task) => task.title.startsWith('Limpieza')) as Task;
		expect(tasksInCategory(parsed, '').map((task) => task.id)).toHaveLength(parsed.length);
		expect(tasksInCategory([cleaning], 'cleaning').map((task) => task.id)).toEqual([cleaning.id]);
		expect(tasksInCategory([cleaning], 'development')).toEqual([]);
	});

	it('reads past a full page of newest [TEST] tasks to older open tasks', async () => {
		const calls: Array<number | undefined> = [];
		const rows = await scanCatalogUntilLive({
			pageSize: 2,
			maxPages: 4,
			fetchPage: async (until) => {
				calls.push(until);
				if (until == null) {
					return {
						items: [
							{
								id: 'test-pintar-una-habitacion-en-santa-ana-1792679250',
								createdAt: 1792679244
							},
							{
								id: 'test-reparar-una-puerta-en-suchitoto-1792679249',
								createdAt: 1792679244
							}
						],
						filled: true,
						oldestCreatedAt: 1792679244
					};
				}
				return {
					items: [
						{
							id: 'task-82dcb53a-ae28-4507-a26f-8ccf65727de0',
							createdAt: 1762270928
						}
					],
					filled: false,
					oldestCreatedAt: 1762270928
				};
			},
			hasLive: catalogScanIsComplete
		});
		expect(catalogScanIsComplete()).toBe(false);
		expect(calls).toEqual([undefined, 1792679243]);
		expect(rows.map((row) => row.id)).toContain('task-82dcb53a-ae28-4507-a26f-8ccf65727de0');
	});

	it('keeps every open task from a full relay page, including past deadlines and low prices', () => {
		const openCount = 200;
		const events: Event[] = [];
		for (let index = 0; index < openCount; index += 1) {
			const pubkey = index.toString(16).padStart(64, 'a');
			events.push({
				id: index.toString(16).padStart(64, 'b'),
				pubkey,
				created_at: 1_700_000_000 - index,
				kind: 31000,
				sig: '',
				tags: [['d', `task-${index}`]],
				content: JSON.stringify({
					title: `Pintar habitacion ${index}`,
					description: 'Trabajo abierto en el catalogo',
					status: 'OPEN',
					taskType: 'onsite',
					budget: {
						amount: index % 17 === 0 ? 0.4 : 25,
						currency: 'USD',
						type: 'FIXED'
					},
					deadline: index % 2 === 0 ? '2024-03-01T00:00:00.000Z' : '2027-06-01T00:00:00.000Z',
					pickupLocation: { displayName: 'Santa Ana, El Salvador' }
				})
			});
		}
		events.push({
			id: 'c'.repeat(64),
			pubkey: 'd'.repeat(64),
			created_at: 1_600_000_000,
			kind: 31000,
			sig: '',
			tags: [['d', 'closed-task']],
			content: JSON.stringify({
				title: 'Trabajo cerrado',
				description: 'Ya no esta abierto',
				status: 'COMPLETED',
				budget: { amount: 40, currency: 'USD', type: 'FIXED' },
				deadline: '2027-01-01T00:00:00.000Z'
			})
		});
		events.push({
			id: 'e'.repeat(64),
			pubkey: 'f'.repeat(64),
			created_at: 1_600_000_001,
			kind: 31000,
			sig: '',
			tags: [['d', 'probe-task']],
			content: JSON.stringify({
				title: 'client-probe',
				description: 'probe',
				status: 'OPEN',
				budget: { amount: 20, currency: 'USD', type: 'FIXED' }
			})
		});
		const parsed = events.flatMap((event) => {
			const task = parseTaskEvent(event);
			return task ? [task] : [];
		});
		const visible = visibleWorkerTasks(parsed, QA_DAY);
		expect(parsed).toHaveLength(openCount + 2);
		expect(visible.map((task) => task.id).sort()).toEqual(
			Array.from({ length: openCount }, (_, index) => `task-${index}`).sort()
		);
		expect(tasksInCategory(visible, '').length).toBe(openCount);
	});
});
