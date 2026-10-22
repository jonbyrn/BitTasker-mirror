import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { visibleWorkerTasks } from '$lib/browse/task-board';

vi.mock('$lib/nostr/relayQuery', () => ({
	queryRelayEvents: vi.fn()
}));

vi.mock('$lib/nostr/listing-relays', async () => {
	const actual = await vi.importActual<typeof import('$lib/nostr/listing-relays')>(
		'$lib/nostr/listing-relays'
	);
	return {
		...actual,
		listingRelayUrls: vi.fn(() => ['wss://relay.bittasker.com', 'wss://relay2.bittasker.com'])
	};
});

import { queryRelayEvents } from '$lib/nostr/relayQuery';
import { readTaskCatalog, resetSharedCatalog } from '$lib/browse/shared-catalog';

const RELAY_A = 'wss://relay.bittasker.com';
const RELAY_B = 'wss://relay2.bittasker.com';
const TARGET = 'task-82dcb53a-ae28-4507-a26f-8ccf65727de0';
const QA_DAY = new Date('2026-10-22T21:00:00Z');

function taskEvent(id: string, pubkey: string, createdAt: number, d: string, title: string): Event {
	return {
		id,
		pubkey,
		created_at: createdAt,
		kind: 31000,
		sig: '',
		tags: [['d', d]],
		content: JSON.stringify({
			title,
			description: title,
			status: 'OPEN',
			taskType: 'onsite',
			budget: { amount: 22.99, currency: 'USD', type: 'FIXED' },
			deadline: '2026-11-04T00:00:00.000Z'
		})
	};
}

function pageOf(events: Event[], until: number | undefined, limit: number): Event[] {
	return events
		.filter((event) => until == null || event.created_at <= until)
		.sort((left, right) => right.created_at - left.created_at)
		.slice(0, limit);
}

describe('task catalog until paging', () => {
	beforeEach(() => {
		resetSharedCatalog();
		vi.mocked(queryRelayEvents).mockReset();
	});

	it('keeps an older relay.bittasker.com task that a shared 200-slice would skip', async () => {
		const relayA: Event[] = [];
		const relayB: Event[] = [];
		for (let index = 0; index < 200; index += 1) {
			relayB.push(
				taskEvent(
					index.toString(16).padStart(64, 'b'),
					'b'.repeat(64),
					1_770_000_000 - index,
					`relay2-${index}`,
					`Relay two task ${index}`
				)
			);
		}
		for (let index = 0; index < 210; index += 1) {
			relayA.push(
				taskEvent(
					index.toString(16).padStart(64, 'a'),
					'a'.repeat(64),
					1_764_000_000 - index,
					index === 10 ? TARGET : `relay1-${index}`,
					index === 10 ? 'Crear componente de tabla editable' : `Relay one task ${index}`
				)
			);
		}
		relayA.push(
			taskEvent(
				'c'.repeat(64),
				'c'.repeat(64),
				1_792_679_244,
				'test-pintar-una-habitacion-en-santa-ana-1792679250',
				'[TEST] Pintar una habitacion en Santa Ana'
			)
		);

		vi.mocked(queryRelayEvents).mockImplementation(async (relays, filter) => {
			const source = relays[0] === RELAY_B ? relayB : relayA;
			const limit = typeof filter?.limit === 'number' ? filter.limit : 200;
			return pageOf(source, (filter as Filter | undefined)?.until, limit);
		});

		const rows = await readTaskCatalog();
		const ids = rows.map((row) => row.id);

		expect(ids).toContain(TARGET);
		expect(ids).toContain('test-pintar-una-habitacion-en-santa-ana-1792679250');
		expect(visibleWorkerTasks(rows, QA_DAY).map((row) => row.id)).toContain(TARGET);
		expect(visibleWorkerTasks(rows, QA_DAY).some((row) => row.title.startsWith('[TEST]'))).toBe(
			false
		);

		const calls = vi.mocked(queryRelayEvents).mock.calls;
		expect(calls.some((call) => call[0]?.[0] === RELAY_A && call[1]?.until == null)).toBe(true);
		expect(calls.some((call) => call[0]?.[0] === RELAY_A && call[1]?.until != null)).toBe(true);
		expect(calls.some((call) => call[0]?.[0] === RELAY_B && call[1]?.until == null)).toBe(true);
	});

	it('keeps the newest event when one pubkey reuses a d-tag', async () => {
		const pubkey = 'd'.repeat(64);
		const older = taskEvent('1'.repeat(64), pubkey, 100, 'same-d', 'Older copy');
		const newer = taskEvent('2'.repeat(64), pubkey, 500, 'same-d', 'Newer copy');
		vi.mocked(queryRelayEvents).mockImplementation(async (relays) => {
			return relays[0] === RELAY_A ? [older] : [newer];
		});

		const rows = await readTaskCatalog();

		expect(rows.map((row) => `${row.npub}:${row.id}:${row.title}`)).toEqual([
			`${pubkey}:same-d:Newer copy`
		]);
	});
});
