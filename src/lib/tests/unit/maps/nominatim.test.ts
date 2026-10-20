import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveListingPoint, serviceToListingPlace } from '$lib/utils/maps/listing-markers';
import {
	NOMINATIM_NEGATIVE_TTL_MS,
	NOMINATIM_TTL_MS,
	NOMINATIM_USER_AGENT,
	forgetNominatimMemory,
	resetNominatimForTests,
	whenNominatimSettled
} from '$lib/utils/maps/nominatim';

class MemoryStorage {
	private readonly values = new Map<string, string>();
	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

function json(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

afterEach(() => {
	resetNominatimForTests();
});

describe('nominatim listing geocoder', () => {
	it('keeps stored coordinates and the gazetteer seed without calling Nominatim', async () => {
		const fetchMock = vi.fn();
		resetNominatimForTests({ fetch: fetchMock as typeof fetch });

		const seeded = resolveListingPoint(
			serviceToListingPlace({
				id: 'svc-1',
				serviceLocationTypes: ['tasker_location'],
				locationDetails: {
					taskerLocation: {
						locationDisplayName: 'La Libertad, El Salvador',
						serviceLocation: {
							displayName: 'La Libertad, El Salvador',
							latitude: null,
							longitude: null
						}
					}
				}
			})
		);
		const stored = resolveListingPoint({
			id: 'equator',
			labels: ['Gulf of Guinea'],
			coordinates: [{ latitude: 0, longitude: 0 }],
			remoteOnly: false
		});

		await whenNominatimSettled();
		expect(seeded?.source).toBe('gazetteer');
		expect(stored?.latitude).toBe(0);
		expect(stored?.source).toBe('stored');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('geocodes unknown place text, rate-limits to one request per second, and caches hits, misses, and storage', async () => {
		let clock = 1_000;
		const starts: number[] = [];
		const storage = new MemoryStorage();
		resetNominatimForTests({
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
			storage,
			referer: 'https://bittasker.com/',
			userAgent: NOMINATIM_USER_AGENT,
			fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
				starts.push(clock);
				const headers = new Headers(init?.headers);
				expect(headers.get('User-Agent')).toBe(NOMINATIM_USER_AGENT);
				expect(headers.get('Referer')).toBe('https://bittasker.com/');
				expect(init?.referrer).toBe('https://bittasker.com/');
				const url = String(input);
				expect(url.startsWith('https://nominatim.openstreetmap.org/search')).toBe(true);
				if (url.includes('Nowhere')) return json([]);
				if (url.includes('Cali')) return json([{ lat: '3.4516', lon: '-76.532' }]);
				return json([{ lat: '6.2442', lon: '-75.5812' }]);
			}) as typeof fetch
		});

		const medellin = {
			id: 'medellin',
			labels: ['Medellín, Colombia'],
			coordinates: [] as [],
			remoteOnly: false
		};
		const cali = {
			id: 'cali',
			labels: ['Cali, Colombia'],
			coordinates: [] as [],
			remoteOnly: false
		};
		const missing = {
			id: 'missing',
			labels: ['Nowhereville'],
			coordinates: [] as [],
			remoteOnly: false
		};

		expect(resolveListingPoint(medellin)).toBeNull();
		expect(resolveListingPoint(medellin)).toBeNull();
		expect(resolveListingPoint(cali)).toBeNull();
		expect(resolveListingPoint(missing)).toBeNull();
		await whenNominatimSettled();

		expect(starts).toEqual([1_000, 2_000, 3_000]);
		expect(resolveListingPoint(medellin)).toMatchObject({
			source: 'nominatim',
			latitude: 6.2442,
			longitude: -75.5812
		});
		expect(resolveListingPoint(missing)).toBeNull();
		expect(starts).toHaveLength(3);

		forgetNominatimMemory();
		expect(resolveListingPoint(medellin)?.latitude).toBeCloseTo(6.2442, 3);
		expect(resolveListingPoint(missing)).toBeNull();
		expect(starts).toHaveLength(3);
	});

	it('replaces a San Salvador fallback coordinate once Nominatim knows the city', async () => {
		resetNominatimForTests({
			sleep: async () => undefined,
			fetch: (async () => json([{ lat: '6.2442', lon: '-75.5812' }])) as typeof fetch
		});
		const place = {
			id: 'stale',
			labels: ['Medellín, Colombia'],
			coordinates: [{ latitude: 13.6929, longitude: -89.2182, displayName: 'Medellín, Colombia' }],
			remoteOnly: false
		};
		expect(resolveListingPoint(place)).toBeNull();
		await whenNominatimSettled();
		expect(resolveListingPoint(place)?.source).toBe('nominatim');
		expect(resolveListingPoint(place)?.latitude).toBeCloseTo(6.2442, 3);
	});

	it('expires cached negatives and asks again after the negative TTL', async () => {
		let clock = 0;
		let calls = 0;
		resetNominatimForTests({
			now: () => clock,
			negativeTtlMs: 1_000,
			sleep: async () => undefined,
			fetch: (async () => {
				calls += 1;
				return json([]);
			}) as typeof fetch
		});
		const place = {
			id: 'atlantis',
			labels: ['Atlantis'],
			coordinates: [] as [],
			remoteOnly: false
		};
		expect(resolveListingPoint(place)).toBeNull();
		await whenNominatimSettled();
		expect(resolveListingPoint(place)).toBeNull();
		expect(calls).toBe(1);

		clock = 1_001;
		expect(resolveListingPoint(place)).toBeNull();
		await whenNominatimSettled();
		expect(calls).toBe(2);
	});

	it('caches a miss for 1 day and a hit for 30 days', async () => {
		expect(NOMINATIM_NEGATIVE_TTL_MS).toBe(24 * 60 * 60 * 1000);
		expect(NOMINATIM_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);

		let clock = 0;
		const calls: string[] = [];
		resetNominatimForTests({
			now: () => clock,
			intervalMs: 0,
			sleep: async () => undefined,
			fetch: (async (input: RequestInfo | URL) => {
				const query = new URL(String(input)).searchParams.get('q') ?? '';
				calls.push(query);
				if (query === 'Medellín') return json([{ lat: '6.2442', lon: '-75.5812' }]);
				return json([]);
			}) as typeof fetch
		});
		const miss = {
			id: 'atlantis',
			labels: ['Atlantis'],
			coordinates: [] as [],
			remoteOnly: false
		};
		const hit = {
			id: 'medellin',
			labels: ['Medellín'],
			coordinates: [] as [],
			remoteOnly: false
		};

		expect(resolveListingPoint(miss)).toBeNull();
		expect(resolveListingPoint(hit)).toBeNull();
		await whenNominatimSettled();
		expect(resolveListingPoint(hit)?.latitude).toBeCloseTo(6.2442, 3);
		expect(calls).toEqual(['Atlantis', 'Medellín']);

		clock = NOMINATIM_NEGATIVE_TTL_MS;
		expect(resolveListingPoint(hit)?.source).toBe('nominatim');
		expect(resolveListingPoint(miss)).toBeNull();
		await whenNominatimSettled();
		expect(calls.filter((query) => query === 'Atlantis')).toHaveLength(2);
		expect(calls.filter((query) => query === 'Medellín')).toHaveLength(1);

		clock = NOMINATIM_TTL_MS;
		expect(resolveListingPoint(hit)).toBeNull();
		await whenNominatimSettled();
		expect(calls.filter((query) => query === 'Medellín')).toHaveLength(2);
	});
});
