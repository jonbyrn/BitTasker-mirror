import { describe, expect, it, vi } from 'vitest';
import {
	fetchCatalogEvents,
	fixtureRemovals,
	httpOriginForPrefix
} from '$lib/search/http-catalog.js';

describe('relay http catalog', () => {
	it('points dev and rgb at their relay HTTP origins', () => {
		expect(httpOriginForPrefix('dev_')).toBe('https://relay2-dev.bittasker.com');
		expect(httpOriginForPrefix('rgb_')).toBe('https://relay.bittasker.com');
		expect(httpOriginForPrefix('')).toBe('');
	});

	it('names the four hand-made fixtures for a prefix', () => {
		expect(
			fixtureRemovals('dev_')
				.map((action) => action.id)
				.filter(Boolean)
		).toEqual([
			'test-dev-tasks-0',
			'test-dev-tasks-1',
			'test-dev-services-0',
			'test-dev-services-1'
		]);
		expect(fixtureRemovals('rgb_').some((action) => action.id === 'test-rgb-tasks-0')).toBe(true);
		expect(fixtureRemovals('')).toEqual([]);
	});

	it('pages /api/v1/events with until and keeps one copy of each id', async () => {
		const page = Array.from({ length: 100 }, (_, index) => ({
			id: index === 99 ? 'bb' : `e${index}`,
			created_at: 1000 - index,
			kind: 31000
		}));
		page.push({ id: 'bb', created_at: 901, kind: 31000 });
		const fetchImpl = vi.fn(async (url: URL) => {
			const until = url.searchParams.get('until');
			const data = until ? [{ id: 'older', created_at: 1, kind: 31000 }] : page;
			return new Response(JSON.stringify({ data }), { status: 200 });
		});
		const events = await fetchCatalogEvents(
			'https://relay2-dev.bittasker.com',
			31000,
			fetchImpl as unknown as typeof fetch
		);
		expect(events.some((event) => event.id === 'bb')).toBe(true);
		expect(events.filter((event) => event.id === 'bb')).toHaveLength(1);
		expect(events.at(-1)?.id).toBe('older');
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		const second = fetchImpl.mock.calls[1][0] as URL;
		expect(second.pathname).toBe('/api/v1/events');
		expect(second.searchParams.get('kinds')).toBe('31000');
		expect(second.searchParams.get('until')).toBe('900');
	});
});
